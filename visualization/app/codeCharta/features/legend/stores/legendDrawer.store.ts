import { Injectable, signal } from "@angular/core"

export const LEGEND_PANEL_ID = "legend-panel"

/** Provided per view: the Legend tool in the view's bar and the drawer it opens are siblings, not parent and child. */
@Injectable()
export class LegendDrawerStore {
    private readonly isOpenState = signal(false)

    readonly isOpen = this.isOpenState.asReadonly()

    toggle() {
        this.isOpenState.update(isOpen => !isOpen)
    }

    close() {
        this.isOpenState.set(false)
    }
}
