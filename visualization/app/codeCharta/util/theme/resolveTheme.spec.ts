import { SYSTEM_THEME } from "../../model/theme.model"
import { resolveTheme } from "./resolveTheme"
import { DEFAULT_THEME_ID, SYSTEM_THEME_BY_SCHEME } from "./themes"

describe("resolveTheme", () => {
    it("should follow the system scheme for the system preference", () => {
        // Arrange
        const preference = SYSTEM_THEME

        // Act
        const inLightSystem = resolveTheme(preference, "light")
        const inDarkSystem = resolveTheme(preference, "dark")

        // Assert
        expect(inLightSystem.id).toBe(SYSTEM_THEME_BY_SCHEME.light)
        expect(inDarkSystem.id).toBe(SYSTEM_THEME_BY_SCHEME.dark)
    })

    it("should fall back to the default theme for an unknown id", () => {
        // Arrange
        const removedTheme = "midnight"

        // Act
        const theme = resolveTheme(removedTheme, "light")

        // Assert
        expect(theme.id).toBe(DEFAULT_THEME_ID)
    })

    it("should take a picked theme whatever the system scheme", () => {
        // Arrange
        const picked = "cc-light"

        // Act
        const theme = resolveTheme(picked, "dark")

        // Assert
        expect(theme.id).toBe("cc-light")
    })
})
