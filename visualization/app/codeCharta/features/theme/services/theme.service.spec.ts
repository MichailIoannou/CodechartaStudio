import { TestBed } from "@angular/core/testing"
import { activeTheme } from "../../../util/theme/activeTheme"
import { resolveTheme } from "../../../util/theme/resolveTheme"
import { ThemeService } from "./theme.service"

describe("ThemeService", () => {
    afterEach(() => {
        delete document.documentElement.dataset["theme"]
        document.documentElement.style.colorScheme = ""
    })

    it("should name the theme on the document and set its color scheme", () => {
        // Arrange
        const dark = resolveTheme("cc-dark", "light")

        // Act
        TestBed.inject(ThemeService).apply(dark)

        // Assert
        expect(document.documentElement.dataset["theme"]).toBe("cc-dark")
        expect(document.documentElement.style.colorScheme).toBe("dark")
        expect(activeTheme()).toBe(dark)
    })
})
