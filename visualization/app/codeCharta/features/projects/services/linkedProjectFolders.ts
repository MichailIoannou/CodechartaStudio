import { Injectable, inject, Provider } from "@angular/core"
import type { FileMeta } from "../../../model/codeCharta.model"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { ProjectSnapshotOrigin } from "../../../model/projectSnapshot.model"
import { GitRepositoryService, isGitStatus } from "../../gitHistory/facade"
import { LINKED_SOURCE_FOLDERS, LinkedSourceFolder, LinkedSourceFolders } from "../../localSource/facade"
import { FolderRelinkRequests } from "./folderRelinkRequests.service"
import { ProjectsService } from "./projects.service"

const CURRENT_FILE = "This is the file as it is in the folder now"

/** Design P12: a project map reads its source from the folder on disk, which may differ from what the map shows. */
@Injectable({ providedIn: "root" })
export class LinkedProjectFolders implements LinkedSourceFolders {
    private readonly projects = inject(ProjectsService)
    private readonly gitRepository = inject(GitRepositoryService)
    private readonly relinkRequests = inject(FolderRelinkRequests)

    folderOf({ projectSnapshot: origin }: FileMeta): LinkedSourceFolder | null {
        if (!origin) {
            return null
        }
        const project = this.projects.activeProject()
        const folder = project?.id === origin.projectId ? project.folders.find(candidate => candidate.id === origin.folderId) : undefined
        if (folder?.status !== "ok") {
            return { status: "unavailable", label: origin.folderLabel, relink: folder ? () => this.askToRelink(folder) : null }
        }
        return {
            status: "available",
            rootPath: folder.path,
            stateNote: this.stateNoteOf(origin),
            readFile: relativePath => this.readFile(origin, relativePath)
        }
    }

    private askToRelink(folder: ProjectFolder) {
        this.relinkRequests.ask({ id: folder.id, label: folder.label })
    }

    /** No note while the map follows the current checkout, uncommitted changes included. */
    private stateNoteOf(origin: ProjectSnapshotOrigin): string | null {
        const snapshotsOfFolder = this.projects.snapshotsByFolder()[origin.folderId] ?? []
        const snapshot = snapshotsOfFolder.find(candidate => candidate.ref.snapshotId === origin.snapshotId)
        if (snapshot?.source === "imported") {
            return `${CURRENT_FILE}, not as it was analysed.`
        }
        const status = this.gitRepository.statusOf(origin)
        const head = isGitStatus(status) ? status.head.commit : null
        const analysedCommit = snapshot?.commit ?? null
        const isOtherCommit = head !== null && analysedCommit !== null && analysedCommit !== head
        return isOtherCommit ? `${CURRENT_FILE}, not at ${snapshot?.shortCommit}.` : null
    }

    private async readFile({ projectId, folderId }: ProjectSnapshotOrigin, relativePath: string): Promise<File | null> {
        const bytes = await this.projects.readSourceFile({ projectId, folderId }, relativePath)
        return bytes && new File([new Uint8Array(bytes)], relativePath.split("/").at(-1) ?? relativePath)
    }
}

export function provideLinkedProjectFolders(): Provider[] {
    return [{ provide: LINKED_SOURCE_FOLDERS, useExisting: LinkedProjectFolders }]
}
