import { Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import { PROJECT_ROOT_NAME } from "../../../stores/fileStore/fileStore.facade"
import { GitRepositoryService, LoadedMapLocator } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { LoadedMapReadStore } from "../stores/loadedMap.read.store"

/**
 * Finds a changed file of the History in the map: while a snapshot of that folder is shown, a repository-relative path
 * inside the folder is `/root/<path within the folder>`, when the map has that node.
 */
@Injectable({ providedIn: "root" })
export class SnapshotMapLocator implements LoadedMapLocator {
    private readonly projects = inject(ProjectsFacade)
    private readonly repository = inject(GitRepositoryService)
    private readonly loadedMap = inject(LoadedMapReadStore)

    nodePathOf(repo: FolderRef, repositoryRelativePath: string): string | null {
        const shown = this.projects.shownSnapshot()?.ref
        if (shown?.projectId !== repo.projectId || shown.folderId !== repo.folderId) {
            return null
        }
        const pathInFolder = this.pathInFolder(repo, repositoryRelativePath)
        const nodePath = pathInFolder === null ? null : `/${PROJECT_ROOT_NAME}/${pathInFolder}`
        return nodePath !== null && this.loadedMap.pathToNode()?.has(nodePath) ? nodePath : null
    }

    /** Null for a path outside the folder, or while the folder's place in its repository is not known. */
    private pathInFolder(repo: FolderRef, repositoryRelativePath: string): string | null {
        const active = this.repository.activeRepository()
        const info = this.repository.repository()
        if (active?.folderId !== repo.folderId || info.kind !== "ready") {
            return null
        }
        const prefix = info.value.folderPrefix
        if (prefix === "") {
            return repositoryRelativePath
        }
        return repositoryRelativePath.startsWith(`${prefix}/`) ? repositoryRelativePath.slice(prefix.length + 1) : null
    }
}
