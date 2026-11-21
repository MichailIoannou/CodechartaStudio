import { computed, Injectable, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { Router } from "@angular/router"
import { ActiveViewStore } from "../../../routing/activeView.store"
import { routeLinks } from "../../../routing/routePaths"

/** Whether the History is the view on screen, and the way there from anywhere else. */
@Injectable({ providedIn: "root" })
export class HistoryNavigation {
    private readonly router = inject(Router)
    private readonly activeView = toSignal(inject(ActiveViewStore).activeView$, { requireSync: true })

    readonly isShown = computed(() => this.activeView() === "history")

    open(): Promise<boolean> {
        return this.router.navigateByUrl(routeLinks.history)
    }
}
