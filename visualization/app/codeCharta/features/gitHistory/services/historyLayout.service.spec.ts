import { TestBed } from "@angular/core/testing"
import { HistoryLayoutService, PANE_BOUNDS, WIDE_WINDOW_PX } from "./historyLayout.service"

const LAYOUT_KEY = "codeChartaHistoryLayout"

describe("HistoryLayoutService", () => {
    const originalWidth = globalThis.innerWidth

    function createService({ stored, windowWidth = WIDE_WINDOW_PX }: { stored?: unknown; windowWidth?: number } = {}) {
        if (stored !== undefined) {
            localStorage.setItem(LAYOUT_KEY, typeof stored === "string" ? stored : JSON.stringify(stored))
        }
        Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: windowWidth })
        return TestBed.inject(HistoryLayoutService)
    }

    const storedLayout = () => JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null")

    afterEach(() => {
        localStorage.clear()
        Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: originalWidth })
    })

    it("should start with the default widths and open panes in a wide window", () => {
        // Arrange & Act
        const layout = createService()

        // Assert
        expect([layout.branchesWidth(), layout.detailsWidth()]).toEqual([260, 380])
        expect([layout.isBranchesCollapsed(), layout.isDetailsCollapsed()]).toEqual([false, false])
    })

    it("should restore the remembered widths and clamp them to their bounds", () => {
        // Arrange & Act
        const layout = createService({ stored: { branchesWidth: 2000, detailsWidth: 300 } })

        // Assert
        expect([layout.branchesWidth(), layout.detailsWidth()]).toEqual([PANE_BOUNDS.branches.maxWidth, 300])
    })

    it("should clamp a width while resizing and remember it when saved", () => {
        // Arrange
        const layout = createService()

        // Act
        layout.resize("details", 10)
        layout.save()

        // Assert
        expect(layout.detailsWidth()).toBe(PANE_BOUNDS.details.minWidth)
        expect(storedLayout()).toEqual(expect.objectContaining({ detailsWidth: PANE_BOUNDS.details.minWidth }))
    })

    it("should reset a width to its default", () => {
        // Arrange
        const layout = createService({ stored: { branchesWidth: 400 } })

        // Act
        layout.resetWidth("branches")

        // Assert
        expect(layout.branchesWidth()).toBe(260)
        expect(storedLayout().branchesWidth).toBe(260)
    })

    it("should ignore a remembered layout that cannot be read", () => {
        // Arrange & Act
        const layout = createService({ stored: "{not json" })

        // Assert
        expect(layout.branchesWidth()).toBe(260)
    })

    it("should start both side panes collapsed in a narrow window", () => {
        // Arrange & Act
        const layout = createService({ windowWidth: WIDE_WINDOW_PX - 1 })

        // Assert
        expect([layout.isBranchesCollapsed(), layout.isDetailsCollapsed()]).toEqual([true, true])
    })

    it("should keep a pane open in a narrow window when the user expanded it before", () => {
        // Arrange & Act
        const layout = createService({ stored: { isBranchesCollapsed: false }, windowWidth: WIDE_WINDOW_PX - 1 })

        // Assert
        expect([layout.isBranchesCollapsed(), layout.isDetailsCollapsed()]).toEqual([false, true])
    })

    it("should remember only the collapsing the user chose", () => {
        // Arrange
        const layout = createService({ windowWidth: WIDE_WINDOW_PX - 1 })

        // Act
        layout.toggleCollapsed("details")
        layout.resize("branches", 300)
        layout.save()

        // Assert — the branches pane was collapsed by the narrow window, not by the user
        expect(layout.isDetailsCollapsed()).toBe(false)
        expect(storedLayout()).toEqual(expect.objectContaining({ isDetailsCollapsed: false, branchesWidth: 300 }))
        expect(storedLayout().isBranchesCollapsed).toBeUndefined()
    })

    it("should remember collapsed groups", () => {
        // Arrange
        const layout = createService()

        // Act
        layout.toggleGroup("tags")
        layout.toggleGroup("remote:origin")
        layout.toggleGroup("remote:origin")

        // Assert
        expect([...layout.collapsedGroups()]).toEqual(["tags"])
        expect(storedLayout().collapsedGroups).toEqual(["tags"])
    })
})
