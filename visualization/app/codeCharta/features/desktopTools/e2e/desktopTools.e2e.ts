import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { aToolsReport, PATHS } from "../desktopTools.mocks"
import { DesktopToolsPageObject } from "./desktopTools.po"

test.describe("Desktop tools", () => {
    test("should hide the desktop tools without a bridge", async ({ page }) => {
        // Arrange
        const desktopTools = new DesktopToolsPageObject(page)
        await goto(page)

        // Act
        await desktopTools.openSettings()

        // Assert
        await expect(desktopTools.panel()).toHaveCount(0)
    })

    test("should list the tools of a stand-in bridge", async ({ page }) => {
        // Arrange
        const desktopTools = new DesktopToolsPageObject(page)
        await standInForTheDesktopBridge(page, { responses: { "tools.doctor": aToolsReport(), "paths.get": PATHS } })
        await goto(page)

        // Act
        await desktopTools.openSettings()

        // Assert
        await expect(desktopTools.toolNames()).toHaveText(["Git", "ccsh", "Java", "GitHub CLI", "GitLab CLI"])
        await expect(desktopTools.toolState("java")).toHaveText("too old")
        await expect(desktopTools.summary()).toHaveText("Git history is available; analyses need Java.")
    })
})
