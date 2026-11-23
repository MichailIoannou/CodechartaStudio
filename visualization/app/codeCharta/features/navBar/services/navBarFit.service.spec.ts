import { TestBed } from "@angular/core/testing"
import * as measuring from "../util/measureNavBarRoom"
import { NavBarFit } from "./navBarFit.service"

const ROOM = {
    available: 300,
    gap: 4,
    project: { chrome: 60, iconOnly: 52, label: 120, shortestLabel: 50 },
    slot: { full: 288, narrowest: 144, compact: 52 }
}

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []
    readonly observed: Element[] = []
    disconnect = jest.fn()

    constructor(readonly callback: () => void) {
        FakeResizeObserver.instances.push(this)
    }

    observe(target: Element) {
        this.observed.push(target)
    }
}

describe("NavBarFit", () => {
    let fit: NavBarFit
    let frames: FrameRequestCallback[]

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [NavBarFit] })
        fit = TestBed.inject(NavBarFit)
        frames = []
        FakeResizeObserver.instances = []
        globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
        jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => frames.push(callback))
        jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {})
    })

    afterEach(() => {
        jest.restoreAllMocks()
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    })

    function runFrames() {
        for (const frame of frames.splice(0)) {
            frame(0)
        }
    }

    it("should show both triggers at their natural widths before it has measured", () => {
        // Assert
        expect([fit.projectLabelMaxWidth(), fit.isProjectIconOnly(), fit.slotWidth(), fit.isSlotCompact()]).toEqual([
            null,
            false,
            null,
            false
        ])
    })

    it("should apply the step that fits the measured room", () => {
        // Arrange
        jest.spyOn(measuring, "measureNavBarRoom").mockReturnValue(ROOM)

        // Act
        fit.fit(document.createElement("div"))

        // Assert
        expect([fit.projectLabelMaxWidth(), fit.isProjectIconOnly(), fit.slotWidth(), fit.isSlotCompact()]).toEqual([
            null,
            true,
            244,
            false
        ])
    })

    it("should fall back to the natural widths when there is nothing to fit", () => {
        // Arrange
        jest.spyOn(measuring, "measureNavBarRoom").mockReturnValueOnce(ROOM).mockReturnValueOnce(null)
        const start = document.createElement("div")
        fit.fit(start)

        // Act
        fit.fit(start)

        // Assert
        expect(fit.isProjectIconOnly()).toBe(false)
    })

    it("should refit once per frame when navbar-start resizes or its content changes, until stopped", async () => {
        // Arrange
        const measure = jest.spyOn(measuring, "measureNavBarRoom").mockReturnValue(ROOM)
        const start = document.createElement("div")
        document.body.appendChild(start)
        const stop = fit.observe(start)
        const resizes = FakeResizeObserver.instances[0]

        // Act
        resizes.callback()
        start.textContent = "billing-api"
        await Promise.resolve()
        runFrames()
        stop()
        resizes.callback()
        runFrames()

        // Assert
        expect(resizes.observed).toEqual([start])
        expect(measure).toHaveBeenCalledTimes(1)
        expect(resizes.disconnect).toHaveBeenCalled()
    })

    it("should do nothing where the browser cannot watch sizes", () => {
        // Arrange
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
        const measure = jest.spyOn(measuring, "measureNavBarRoom")

        // Act
        const stop = fit.observe(document.createElement("div"))
        stop()

        // Assert
        expect(measure).not.toHaveBeenCalled()
    })
})
