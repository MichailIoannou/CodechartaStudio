import { afterNextRender, DestroyRef, Directive, ElementRef, Injector, inject, signal } from "@angular/core"
import { PANEL_ISLAND_MARGIN_PX } from "../../util/publishBarInset"
import { WIDER_PANEL_INSET } from "./barShell.directive"
import { prepareBarSwitch } from "./barSwitchAnimation"
import { measureFullBarMinimum } from "./fullBarMinimum"

/** A gap above the full bar's minimum, so dragging a panel edge near it does not make the bar flicker. */
const FULL_AGAIN_ABOVE_MINIMUM_PX = 32
/** What, besides the room, can change the full bar's minimum: its cells, their names, a tool appearing. */
const WATCHED_CHANGES: MutationObserverInit = {
    subtree: true,
    childList: true,
    characterData: true,
    attributeFilter: ["class", "data-revealed"]
}

export function isCompactInRoom(roomPx: number, fullMinimumPx: number, wasCompact: boolean): boolean {
    return roomPx < fullMinimumPx + (wasCompact ? FULL_AGAIN_ABOVE_MINIMUM_PX : 0)
}

/** Tells a bar whether the room around the window centre that no side panel covers is narrower than its full form can get. */
@Directive({
    selector: "[ccCompactBar]",
    host: { "[attr.data-compact]": "isCompact() ? 'true' : null" }
})
export class CompactBarDirective {
    private readonly host: HTMLElement = inject(ElementRef).nativeElement
    private readonly injector = inject(Injector)
    private readonly compact = signal(false)
    readonly isCompact = this.compact.asReadonly()
    /** Measured while the full form shows; the compact form keeps the last value. */
    private fullMinimumPx = 0

    constructor() {
        const destroyRef = inject(DestroyRef)
        afterNextRender(() => {
            const stopObserving = this.observeRoom()
            destroyRef.onDestroy(stopObserving)
        })
    }

    private observeRoom(): () => void {
        if (typeof ResizeObserver === "undefined") {
            return () => {}
        }
        const probe = createRoomProbe()
        this.host.appendChild(probe)
        const updateNow = () => this.update(probe.clientWidth)
        let frame = 0
        const updateNextFrame = () => {
            frame ||= requestAnimationFrame(() => {
                frame = 0
                updateNow()
            })
        }
        const resizes = new ResizeObserver(updateNow)
        resizes.observe(probe)
        const changes = new MutationObserver(updateNextFrame)
        changes.observe(this.host, WATCHED_CHANGES)
        return () => {
            cancelAnimationFrame(frame)
            resizes.disconnect()
            changes.disconnect()
            probe.remove()
        }
    }

    /** A bar kept alive in a background view measures nothing; it keeps its form until it is shown again. */
    private update(roomPx: number) {
        if (roomPx === 0) {
            return
        }
        const wasCompact = this.compact()
        if (!wasCompact) {
            this.fullMinimumPx = measureFullBarMinimum(this.host)
        }
        const isCompact = isCompactInRoom(roomPx, this.fullMinimumPx, wasCompact)
        if (isCompact !== wasCompact) {
            this.switchTo(isCompact)
        }
    }

    private switchTo(isCompact: boolean) {
        const playSwitch = prepareBarSwitch(this.host)
        this.compact.set(isCompact)
        if (playSwitch) {
            afterNextRender(playSwitch, { injector: this.injector })
        }
    }
}

/** Spans exactly the bar's room around the window centre, so its width follows every panel and window change at once. */
function createRoomProbe(): HTMLElement {
    const probe = document.createElement("div")
    probe.setAttribute("aria-hidden", "true")
    probe.dataset.testid = "bar-room-probe"
    Object.assign(probe.style, {
        position: "fixed",
        left: WIDER_PANEL_INSET,
        right: WIDER_PANEL_INSET,
        bottom: "0",
        height: "0",
        margin: `0 ${PANEL_ISLAND_MARGIN_PX}px`,
        visibility: "hidden",
        pointerEvents: "none"
    })
    return probe
}
