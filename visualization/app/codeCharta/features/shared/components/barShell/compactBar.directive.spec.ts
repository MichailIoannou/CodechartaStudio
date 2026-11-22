import { Component, inject, signal } from "@angular/core"
import { render } from "@testing-library/angular"
import { reportResize, resizeObserverDisconnect, stubElementSize, stubResizeObserver } from "../../../../util/testUtils/domStubs"
import { CompactBarDirective, isCompactInRoom } from "./compactBar.directive"

@Component({
    selector: "cc-test-bar",
    template: `<div data-cell style="flex-shrink: 0" [style.width.px]="cellWidth()">{{ metricName() }}</div>`,
    hostDirectives: [CompactBarDirective]
})
class TestBarComponent {
    readonly compactBar = inject(CompactBarDirective)
    readonly cellWidth = signal(FULL_BAR_MINIMUM_PX)
    readonly metricName = signal("rloc")
}

const FULL_BAR_MINIMUM_PX = 500
const HYSTERESIS_PX = 32

describe("isCompactInRoom", () => {
    it("should turn compact below the full bar's minimum", () => {
        // Act
        const isCompact = isCompactInRoom(FULL_BAR_MINIMUM_PX - 1, FULL_BAR_MINIMUM_PX, false)

        // Assert
        expect(isCompact).toBe(true)
    })

    it("should stay full at exactly the full bar's minimum", () => {
        // Act
        const isCompact = isCompactInRoom(FULL_BAR_MINIMUM_PX, FULL_BAR_MINIMUM_PX, false)

        // Assert
        expect(isCompact).toBe(false)
    })

    it("should stay compact until 32 px more than the minimum are free", () => {
        // Act
        const isCompact = isCompactInRoom(FULL_BAR_MINIMUM_PX + HYSTERESIS_PX - 1, FULL_BAR_MINIMUM_PX, true)

        // Assert
        expect(isCompact).toBe(true)
    })

    it("should return to the full bar at 32 px more than the minimum", () => {
        // Act
        const isCompact = isCompactInRoom(FULL_BAR_MINIMUM_PX + HYSTERESIS_PX, FULL_BAR_MINIMUM_PX, true)

        // Assert
        expect(isCompact).toBe(false)
    })
})

describe("CompactBarDirective", () => {
    let roomPx = 1000
    let restoreElementSize: () => void
    let frames: FrameRequestCallback[]

    function runFrames() {
        for (const frame of frames.splice(0)) {
            frame(0)
        }
    }

    beforeEach(() => {
        stubResizeObserver()
        resizeObserverDisconnect.mockClear()
        roomPx = 1000
        restoreElementSize = stubElementSize(() => ({ width: roomPx, height: 0 }))
        jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return { width: Number.parseFloat(this.style.width) || 0 } as DOMRect
        })
        frames = []
        jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => frames.push(callback))
    })

    afterEach(() => {
        restoreElementSize()
        jest.restoreAllMocks()
    })

    async function renderBar() {
        const { fixture } = await render(TestBarComponent)
        const bar: HTMLElement = fixture.nativeElement
        return { fixture, bar, compactBar: fixture.componentInstance.compactBar }
    }

    async function resizeRoomTo(width: number, fixture: { detectChanges(): void }) {
        roomPx = width
        reportResize()
        fixture.detectChanges()
    }

    it("should measure the map left free between the side panels", async () => {
        // Act
        const { bar } = await renderBar()

        // Assert
        const probe = bar.querySelector<HTMLElement>("[data-testid='bar-room-probe']")
        expect(probe.style.position).toBe("fixed")
        expect(probe.style.left).toBe("var(--cc-bar-inset-left, 0px)")
        expect(probe.style.right).toBe("var(--cc-bar-inset-right, 0px)")
        expect(probe.style.margin).toBe("0px 6px")
        expect(probe.getAttribute("aria-hidden")).toBe("true")
    })

    it("should turn compact once the free map narrows below the full bar's minimum and say so on the bar", async () => {
        // Arrange
        const { fixture, bar, compactBar } = await renderBar()

        // Act
        await resizeRoomTo(FULL_BAR_MINIMUM_PX - 1, fixture)

        // Assert
        expect(compactBar.isCompact()).toBe(true)
        expect(bar.dataset.compact).toBe("true")
    })

    it("should keep the compact bar until 32 px more than the full bar's minimum are free again", async () => {
        // Arrange
        const { fixture, bar, compactBar } = await renderBar()
        await resizeRoomTo(400, fixture)

        // Act
        await resizeRoomTo(FULL_BAR_MINIMUM_PX + HYSTERESIS_PX - 1, fixture)
        const isCompactBelowThreshold = compactBar.isCompact()
        await resizeRoomTo(FULL_BAR_MINIMUM_PX + HYSTERESIS_PX, fixture)

        // Assert
        expect(isCompactBelowThreshold).toBe(true)
        expect(compactBar.isCompact()).toBe(false)
        expect(bar.hasAttribute("data-compact")).toBe(false)
    })

    it("should measure its minimum again when its cells change", async () => {
        // Arrange
        const { fixture, compactBar } = await renderBar()
        await resizeRoomTo(600, fixture)
        const wasCompact = compactBar.isCompact()

        // Act
        fixture.componentInstance.cellWidth.set(700)
        fixture.componentInstance.metricName.set("sonar_complexity")
        fixture.detectChanges()
        await Promise.resolve()
        runFrames()

        // Assert
        expect(wasCompact).toBe(false)
        expect(compactBar.isCompact()).toBe(true)
    })

    it("should keep its form while its view is not on screen", async () => {
        // Arrange
        const { fixture, compactBar } = await renderBar()
        await resizeRoomTo(400, fixture)

        // Act
        await resizeRoomTo(0, fixture)

        // Assert
        expect(compactBar.isCompact()).toBe(true)
    })

    it("should stop measuring and remove its probe when the bar goes away", async () => {
        // Arrange
        const { fixture, bar } = await renderBar()

        // Act
        fixture.destroy()

        // Assert
        expect(resizeObserverDisconnect).toHaveBeenCalledTimes(1)
        expect(bar.querySelector("[data-testid='bar-room-probe']")).toBeNull()
    })
})
