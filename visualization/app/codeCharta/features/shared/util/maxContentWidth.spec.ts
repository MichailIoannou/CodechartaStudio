import { maxContentWidth } from "./maxContentWidth"

describe("maxContentWidth", () => {
    it("should read the width at max-content and give the element back its own width", () => {
        // Arrange
        const element = document.createElement("div")
        element.style.width = "40px"
        let widthWhenRead = ""
        element.getBoundingClientRect = () => {
            widthWhenRead = element.style.width
            return { width: 96 } as DOMRect
        }

        // Act
        const width = maxContentWidth(element)

        // Assert
        expect(width).toBe(96)
        expect(widthWhenRead).toBe("max-content")
        expect(element.style.width).toBe("40px")
    })
})
