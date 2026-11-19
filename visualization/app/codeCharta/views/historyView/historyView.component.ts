import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { RouterLink } from "@angular/router"
import { routeLinks } from "../../routing/routePaths"
import { DesktopEnvironment } from "../../util/desktop/desktopEnvironment.service"

@Component({
    selector: "cc-history-view",
    templateUrl: "./historyView.component.html",
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block h-[calc(100vh-var(--cc-bars-height))] overflow-hidden bg-base-100" }
})
export class HistoryViewComponent {
    readonly isDesktop = inject(DesktopEnvironment).isDesktop
    readonly routeLinks = routeLinks
}
