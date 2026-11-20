import { cropTransparentMargins, onExportBackground } from "./canvasCrop"

const CANVAS_WIDTH = 10
const CANVAS_HEIGHT = 8

function imageDataWithOpaqueBox(box: { minX: number; minY: number; maxX: number; maxY: number }) {
    const data = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4)
    for (let y = box.minY; y <= box.maxY; y++) {
        for (let x = box.minX; x <= box.maxX; x++) {
            data[(CANVAS_WIDTH * y + x) * 4 + 3] = 255
        }
    }
    return { data } as ImageData
}

function createCanvas() {
    const canvas = document.createElement("canvas")
    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT
    return canvas
}

describe("cropTransparentMargins", () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it("should crop the canvas down to its opaque content", () => {
        // Arrange
        const box = { minX: 2, minY: 1, maxX: 5, maxY: 4 }
        jest.spyOn(CanvasRenderingContext2D.prototype, "getImageData").mockReturnValue(imageDataWithOpaqueBox(box))
        const drawImageSpy = jest.spyOn(CanvasRenderingContext2D.prototype, "drawImage")
        const canvas = createCanvas()

        // Act
        const cropped = cropTransparentMargins(canvas)

        // Assert
        expect(cropped.width).toBe(4)
        expect(cropped.height).toBe(4)
        expect(drawImageSpy).toHaveBeenCalledWith(canvas, box.minX, box.minY, 4, 4, 0, 0, 4, 4)
    })

    it("should return the canvas untouched when it has no opaque pixel", () => {
        // Arrange
        jest.spyOn(CanvasRenderingContext2D.prototype, "getImageData").mockReturnValue({
            data: new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4)
        } as ImageData)
        const canvas = createCanvas()

        // Act
        const cropped = cropTransparentMargins(canvas)

        // Assert
        expect(cropped).toBe(canvas)
    })
})

describe("onExportBackground", () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it("should leave the image transparent without an export background", () => {
        // Arrange
        const canvas = createCanvas()

        // Act
        const exported = onExportBackground(canvas, null)

        // Assert
        expect(exported).toBe(canvas)
    })

    it("should lay the image on the export background", () => {
        // Arrange
        const fillRectSpy = jest.spyOn(CanvasRenderingContext2D.prototype, "fillRect")
        const drawImageSpy = jest.spyOn(CanvasRenderingContext2D.prototype, "drawImage")
        const canvas = createCanvas()

        // Act
        const exported = onExportBackground(canvas, "#1e2329")

        // Assert
        expect(exported.width).toBe(CANVAS_WIDTH + 32)
        expect(exported.height).toBe(CANVAS_HEIGHT + 32)
        expect(fillRectSpy).toHaveBeenCalledWith(0, 0, CANVAS_WIDTH + 32, CANVAS_HEIGHT + 32)
        expect(fillRectSpy.mock.invocationCallOrder[0]).toBeLessThan(drawImageSpy.mock.invocationCallOrder[0])
        expect(drawImageSpy).toHaveBeenCalledWith(canvas, 16, 16)
    })
})
