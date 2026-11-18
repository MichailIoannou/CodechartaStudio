import { contrastRatio } from "./contrast"

describe("contrast", () => {
    it("should rate black on white 21", () => {
        // Arrange
        const black = "#000000"
        const white = "#ffffff"

        // Act
        const ratio = contrastRatio(black, white)

        // Assert
        expect(ratio).toBeCloseTo(21)
    })

    it("should rate a color on itself 1 whichever comes first", () => {
        // Arrange
        const grey = "#808080"

        // Act
        const ratio = contrastRatio(grey, grey)

        // Assert
        expect(ratio).toBe(1)
    })

    it("should give the same ratio with foreground and background swapped", () => {
        // Arrange
        const dark = "#1f2937"
        const light = "#f9fafb"

        // Act
        const darkOnLight = contrastRatio(dark, light)
        const lightOnDark = contrastRatio(light, dark)

        // Assert
        expect(darkOnLight).toBeCloseTo(lightOnDark)
    })
})
