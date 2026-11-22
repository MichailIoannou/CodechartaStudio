import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { WindowControlsPageObject } from "./windowControls.po"

test.describe("Window controls", () => {
    test("should end the nav bar with CodeCharta's window buttons on Linux and drag only from its background", async ({ page }) => {
        // Arrange
        const windowControls = new WindowControlsPageObject(page)
        await standInForTheDesktopBridge(page, { windowState: { platform: "linux", usesAppTitleBar: true, savedUseAppTitleBar: true } })
        await goto(page)

        // Act
        await windowControls.windowButton("Maximize").click()

        // Assert
        await expect(windowControls.windowButton("Restore")).toBeVisible()
        await expect(windowControls.windowButton("Minimize")).toBeVisible()
        await expect(windowControls.windowButton("Close")).toBeVisible()
        expect(await windowControls.appRegionOf("cc-nav-bar .navbar")).toBe("drag")
        expect(await windowControls.appRegionOf("cc-nav-bar .navbar-end .cc-window-drag-area")).toBe("drag")
        expect(await windowControls.appRegionOf("cc-settings-button")).toBe("no-drag")
        expect(await windowControls.appRegionOf("cc-window-controls")).toBe("no-drag")
    })

    test("should offer a restart once CodeCharta's title bar is switched on", async ({ page }) => {
        // Arrange
        const windowControls = new WindowControlsPageObject(page)
        await standInForTheDesktopBridge(page)
        await goto(page)
        await windowControls.openSettings()

        // Act
        await windowControls.titleBarToggle().check()

        // Assert
        await expect(windowControls.restartNow()).toBeVisible()
        await expect(windowControls.restartHint()).toHaveClass(/text-warning/)
        await expect(page.locator("cc-window-controls")).toHaveCount(0)
    })
})
