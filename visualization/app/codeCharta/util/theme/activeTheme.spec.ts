import { activeRenderPalette, activeTheme, setActiveTheme } from "./activeTheme"
import { resolveTheme } from "./resolveTheme"
import { DEFAULT_THEME_ID } from "./themes"

describe("activeTheme", () => {
    it("should start in the default theme", async () => {
        // Arrange
        jest.resetModules()

        // Act
        const freshModule = await import("./activeTheme")

        // Assert
        expect(freshModule.activeTheme().id).toBe(DEFAULT_THEME_ID)
    })

    it("should hand out the render palette of the theme set last", () => {
        // Arrange
        const dark = resolveTheme("cc-dark", "light")

        // Act
        setActiveTheme(dark)

        // Assert
        expect(activeTheme()).toBe(dark)
        expect(activeRenderPalette()).toBe(dark.render)
    })
})
