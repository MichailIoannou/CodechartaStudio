import { setThemePreference } from "./theme.actions"
import { defaultTheme, theme } from "./theme.reducer"

describe("theme", () => {
    it("should start in the dark theme", () => {
        // Arrange
        const initAction = { type: "@@INIT" }

        // Act
        const result = theme(undefined, initAction)

        // Assert
        expect(result).toBe(defaultTheme)
        expect(result).toBe("cc-dark")
    })

    it("should keep the picked theme", () => {
        // Arrange
        const pick = setThemePreference({ value: "cc-light" })

        // Act
        const result = theme("cc-dark", pick)

        // Assert
        expect(result).toBe("cc-light")
    })
})
