import { Component, inject } from "@angular/core"
import { render } from "@testing-library/angular"
import { reportResize, resizeObserverDisconnect, stubElementSize, stubResizeObserver } from "../../../../util/testUtils/domStubs"
import { CompactBarDirective, isCompactAtFreeWidth } from "./compactBar.directive"

@Component({ selector: "cc-test-bar", template: "", hostDirectives: [CompactBarDirective] })
class TestBarComponent {
    readonly compactBar = inject(CompactBarDirective)
}

const ROOT_FONT_SIZE_PX = 16
const REM = ROOT_FONT_SIZE_PX

describe("isCompactAtFreeWidth", () => {
    it("should turn compact below 30rem of free map", () => {
        // Act
        const isCompact = isCompactAtFreeWidth(30 * REM - 1, ROOT_FONT_SIZE_PX, false)

        // Assert
        expect(isCompact).toBe(true)
    })

    it("should stay full at exactly 30rem", () => {
        // Act
        const isCompact = isCompactAtFreeWidth(30 * REM, ROOT_FONT_SIZE_PX, false)

        // Assert
        expect(isCompact).toBe(false)
    })

    it("should stay compact between 30rem and 32rem", () => {
        // Act
        const isCompact = isCompactAtFreeWidth(31 * REM, ROOT_FONT_SIZE_PX, true)

        // Assert
        expect(isCompact).toBe(true)
    })

    it("should return to the full bar at 32rem", () => {
        // Act
        const isCompact = isCompactAtFreeWidth(32 * REM, ROOT_FONT_SIZE_PX, true)

        // Assert
        expect(isCompact).toBe(false)
    })

    it("should measure in the root font size", () => {
        // Act
        const isCompact = isCompactAtFreeWidth(500, 20, false)

        // Assert
        expect(isCompact).toBe(true)
    })
})

describe("CompactBarDirective", () => {
    let freeWidthPx = 1000
    let restoreElementSize: () => void

    beforeEach(() => {
        stubResizeObserver()
        resizeObserverDisconnect.mockClear()
        freeWidthPx = 1000
        restoreElementSize = stubElementSize(() => ({ width: freeWidthPx, height: 0 }))
    })

    afterEach(() => restoreElementSize())

    async function renderBar() {
        const { fixture } = await render(TestBarComponent)
        const bar: HTMLElement = fixture.nativeElement
        return { fixture, bar, compactBar: fixture.componentInstance.compactBar }
    }

    async function resizeFreeMapTo(width: number, fixture: { detectChanges(): void }) {
        freeWidthPx = width
        reportResize()
        fixture.detectChanges()
    }

    it("should measure the map left free between the side panels", async () => {
        // Act
        const { bar } = await renderBar()

        // Assert
        const probe = bar.querySelector<HTMLElement>("[data-testid='bar-free-width-probe']")
        expect(probe.style.position).toBe("fixed")
        expect(probe.style.left).toBe("var(--cc-bar-inset-left, 0px)")
        expect(probe.style.right).toBe("var(--cc-bar-inset-right, 0px)")
        expect(probe.style.margin).toBe("0px 6px")
        expect(probe.getAttribute("aria-hidden")).toBe("true")
    })

    it("should turn compact once the free map narrows below 30rem and say so on the bar", async () => {
        // Arrange
        const { fixture, bar, compactBar } = await renderBar()

        // Act
        await resizeFreeMapTo(400, fixture)

        // Assert
        expect(compactBar.isCompact()).toBe(true)
        expect(bar.dataset.compact).toBe("true")
    })

    it("should keep the compact bar until 32rem are free again", async () => {
        // Arrange
        const { fixture, bar, compactBar } = await renderBar()
        await resizeFreeMapTo(400, fixture)

        // Act
        await resizeFreeMapTo(31 * REM, fixture)
        const isCompactBelowThreshold = compactBar.isCompact()
        await resizeFreeMapTo(32 * REM, fixture)

        // Assert
        expect(isCompactBelowThreshold).toBe(true)
        expect(compactBar.isCompact()).toBe(false)
        expect(bar.hasAttribute("data-compact")).toBe(false)
    })

    it("should keep its form while its view is not on screen", async () => {
        // Arrange
        const { fixture, compactBar } = await renderBar()
        await resizeFreeMapTo(400, fixture)

        // Act
        await resizeFreeMapTo(0, fixture)

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
        expect(bar.querySelector("[data-testid='bar-free-width-probe']")).toBeNull()
    })
})
