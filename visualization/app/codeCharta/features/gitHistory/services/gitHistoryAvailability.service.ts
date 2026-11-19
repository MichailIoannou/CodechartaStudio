import { computed, effect, Injectable, inject, untracked } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { Router } from "@angular/router"
import { ActiveViewStore } from "../../../routing/activeView.store"
import { routeLinks } from "../../../routing/routePaths"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { WORKING_FOLDER_SOURCE } from "../ports/workingFolderSource.port"

@Injectable({ providedIn: "root" })
export class GitHistoryAvailability {
    private readonly environment = inject(DesktopEnvironment)
    private readonly source = inject(WORKING_FOLDER_SOURCE)
    private readonly router = inject(Router)
    private readonly activeView = toSignal(inject(ActiveViewStore).activeView$, { requireSync: true })

    readonly isAvailable = computed(
        () => this.environment.isDesktop() && (this.source.activeProject()?.folders.some(folder => folder.kind === "git") ?? false)
    )

    /** The web build keeps its history route to explain that history needs the desktop app. */
    private readonly hasLostTheShownHistory = computed(
        () => this.environment.isDesktop() && !this.isAvailable() && this.activeView() === "history"
    )

    constructor() {
        effect(() => {
            if (this.hasLostTheShownHistory()) {
                untracked(() => this.router.navigateByUrl(routeLinks.metrics, { replaceUrl: true }))
            }
        })
    }
}
