import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { RouterLink } from "@angular/router"
import { GitHistoryPanelComponent } from "../../features/gitHistory/facade"
import { GlobalConfigurationDialogComponent } from "../../features/globalSettings/facade"
import { ProjectsFacade, RelinkFolderComponent } from "../../features/projects/facade"
import { routeLinks } from "../../routing/routePaths"
import { DesktopEnvironment } from "../../util/desktop/desktopEnvironment.service"

@Component({
    selector: "cc-history-view",
    templateUrl: "./historyView.component.html",
    imports: [RouterLink, GitHistoryPanelComponent, RelinkFolderComponent, GlobalConfigurationDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block h-[calc(100vh-var(--cc-bars-height))] overflow-hidden bg-base-100" }
})
export class HistoryViewComponent {
    private readonly projects = inject(ProjectsFacade)
    readonly isDesktop = inject(DesktopEnvironment).isDesktop
    readonly routeLinks = routeLinks

    workIn(folder: { id: string }) {
        const project = this.projects.activeProject()
        if (project) {
            void this.projects.chooseFolder({ projectId: project.id, folderId: folder.id })
        }
    }

    chooseWorkingFolder() {
        this.projects.openFolderMenu()
    }
}
