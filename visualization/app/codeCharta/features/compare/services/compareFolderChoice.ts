import { computed, Injectable, inject, signal } from "@angular/core"
import { ProjectsFacade } from "../../projects/facade"
import type { FolderRef } from "../model/compare.model"
import { snapshotOptionsOf } from "./snapshotSides"

const sameFolderRef = (first: FolderRef | null, second: FolderRef | null) =>
    first?.projectId === second?.projectId && first?.folderId === second?.folderId

/** The compare dialog's folder row: the base folder and, across two folders, the head folder, with what each side can pick. */
@Injectable()
export class CompareFolderChoice {
    private readonly projects = inject(ProjectsFacade)

    readonly folderId = signal("")
    readonly isAcrossFolders = signal(false)
    readonly chosenHeadFolderId = signal("")

    readonly gitFolders = computed(() => (this.projects.activeProject()?.folders ?? []).filter(folder => folder.kind === "git"))
    readonly folder = computed(() => this.gitFolders().find(candidate => candidate.id === this.folderId()) ?? null)
    readonly repo = computed<FolderRef | null>(() => this.folderRefOf(this.folder()?.id), { equal: sameFolderRef })
    readonly otherGitFolders = computed(() => this.gitFolders().filter(candidate => candidate.id !== this.folderId()))
    readonly headFolder = computed(() => {
        const others = this.otherGitFolders()
        return this.isAcrossFolders() ? (others.find(candidate => candidate.id === this.chosenHeadFolderId()) ?? others[0] ?? null) : null
    })
    readonly headRepo = computed<FolderRef | null>(() => this.folderRefOf((this.headFolder() ?? this.folder())?.id), {
        equal: sameFolderRef
    })
    readonly baseSnapshots = computed(() => snapshotOptionsOf(this.projects.snapshotsByFolder()[this.folderId()] ?? []))
    readonly headSnapshots = computed(() => snapshotOptionsOf(this.projects.snapshotsByFolder()[this.headRepo()?.folderId ?? ""] ?? []))
    readonly defaultBranch = computed(() => this.folder()?.git?.defaultBranch ?? null)
    readonly headDefaultBranch = computed(() => (this.headFolder() ?? this.folder())?.git?.defaultBranch ?? null)

    /** The given folder, else the working folder when it is a git folder, else the first git folder. */
    prefill(folderId: string | undefined, headFolderId: string | undefined): void {
        const working = this.projects.workingFolder()
        const preferred = folderId ?? (working?.kind === "git" ? working.id : this.gitFolders()[0]?.id)
        this.folderId.set(preferred ?? "")
        this.chooseAcross(headFolderId)
    }

    /** A head folder other than the base folder turns on the comparison across two folders. */
    chooseAcross(headFolderId: string | undefined): void {
        const isOtherFolder = headFolderId !== undefined && headFolderId !== this.folderId()
        this.isAcrossFolders.set(isOtherFolder)
        this.chosenHeadFolderId.set(isOtherFolder ? headFolderId : "")
    }

    private folderRefOf(folderId: string | undefined): FolderRef | null {
        const projectId = this.projects.activeProject()?.id
        return projectId && folderId ? { projectId, folderId } : null
    }
}
