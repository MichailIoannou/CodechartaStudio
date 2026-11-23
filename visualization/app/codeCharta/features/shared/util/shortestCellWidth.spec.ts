import { fontsLoadedSignal, shortestCellWidth } from "./shortestCellWidth"

describe("shortestCellWidth", () => {
    it("should add the cell's horizontal padding to its widest part, rounded up", () => {
        // Arrange
        const cell = document.createElement("div")
        cell.style.padding = "0 12px"
        document.body.appendChild(cell)

        // Act
        const width = shortestCellWidth(cell, [40, 88.2, 60])

        // Assert
        expect(width).toBe(113)
    })

    it("should be only the padding of a cell without parts", () => {
        // Arrange
        const cell = document.createElement("div")

        // Act
        const width = shortestCellWidth(cell, [])

        // Assert
        expect(width).toBe(0)
    })
})

describe("fontsLoadedSignal", () => {
    afterEach(() => {
        delete (document as { fonts?: unknown }).fonts
    })

    it("should turn true once the web fonts are loaded", async () => {
        // Arrange
        Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } })

        // Act
        const areLoaded = fontsLoadedSignal()
        const wereLoadedAtOnce = areLoaded()
        await Promise.resolve()

        // Assert
        expect(wereLoadedAtOnce).toBe(false)
        expect(areLoaded()).toBe(true)
    })
})
