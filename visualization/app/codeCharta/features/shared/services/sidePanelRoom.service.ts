import { DestroyRef, ElementRef, effect, Injectable, inject, Signal, untracked } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { fromEvent, merge } from "rxjs"
import { CSS_VARIABLE_HOST } from "../cssVariableHost"
import { PANEL_ISLAND_MARGIN_PX } from "../util/publishBarInset"

/** The narrowest the floating bars can shrink to and still show every cell. */
export const MIN_FREE_MAP_WIDTH_REM = 30
const DEFAULT_ROOT_FONT_SIZE_PX = 16

export type SidePanelSide = "left" | "right"

/** The side whose panel gives way first when the window gets too narrow for both: the inspector's. */
const FIRST_TO_GIVE_WAY: SidePanelSide = "right"

export interface SidePanel {
    readonly side: SidePanelSide
    /** Whether the panel covers the map down to the floating bars. */
    readonly isOpen: Signal<boolean>
    readonly coveredWidthPx: Signal<number>
    collapse(): void
}

interface RegisteredPanel {
    readonly panel: SidePanel
    readonly element: HTMLElement | null
}

/** Keeps room for the floating bars: a panel opening on one side collapses the panel on the other side when
 * less than 30rem of map would stay free between them. */
@Injectable()
export class SidePanelRoom {
    private readonly registeredPanels = new Set<RegisteredPanel>()
    private readonly viewHost = inject(CSS_VARIABLE_HOST)
    private lastTouchedTarget: EventTarget | null = null

    constructor() {
        fromEvent(window, "resize")
            .pipe(takeUntilDestroyed())
            .subscribe(() => this.giveWayToNarrowerWindow())
        merge(fromEvent(document, "pointerdown", { capture: true }), fromEvent(document, "focusin", { capture: true }))
            .pipe(takeUntilDestroyed())
            .subscribe(event => {
                this.lastTouchedTarget = event.target
            })
    }

    add(registeredPanel: RegisteredPanel): void {
        this.registeredPanels.add(registeredPanel)
    }

    remove(registeredPanel: RegisteredPanel): void {
        this.registeredPanels.delete(registeredPanel)
    }

    /** The panel the reader is working in keeps its place: what opens because of a click inside it gives way itself. */
    makeRoomFor(openedPanel: SidePanel): void {
        if (!this.hasTooLittleRoom()) {
            return
        }
        const panelsOnOtherSide = this.openPanels().filter(({ panel }) => panel.side !== openedPanel.side)
        const isWorkingBesideIt = panelsOnOtherSide.some(({ element }) => this.wasLastTouched(element))
        if (isWorkingBesideIt) {
            openedPanel.collapse()
            return
        }
        for (const { panel } of panelsOnOtherSide) {
            panel.collapse()
        }
    }

    /** A view kept alive in the background is not on screen, so the window's width is none of its business. */
    private giveWayToNarrowerWindow(): void {
        if (!this.viewHost.isConnected || !this.areBothSidesOpen() || !this.hasTooLittleRoom()) {
            return
        }
        for (const { panel } of this.openPanels()) {
            if (panel.side === FIRST_TO_GIVE_WAY) {
                panel.collapse()
            }
        }
    }

    private wasLastTouched(element: HTMLElement | null): boolean {
        return element !== null && this.lastTouchedTarget instanceof Node && element.contains(this.lastTouchedTarget)
    }

    private areBothSidesOpen(): boolean {
        return new Set(this.openPanels().map(({ panel }) => panel.side)).size === 2
    }

    private hasTooLittleRoom(): boolean {
        const coveredWidth = this.openPanels().reduce((sum, { panel }) => sum + panel.coveredWidthPx(), 0)
        const freeWidth = window.innerWidth - coveredWidth - 2 * PANEL_ISLAND_MARGIN_PX
        return freeWidth < MIN_FREE_MAP_WIDTH_REM * rootFontSizePx()
    }

    private openPanels(): RegisteredPanel[] {
        return [...this.registeredPanels].filter(({ panel }) => untracked(panel.isOpen))
    }
}

function rootFontSizePx(): number {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || DEFAULT_ROOT_FONT_SIZE_PX
}

/** Lets a side panel take part in the room of the view it is shown in; outside such a view nothing happens. */
export function registerSidePanel(panel: SidePanel): void {
    const room = inject(SidePanelRoom, { optional: true })
    if (!room) {
        return
    }
    const registeredPanel = { panel, element: inject(ElementRef, { optional: true })?.nativeElement ?? null }
    room.add(registeredPanel)
    inject(DestroyRef).onDestroy(() => room.remove(registeredPanel))

    let wasOpen = untracked(panel.isOpen)
    effect(() => {
        const isOpen = panel.isOpen()
        if (isOpen && !wasOpen) {
            untracked(() => room.makeRoomFor(panel))
        }
        wasOpen = isOpen
    })
}
