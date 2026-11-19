import { scrollTopShowing, VirtualWindowInput, windowOf } from "./virtualWindow"

const ROW_HEIGHT = 28

function input(overrides: Partial<VirtualWindowInput> = {}): VirtualWindowInput {
    return { scrollTop: 0, viewportHeight: 280, rowHeight: ROW_HEIGHT, rowCount: 1000, overscan: 0, ...overrides }
}

describe("windowOf", () => {
    it("should render the first rows at the top", () => {
        // Act
        const window = windowOf(input())

        // Assert
        expect(window).toEqual({ firstIndex: 0, lastIndex: 9, offsetTop: 0, totalHeight: 28_000 })
    })

    it("should render a partly visible row at either edge", () => {
        // Act
        const window = windowOf(input({ scrollTop: 14 }))

        // Assert
        expect(window.firstIndex).toBe(0)
        expect(window.lastIndex).toBe(10)
    })

    it("should add the overscan above and below the visible rows", () => {
        // Act
        const window = windowOf(input({ scrollTop: 50 * ROW_HEIGHT, overscan: 5 }))

        // Assert
        expect(window.firstIndex).toBe(45)
        expect(window.lastIndex).toBe(64)
        expect(window.offsetTop).toBe(45 * ROW_HEIGHT)
    })

    it("should not reach before the first row with overscan", () => {
        // Act
        const window = windowOf(input({ overscan: 5 }))

        // Assert
        expect(window.firstIndex).toBe(0)
        expect(window.lastIndex).toBe(14)
    })

    it("should clamp at the end of the list", () => {
        // Act
        const window = windowOf(input({ rowCount: 20, scrollTop: 10_000, overscan: 3 }))

        // Assert
        expect(window.lastIndex).toBe(19)
        expect(window.firstIndex).toBe(7)
    })

    it("should render every row of a list shorter than the viewport", () => {
        // Act
        const window = windowOf(input({ rowCount: 3, scrollTop: 40 }))

        // Assert
        expect(window).toEqual({ firstIndex: 0, lastIndex: 2, offsetTop: 0, totalHeight: 84 })
    })

    it("should render nothing for zero rows", () => {
        // Act
        const window = windowOf(input({ rowCount: 0 }))

        // Assert
        expect(window).toEqual({ firstIndex: 0, lastIndex: -1, offsetTop: 0, totalHeight: 0 })
    })

    describe("scrollTopShowing", () => {
        it("should keep the scroll position for a row in view", () => {
            // Arrange & Act
            const scrollTop = scrollTopShowing({ index: 5, rowHeight: 28, scrollTop: 56, viewportHeight: 280 })

            // Assert
            expect(scrollTop).toBe(56)
        })

        it("should scroll up to a row above the view and down to a row below it", () => {
            // Arrange & Act
            const above = scrollTopShowing({ index: 1, rowHeight: 28, scrollTop: 140, viewportHeight: 280 })
            const below = scrollTopShowing({ index: 20, rowHeight: 28, scrollTop: 0, viewportHeight: 280 })

            // Assert
            expect(above).toBe(28)
            expect(below).toBe(21 * 28 - 280)
        })
    })
})
