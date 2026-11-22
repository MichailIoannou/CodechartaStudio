import { afterNextRender, DestroyRef, Directive, ElementRef, inject, signal } from "@angular/core"
import { PANEL_ISLAND_MARGIN_PX } from "../../util/publishBarInset"
import { INSET_LEFT, INSET_RIGHT } from "./barShell.directive"

/** The narrowest the full bar can shrink to; below it the bar turns compact. */
const COMPACT_BELOW_REM = 30
/** A gap above the limit, so dragging a panel edge near it does not make the bar flicker. */
const FULL_FROM_REM = 32
const DEFAULT_ROOT_FONT_SIZE_PX = 16

export function isCompactAtFreeWidth(freeWidthPx: number, rootFontSizePx: number, wasCompact: boolean): boolean {
    const limitRem = wasCompact ? FULL_FROM_REM : COMPACT_BELOW_REM
    return freeWidthPx < limitRem * rootFontSizePx
}

/** Tells a bar whether the map left free between the side panels is too narrow for its full form. */
@Directive({
    selector: "[ccCompactBar]",
    host: { "[attr.data-compact]": "isCompact() ? 'true' : null" }
})
export class CompactBarDirective {
    private readonly host: HTMLElement = inject(ElementRef).nativeElement
    private readonly compact = signal(false)
    readonly isCompact = this.compact.asReadonly()

    constructor() {
        const destroyRef = inject(DestroyRef)
        afterNextRender(() => {
            const stopObserving = this.observeFreeWidth()
            destroyRef.onDestroy(stopObserving)
        })
    }

    private observeFreeWidth(): () => void {
        if (typeof ResizeObserver === "undefined") {
            return () => {}
        }
        const probe = createFreeWidthProbe()
        this.host.appendChild(probe)
        const observer = new ResizeObserver(() => this.update(probe.clientWidth))
        observer.observe(probe)
        return () => {
            observer.disconnect()
            probe.remove()
        }
    }

    /** A bar kept alive in a background view measures nothing; it keeps its form until it is shown again. */
    private update(freeWidthPx: number) {
        if (freeWidthPx === 0) {
            return
        }
        this.compact.update(wasCompact => isCompactAtFreeWidth(freeWidthPx, rootFontSizePx(), wasCompact))
    }
}

/** Spans exactly the free map between the panels, without a transition, so its width follows every panel change at once. */
function createFreeWidthProbe(): HTMLElement {
    const probe = document.createElement("div")
    probe.setAttribute("aria-hidden", "true")
    probe.dataset.testid = "bar-free-width-probe"
    Object.assign(probe.style, {
        position: "fixed",
        left: INSET_LEFT,
        right: INSET_RIGHT,
        bottom: "0",
        height: "0",
        margin: `0 ${PANEL_ISLAND_MARGIN_PX}px`,
        visibility: "hidden",
        pointerEvents: "none"
    })
    return probe
}

function rootFontSizePx(): number {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || DEFAULT_ROOT_FONT_SIZE_PX
}
