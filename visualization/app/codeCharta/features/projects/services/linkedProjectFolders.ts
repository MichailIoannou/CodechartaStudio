import { Injectable, inject, Provider } from "@angular/core"
import type { FileMeta } from "../../../model/codeCharta.model"
import type { ProjectSnapshotOrigin } from "../../../model/projectSnapshot.model"
import { LINKED_SOURCE_FOLDERS, LinkedSourceFolder, LinkedSourceFolders } from "../../localSource/facade"
import { ProjectFoldersService } from "./projectFolders.service"
import { ProjectsService } from "./projects.service"

@Injectable({ providedIn: "root" })
export class LinkedProjectFolders implements LinkedSourceFolders {
    private readonly projects = inject(ProjectsService)
    private readonly projectFolders = inject(ProjectFoldersService)

    folderOf({ projectSnapshot: origin }: FileMeta): LinkedSourceFolder | null {
        if (!origin) {
            return null
        }
        const project = this.projects.activeProject()
        const folder = project?.id === origin.projectId ? project.folders.find(candidate => candidate.id === origin.folderId) : undefined
        if (folder?.status !== "ok") {
            return { status: "unavailable", label: origin.folderLabel }
        }
        return { status: "available", rootPath: folder.path, readFile: relativePath => this.readFile(origin, relativePath) }
    }

    private async readFile({ projectId, folderId }: ProjectSnapshotOrigin, relativePath: string): Promise<File | null> {
        const bytes = await this.projectFolders.readSourceFile({ projectId, folderId }, relativePath)
        return bytes && new File([new Uint8Array(bytes)], relativePath.split("/").at(-1) ?? relativePath)
    }
}

export function provideLinkedProjectFolders(): Provider[] {
    return [{ provide: LINKED_SOURCE_FOLDERS, useExisting: LinkedProjectFolders }]
}
