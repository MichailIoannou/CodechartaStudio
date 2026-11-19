import { RadialFolderStyle, RadialFolderValue } from "../model/codeCharta.model"
import { defaultMapColors } from "../stores/mapState/mapState.read.facade"
import { folderSwatchBackground, mixColors, neutralFolderColor, RADIAL_FOLDER_VALUES, tintColor } from "./radialFolderValues"
import { setActiveTheme } from "./theme/activeTheme"
import { themeById } from "./theme/themes"

describe("radialFolderValues", () => {
    it("should describe every folder value exactly once", () => {
        // Act
        const described = RADIAL_FOLDER_VALUES.map(descriptor => descriptor.value)

        // Assert
        expect(described).toEqual(Object.values(RadialFolderValue))
    })

    it("should mix a colour toward white by the tint strength", () => {
        // Act
        const tints = [1, 0.5, 0].map(tint => tintColor("#69AE40", tint))

        // Assert
        expect(tints).toEqual(["#69ae40", "#b4d7a0", "#ffffff"])
    })

    it("should mix two colours by a fraction", () => {
        // Act
        const mixed = mixColors("#000000", "#ffffff", 0.25)

        // Assert
        expect(mixed).toBe("#404040")
    })

    it("should show tinted folders as the tinted traffic light", () => {
        // Act
        const background = folderSwatchBackground(defaultMapColors, RadialFolderStyle.Tinted, 1)

        // Assert
        expect(background).toBe("linear-gradient(90deg, #69ae40, #ddcc00, #820e0e)")
    })

    it("should show neutral folders as the one neutral grey", () => {
        // Act
        const background = folderSwatchBackground(defaultMapColors, RadialFolderStyle.Neutral, 1)

        // Assert
        expect(background).toBe(neutralFolderColor())
    })

    it("should fade a tint toward the surface of a dark theme", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))

        // Act
        const faded = tintColor("#69AE40", 0)

        // Assert
        expect(faded).toBe("#1e2329")
    })
})
