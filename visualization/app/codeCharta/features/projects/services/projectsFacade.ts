import { computed, Injectable, inject } from "@angular/core"
import { ProjectsService } from "./projects.service"

@Injectable({ providedIn: "root" })
export class ProjectsFacade {
    private readonly projects = inject(ProjectsService)

    readonly isDesktop = this.projects.isDesktop
    readonly activeProject = this.projects.activeProject
    readonly workingFolder = this.projects.workingFolder
    readonly hasActiveProject = computed(() => this.projects.activeProject() !== null)
}
