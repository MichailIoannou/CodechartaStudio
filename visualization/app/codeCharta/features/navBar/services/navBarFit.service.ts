import { computed, Injectable, signal } from "@angular/core"
import { fitNavBar, isSameFit, NATURAL_FIT } from "../util/fitNavBar"
import { measureNavBarRoom } from "../util/measureNavBarRoom"

/** Lets the project menu and the map slot use all of `navbar-start`, giving way one step at a time when it gets short. */
@Injectable()
export class NavBarFit {
    private readonly state = signal(NATURAL_FIT, { equal: isSameFit })
    readonly projectLabelMaxWidth = computed(() => this.state().projectLabelMaxWidth)
    readonly isProjectIconOnly = computed(() => this.state().isProjectIconOnly)
    readonly slotWidth = computed(() => this.state().slotWidth)
    readonly isSlotCompact = computed(() => this.state().isSlotCompact)

    /** Refits on the next frame whenever `navbar-start` resizes or what it shows changes; returns how to stop. */
    observe(start: HTMLElement): () => void {
        if (typeof ResizeObserver === "undefined") {
            return () => {}
        }
        let frame = 0
        let isStopped = false
        const scheduleFit = () => {
            if (isStopped) {
                return
            }
            frame ||= requestAnimationFrame(() => {
                frame = 0
                this.fit(start)
            })
        }
        const resizes = new ResizeObserver(scheduleFit)
        resizes.observe(start)
        const changes = new MutationObserver(scheduleFit)
        changes.observe(start, { childList: true, subtree: true, characterData: true })
        void document.fonts?.ready.then(scheduleFit)
        return () => {
            isStopped = true
            cancelAnimationFrame(frame)
            resizes.disconnect()
            changes.disconnect()
        }
    }

    fit(start: HTMLElement) {
        const room = measureNavBarRoom(start, this.state())
        this.state.set(room ? fitNavBar(room) : NATURAL_FIT)
    }
}
