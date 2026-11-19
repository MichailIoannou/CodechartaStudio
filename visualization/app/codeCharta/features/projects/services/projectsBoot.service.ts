import { Injectable, inject } from "@angular/core"
import { LoadFilesUseCase } from "../../../load/load.facade"
import { QueryParamsService } from "../../../util/queryParameter/queryParams.service"
import { ProjectsService } from "./projects.service"

@Injectable({ providedIn: "root" })
export class ProjectsBootService {
    private readonly projects = inject(ProjectsService)
    private readonly loadFilesUseCase = inject(LoadFilesUseCase)
    private readonly queryParamsService = inject(QueryParamsService)

    async boot(): Promise<void> {
        if (!this.bootsFromProject()) {
            return this.loadFilesUseCase.loadOnBoot()
        }
        try {
            await this.projects.initialise()
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
            this.projects.showOverview()
            return
        }
        const result = await this.loadFilesUseCase.bootFromProject(() => this.projects.snapshotsToShow())
        if (!(await this.projects.acceptLoadResult(result))) {
            await this.projects.showWorkingFolder()
        }
    }

    reloadAfterReset(): Promise<void> {
        return this.bootsFromProject() ? this.projects.reloadAfterReset() : this.loadFilesUseCase.reloadAfterReset()
    }

    private bootsFromProject(): boolean {
        return this.projects.isDesktop() && !this.queryParamsService.hasFile()
    }
}
