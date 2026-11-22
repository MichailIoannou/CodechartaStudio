import { measureShortenedTextWidth, measureTextWidth } from "./measureTextWidth"

describe("measureTextWidth", () => {
    let measured: string[]
    let fonts: string[]

    beforeEach(() => {
        measured = []
        fonts = []
        jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (this: CanvasRenderingContext2D, text) {
            measured.push(text)
            fonts.push(this.font)
            return { width: text.length * 7 } as TextMetrics
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    function anElementWithFont() {
        const element = document.createElement("span")
        element.style.font = "italic 600 14px Inter"
        document.body.appendChild(element)
        return element
    }

    it("should measure the text in the font of the element", () => {
        // Arrange
        const element = anElementWithFont()

        // Act
        const width = measureTextWidth("billing-api", element)

        // Assert
        expect(width).toBe(77)
        expect(fonts[0]).toContain("14px")
    })

    it("should measure a long text cut to its first characters plus an ellipsis", () => {
        // Arrange
        const element = anElementWithFont()

        // Act
        const width = measureShortenedTextWidth("sonar_complexity", 12, element)

        // Assert
        expect(measured).toEqual(["sonar_comple…"])
        expect(width).toBe(91)
    })

    it("should measure a short text whole", () => {
        // Arrange
        const element = anElementWithFont()

        // Act
        measureShortenedTextWidth("rloc", 12, element)

        // Assert
        expect(measured).toEqual(["rloc"])
    })
})
