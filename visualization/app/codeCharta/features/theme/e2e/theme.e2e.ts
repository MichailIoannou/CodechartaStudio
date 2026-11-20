import { expect, test } from "@playwright/test"
import { clearIndexedDB, goto, readPersistedPreference } from "../../../../playwright.helper"
import { THEMES } from "../../../util/theme/themes"
import { ViewSwitcherPageObject } from "../../navBar/components/viewSwitcher/viewSwitcher.po"
import { ThemePickerPageObject } from "../components/themePicker/themePicker.po"

test.describe("Theme", () => {
    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should start a fresh profile in the dark theme", async ({ page }) => {
        // Arrange
        const themePicker = new ThemePickerPageObject(page)

        // Act
        await goto(page)

        // Assert
        await expect(themePicker.documentRoot()).toHaveAttribute("data-theme", "cc-dark")
        await expect.poll(() => themePicker.mapCornerColor()).toBe("#14171b")
    })

    test("should switch the chrome and the map to the light theme", async ({ page }) => {
        // Arrange
        const themePicker = new ThemePickerPageObject(page)
        await goto(page)

        // Act
        await themePicker.pick("CodeCharta Light")

        // Assert
        await expect(themePicker.documentRoot()).toHaveAttribute("data-theme", "cc-light")
        await expect.poll(() => themePicker.mapCornerColor()).toBe("#f4f4eb")
    })

    test("should keep the theme after a reload", async ({ page }) => {
        // Arrange
        const themePicker = new ThemePickerPageObject(page)
        await goto(page)
        await themePicker.pick("CodeCharta Light")
        await expect.poll(() => readPersistedPreference(page, "theme"), { timeout: 30_000 }).toBe("cc-light")

        // Act
        await goto(page)

        // Assert
        await expect(themePicker.documentRoot()).toHaveAttribute("data-theme", "cc-light")
    })

    test("should start in the saved light theme without a dark frame", async ({ page }) => {
        // Arrange
        const themePicker = new ThemePickerPageObject(page)
        await goto(page)
        await themePicker.pick("CodeCharta Light")
        await expect.poll(() => readPersistedPreference(page, "theme"), { timeout: 30_000 }).toBe("cc-light")
        await page.addInitScript(() => {
            document.addEventListener("DOMContentLoaded", () => {
                ;(window as unknown as { themeAtDomContentLoaded: string }).themeAtDomContentLoaded = document.documentElement.dataset.theme
            })
        })

        // Act
        await goto(page)

        // Assert
        const themeAtDomContentLoaded = await page.evaluate(
            () => (window as unknown as { themeAtDomContentLoaded: string }).themeAtDomContentLoaded
        )
        expect(themeAtDomContentLoaded).toBe("cc-light")
    })

    test("should follow the system when asked to", async ({ page }) => {
        // Arrange
        const themePicker = new ThemePickerPageObject(page)
        await page.emulateMedia({ colorScheme: "light" })
        await goto(page)

        // Act
        await themePicker.pick("Follow system")

        // Assert
        await expect(themePicker.documentRoot()).toHaveAttribute("data-theme", "cc-light")
        await expect(page.getByTestId("theme-picker-current")).toHaveText("Currently: CodeCharta Light")
    })

    for (const theme of THEMES) {
        test(`should draw every view in ${theme.label} without errors`, async ({ page }) => {
            // Arrange
            const errors: string[] = []
            page.on("console", message => {
                if (message.type() === "error") {
                    errors.push(message.text())
                }
            })
            const themePicker = new ThemePickerPageObject(page)
            const viewSwitcher = new ViewSwitcherPageObject(page)
            await goto(page)

            // Act
            await themePicker.pick(theme.label)
            await expect(themePicker.documentRoot()).toHaveAttribute("data-theme", theme.id)
            await expect.poll(() => themePicker.mapCornerColor()).toBe(theme.render.map.background)
            const navBar = await themePicker.navBarColors()
            await viewSwitcher.switchToDomain()
            await expect(page.locator("cc-word-cloud canvas")).toBeVisible()
            await viewSwitcher.switchToDependencies()
            await expect(page.locator("cc-dependency-graph canvas").first()).toBeVisible()

            // Assert
            expect(navBar.background).not.toBe(navBar.text)
            expect(errors).toEqual([])
        })
    }
})
