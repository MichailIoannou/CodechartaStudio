import { Injectable, inject, signal } from "@angular/core"
import { CodeMapNode, FileMeta } from "../../../model/codeCharta.model"
import { isPartialState } from "../../../model/files/files.helper"
import { FileStoreReadWindow } from "../../../stores/fileStore/fileStore.facade"
import { getTopLevelMapName } from "../../../util/nodePathHelper"
import { ToastService } from "../../shared/facade"
import { LINKED_SOURCE_FOLDERS, LinkedSourceFolder } from "../ports/linkedSourceFolders.port"
import {
    canOpenFoldersHere,
    FolderAccessBlockedError,
    findFile,
    hasReadPermission,
    LocalDirectoryHandle,
    pickFolder
} from "./fileSystemAccess"
import { LocalSourceAvailability } from "./localSourceAvailability"
import { LocalSourceFolder, LocalSourceFoldersRepository } from "./localSourceFolders.repository"
import { relativePathOf, sampleFilePaths } from "./localSourcePaths"

const FIT_CHECK_SAMPLE_SIZE = 20
const MIN_SHARE_OF_FITTING_SAMPLES = 0.5

type FolderRefusal = { status: "cancelled" } | { status: "blocked" } | { status: "doesNotFitMap" }

export type FolderUnavailable = { status: "folderUnavailable"; folderLabel: string; relink: (() => void) | null }

export type FolderChoice = { status: "chosen"; folder: LocalSourceFolder } | FolderRefusal

export type SourceLookup =
    | { status: "found"; file: File; folder: LocalSourceFolder; relativePath: string; stateNote: string | null }
    | { status: "notFound"; relativePath: string }
    /** Asking the browser for a folder needs a click of its own, so the caller explains first and then chooses. */
    | { status: "folderNeeded"; mapFileName: string; relativePath: string; missingFrom: string | null }
    | FolderUnavailable
    | FolderRefusal

export interface LocalFolderDescription {
    folderName: string | null
    editorRootPath: string | null
}

export interface EditorTarget {
    mapFileName: string
    relativePath: string
    editorRootPath: string | null
}

const FORGETTING_FAILED_MESSAGE = "The local folder of a removed map could not be forgotten"

interface MapLocation {
    mapFileName: string
    fileMeta: FileMeta
    map: CodeMapNode
    relativePath: string
}

type AvailableLinkedFolder = Extract<LinkedSourceFolder, { status: "available" }>
type UnavailableLinkedFolder = Extract<LinkedSourceFolder, { status: "unavailable" }>

@Injectable({ providedIn: "root" })
export class LocalSourceService {
    private readonly fileStoreReadWindow = inject(FileStoreReadWindow)
    private readonly repository = inject(LocalSourceFoldersRepository)
    private readonly availability = inject(LocalSourceAvailability)
    private readonly linkedFolders = inject(LINKED_SOURCE_FOLDERS)
    private readonly toast = inject(ToastService)

    private readonly changeCount = signal(0)

    readonly isAvailable = this.availability.isAvailable
    readonly folderChanges = this.changeCount.asReadonly()

    offersFolderSettings(nodePath: string): boolean {
        const location = this.locate(nodePath)
        return location?.relativePath === "" && this.canChooseFolderFor(location.mapFileName)
    }

    canChooseFolderFor(mapFileName: string): boolean {
        const fileState = this.loadedFileStateOf(mapFileName)
        const hasLinkedFolder = fileState !== undefined && this.linkedFolders.folderOf(fileState.file.fileMeta) !== null
        return this.availability.canChooseFolders() && !hasLinkedFolder
    }

    async findSource(nodePath: string): Promise<SourceLookup> {
        const location = this.locate(nodePath)
        if (!location) {
            return { status: "notFound", relativePath: nodePath }
        }
        const linkedFolder = this.linkedFolders.folderOf(location.fileMeta)
        if (linkedFolder) {
            return linkedFolder.status === "available" ? findInLinkedFolder(linkedFolder, location) : unavailable(linkedFolder)
        }
        return this.findInSavedFolder(location)
    }

    private async findInSavedFolder(location: MapLocation): Promise<SourceLookup> {
        const savedFolder = await this.readableSavedFolder(location.mapFileName)
        const file = savedFolder && (await findFile(savedFolder.directory, location.relativePath))
        if (file) {
            return { status: "found", file, folder: savedFolder, relativePath: location.relativePath, stateNote: null }
        }
        return {
            status: "folderNeeded",
            mapFileName: location.mapFileName,
            relativePath: location.relativePath,
            missingFrom: savedFolder?.directory.name ?? null
        }
    }

    async chooseFolderAndFindSource(nodePath: string): Promise<SourceLookup> {
        const location = this.locate(nodePath)
        return location ? this.findSourceInChosenFolder(location) : { status: "notFound", relativePath: nodePath }
    }

    async chooseFolder(nodePath: string): Promise<FolderChoice> {
        const location = this.locate(nodePath)
        return location ? this.chooseFolderFor(location) : { status: "cancelled" }
    }

    async chooseFolderForMap(mapFileName: string): Promise<FolderChoice> {
        const fileState = this.loadedFileStateOf(mapFileName)
        return fileState
            ? this.chooseFolderFor({ mapFileName, fileMeta: fileState.file.fileMeta, map: fileState.file.map, relativePath: "" })
            : { status: "cancelled" }
    }

    async describeFolder(mapFileName: string): Promise<LocalFolderDescription | null> {
        const folder = await this.repository.find(mapFileName)
        return folder && { folderName: folder.directory?.name ?? null, editorRootPath: folder.editorRootPath }
    }

    /** Also while the feature is switched off: what a removed project left behind must not stay in the browser. */
    async forgetFoldersOf(mapFileNames: string[]): Promise<void> {
        if (mapFileNames.length > 0 && canOpenFoldersHere()) {
            await this.forgettingFolders(() => Promise.all(mapFileNames.map(mapFileName => this.repository.delete(mapFileName))))
        }
    }

    async forgetAllFolders(): Promise<void> {
        if (canOpenFoldersHere()) {
            await this.forgettingFolders(() => this.repository.deleteAll())
        }
    }

    async editorTargetOf(nodePath: string): Promise<EditorTarget | FolderUnavailable | null> {
        const location = this.locate(nodePath)
        if (!location) {
            return null
        }
        const { mapFileName, relativePath } = location
        const linkedFolder = this.linkedFolders.folderOf(location.fileMeta)
        if (linkedFolder) {
            return linkedFolder.status === "available"
                ? { mapFileName, relativePath, editorRootPath: linkedFolder.rootPath }
                : unavailable(linkedFolder)
        }
        const folder = await this.repository.find(mapFileName)
        return { mapFileName, relativePath, editorRootPath: folder?.editorRootPath ?? null }
    }

    async saveEditorRootPath(mapFileName: string, editorRootPath: string): Promise<void> {
        await this.repository.update(mapFileName, { editorRootPath })
        this.markFoldersChanged()
    }

    private async findSourceInChosenFolder(location: MapLocation): Promise<SourceLookup> {
        const choice = await this.chooseFolderFor(location)
        if (choice.status !== "chosen") {
            return choice
        }
        const { relativePath } = location
        const file = await findFile(choice.folder.directory, relativePath)
        return file ? { status: "found", file, folder: choice.folder, relativePath, stateNote: null } : { status: "notFound", relativePath }
    }

    private async chooseFolderFor({ mapFileName, map }: MapLocation): Promise<FolderChoice> {
        const directory = await this.pickFolderReportingBlocks()
        if ("status" in directory) {
            return directory
        }
        if (!(await fitsMap(directory, map))) {
            return { status: "doesNotFitMap" }
        }
        const folder = await this.repository.update(mapFileName, { directory })
        this.markFoldersChanged()
        return { status: "chosen", folder }
    }

    /** Removing the project goes on regardless, so a failure here is reported instead of stopping it. */
    private async forgettingFolders(forget: () => Promise<unknown>): Promise<void> {
        try {
            await forget()
            this.markFoldersChanged()
        } catch {
            this.toast.show(FORGETTING_FAILED_MESSAGE, "warning")
        }
    }

    private async pickFolderReportingBlocks(): Promise<LocalDirectoryHandle | FolderRefusal> {
        try {
            return (await pickFolder()) ?? { status: "cancelled" }
        } catch (error) {
            if (!(error instanceof FolderAccessBlockedError)) {
                throw error
            }
            this.availability.reportBlocked()
            return { status: "blocked" }
        }
    }

    private markFoldersChanged() {
        this.changeCount.update(count => count + 1)
    }

    private async readableSavedFolder(mapFileName: string): Promise<LocalSourceFolder | null> {
        const folder = await this.repository.find(mapFileName)
        return folder?.directory && (await hasReadPermission(folder.directory)) ? folder : null
    }

    private loadedFileStateOf(mapFileName: string) {
        return this.fileStoreReadWindow.getFiles().find(loadedFileState => loadedFileState.file.fileMeta.fileName === mapFileName)
    }

    private locate(nodePath: string): MapLocation | null {
        const visibleFileStates = this.fileStoreReadWindow.getVisibleFileStates()
        const areMultipleMapsVisible = visibleFileStates.length > 1 && isPartialState(visibleFileStates)
        const mapFileName = areMultipleMapsVisible ? getTopLevelMapName(nodePath) : visibleFileStates[0]?.file.fileMeta.fileName
        const fileState = visibleFileStates.find(visibleFileState => visibleFileState.file.fileMeta.fileName === mapFileName)
        if (!fileState) {
            return null
        }
        return {
            mapFileName,
            fileMeta: fileState.file.fileMeta,
            map: fileState.file.map,
            relativePath: relativePathOf(nodePath, areMultipleMapsVisible ? mapFileName : null)
        }
    }
}

async function findInLinkedFolder(folder: AvailableLinkedFolder, { mapFileName, relativePath }: MapLocation): Promise<SourceLookup> {
    const file = await folder.readFile(relativePath)
    if (!file) {
        return { status: "notFound", relativePath }
    }
    const linkedFolder = { mapKey: mapFileName, directory: null, editorRootPath: folder.rootPath }
    return { status: "found", file, folder: linkedFolder, relativePath, stateNote: folder.stateNote }
}

function unavailable({ label, relink }: UnavailableLinkedFolder): FolderUnavailable {
    return { status: "folderUnavailable", folderLabel: label, relink }
}

async function fitsMap(directory: LocalDirectoryHandle, map: CodeMapNode): Promise<boolean> {
    const samples = sampleFilePaths(map, FIT_CHECK_SAMPLE_SIZE)
    const foundFiles = await Promise.all(samples.map(samplePath => findFile(directory, samplePath)))
    const fittingSamples = foundFiles.filter(file => file !== null).length
    return fittingSamples >= Math.max(1, samples.length * MIN_SHARE_OF_FITTING_SAMPLES)
}
