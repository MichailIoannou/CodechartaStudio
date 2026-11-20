import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { RouterLink } from "@angular/router"
import { GitHistoryPanelComponent } from "../../features/gitHistory/facade"
import { GlobalConfigurationOpener } from "../../features/globalSettings/facade"
import { RelinkFolderComponent } from "../../features/projects/facade"
import type { ToolId } from "../../model/coreApi/ToolId"
import { routeLinks } from "../../routing/routePaths"
import { DesktopEnvironment } from "../../util/desktop/desktopEnvironment.service"

const GIT: ToolId = "git"

@Component({
    selector: "cc-history-view",
    templateUrl: "./historyView.component.html",
    imports: [RouterLink, GitHistoryPanelComponent, RelinkFolderComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block h-[calc(100vh-var(--cc-bars-height))] overflow-hidden bg-base-100" }
})
export class HistoryViewComponent {
    private readonly configuration = inject(GlobalConfigurationOpener)

    readonly isDesktop = inject(DesktopEnvironment).isDesktop
    readonly routeLinks = routeLinks

    /** Every problem the history panel sends to the desktop tools is one of git. */
    openDesktopTools() {
        this.configuration.openGlobalConfiguration({ section: "desktopTools", tool: GIT })
    }
}
