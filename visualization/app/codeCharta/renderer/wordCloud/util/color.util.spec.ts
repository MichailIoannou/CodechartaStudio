import { setActiveTheme } from "../../../util/theme/activeTheme"
import { themeById } from "../../../util/theme/themes"
import { getWordCloudColors, interpolateColor } from "./color.util"

describe("color.util", () => {
    describe("interpolateColor", () => {
        it("should return the start color at factor 0", () => {
            expect(interpolateColor("#000000", "#ffffff", 0)).toBe("#000000")
        })

        it("should return the end color at factor 1", () => {
            expect(interpolateColor("#000000", "#ffffff", 1)).toBe("#ffffff")
        })

        it("should return the midpoint at factor 0.5", () => {
            expect(interpolateColor("#000000", "#ffffff", 0.5)).toBe("#808080")
        })

        it("should interpolate the word cloud gradient endpoints", () => {
            expect(interpolateColor("#e6007e", "#0030ff", 0.5)).toBe("#7318bf")
        })

        it("should clamp a factor above 1 to the end color", () => {
            expect(interpolateColor("#000000", "#ffffff", 5)).toBe("#ffffff")
        })

        it("should clamp a negative factor to the start color", () => {
            expect(interpolateColor("#102030", "#ffffff", -2)).toBe("#102030")
        })

        it("should fall back to the default start color for a malformed start color", () => {
            expect(interpolateColor("not-a-color", "#ffffff", 0)).toBe("#e6007e")
        })
    })

    describe("getWordCloudColors", () => {
        it("should take the gradient from the active theme", () => {
            // Arrange
            setActiveTheme(themeById("cc-dark"))

            // Act
            const [start, end] = getWordCloudColors()

            // Assert
            expect([start, end]).toEqual(["#ff6ab8", "#7da2ff"])
        })

        it("should take the light gradient in the light theme", () => {
            // Act
            const [start, end] = getWordCloudColors()

            // Assert
            expect([start, end]).toEqual(["#e6007e", "#0030ff"])
        })
    })
})
