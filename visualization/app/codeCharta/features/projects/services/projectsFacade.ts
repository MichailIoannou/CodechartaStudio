import { computed, Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import { ProjectsService } from "./projects.service"

@Injectable({ providedIn: "root" })
export class ProjectsFacade {
    private readonly projects = inject(ProjectsService)

    readonly isDesktop = this.projects.isDesktop
    readonly activeProject = this.projects.activeProject
    readonly workingFolder = this.projects.workingFolder
    readonly hasActiveProject = computed(() => this.projects.activeProject() !== null)
    readonly snapshotsByFolder = this.projects.snapshotsByFolder
    readonly shownSnapshot = this.projects.shownSnapshot

    showSnapshot(ref: SnapshotRef): Promise<void> {
        return this.projects.showSnapshot(ref)
    }

    refreshFolderSnapshots(folder: FolderRef): Promise<void> {
        return this.projects.refreshFolderSnapshots(folder)
    }

    showOverview(): void {
        this.projects.showOverview()
    }

    toastUnlessSilent(error: unknown, text: string): void {
        this.projects.toastUnlessSilent(error, text)
    }
}
