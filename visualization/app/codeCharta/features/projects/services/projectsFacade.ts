import { computed, Injectable, inject } from "@angular/core"
import type { ProjectSnapshotsLoadResult } from "../../../load/load.facade"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { HostingOverride } from "../../../model/coreApi/HostingOverride"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import { FolderMenuRequestsService } from "./folderMenuRequests.service"
import { ProjectFoldersService } from "./projectFolders.service"
import { FolderChoice, ProjectsService } from "./projects.service"

@Injectable({ providedIn: "root" })
export class ProjectsFacade {
    private readonly projects = inject(ProjectsService)
    private readonly projectFolders = inject(ProjectFoldersService)
    private readonly folderMenuRequests = inject(FolderMenuRequestsService)

    readonly isDesktop = this.projects.isDesktop
    readonly activeProject = this.projects.activeProject
    readonly workingFolder = this.projects.workingFolder
    readonly hasActiveProject = computed(() => this.projects.activeProject() !== null)
    readonly snapshotsByFolder = this.projects.snapshotsByFolder
    readonly shownSnapshot = this.projects.shownSnapshot

    showSnapshot(ref: SnapshotRef): Promise<void> {
        return this.projects.showSnapshot(ref)
    }

    loadSnapshot(ref: SnapshotRef): Promise<boolean> {
        return this.projects.loadSnapshot(ref)
    }

    loadSnapshots(refs: SnapshotRef[]): Promise<ProjectSnapshotsLoadResult> {
        return this.projects.loadSnapshots(refs)
    }

    showMap(): void {
        this.projects.showMap()
    }

    refreshFolderSnapshots(folder: FolderRef): Promise<void> {
        return this.projects.refreshFolderSnapshots(folder)
    }

    chooseFolder(choice: FolderChoice): Promise<void> {
        return this.projects.chooseFolder(choice)
    }

    openFolderMenu(): void {
        this.folderMenuRequests.request()
    }

    /** Plan 06: the provider of a host the core does not recognise, kept on the folder record. */
    setFolderHosting(folderId: string, hosting: HostingOverride): Promise<void> {
        return this.projectFolders.updateFolder(folderId, { hosting })
    }

    showOverview(): void {
        this.projects.showOverview()
    }

    toastUnlessSilent(error: unknown, text: string): void {
        this.projects.toastUnlessSilent(error, text)
    }
}
