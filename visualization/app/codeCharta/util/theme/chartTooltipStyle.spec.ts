import { setActiveTheme } from "./activeTheme"
import { chartTooltipStyle } from "./chartTooltipStyle"
import { themeById } from "./themes"

describe("chartTooltipStyle", () => {
    it("should style a tooltip with the colors of the active theme", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))

        // Act
        const style = chartTooltipStyle()

        // Assert
        expect(style).toEqual({ backgroundColor: "#262c34", borderColor: "#3a424d", textStyle: { color: "#e6e9ee" } })
    })

    it("should follow the theme when it changes", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))
        setActiveTheme(themeById("cc-light"))

        // Act
        const style = chartTooltipStyle()

        // Assert
        expect(style).toEqual({ backgroundColor: "#ffffff", borderColor: "#d1d5db", textStyle: { color: "#1f2937" } })
    })
})
