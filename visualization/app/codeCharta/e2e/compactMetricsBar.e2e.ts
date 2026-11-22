import { expect, type Page, test } from "@playwright/test"
import { clearIndexedDB, goto } from "../../playwright.helper"
import { MetricsBarPageObject } from "../features/metricsBar/components/metricsBar/metricsBar.po"
import { ExplorerTreeLevelPageObject } from "../features/sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { SidebarInspectorPageObject } from "../features/sidebarInspector/components/sidebarInspector/sidebarInspector.po"

const NARROW_WINDOW = { width: 900, height: 900 }
const JUST_ABOVE_THE_FULL_BAR_FLOOR = { width: 1150, height: 900 }
const WIDE_ENOUGH_WINDOW = { width: 1250, height: 900 }
const SAMPLE_FOLDER = "/root/sample1.cc.json"
const SAMPLE_FILE = "/root/sample1.cc.json/bigLeaf.ts"

async function openInspectorBesideExplorer(page: Page) {
    const explorerTreeLevel = new ExplorerTreeLevelPageObject(page)
    await explorerTreeLevel.openFolder(SAMPLE_FOLDER)
    await explorerTreeLevel.selectNode(SAMPLE_FILE)
    await expect(new SidebarInspectorPageObject(page).nodeName()).toHaveText("bigLeaf.ts")
}

test.describe("Compact metrics bar", () => {
    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should turn compact between both open side panels and return once 32rem of map are free", async ({ page }) => {
        // Arrange
        await page.setViewportSize(NARROW_WINDOW)
        await goto(page)
        const metricsBar = new MetricsBarPageObject(page)

        // Act
        await openInspectorBesideExplorer(page)

        // Assert
        await expect(metricsBar.bar()).toHaveAttribute("data-compact", "true")
        await expect(page.getByTestId("explorer-collapse-button")).toBeVisible()
        await expect(new SidebarInspectorPageObject(page).nodeName()).toBeVisible()

        // Act
        await page.setViewportSize(JUST_ABOVE_THE_FULL_BAR_FLOOR)

        // Assert
        await expect(metricsBar.bar()).toHaveAttribute("data-compact", "true")

        // Act
        await page.setViewportSize(WIDE_ENOUGH_WINDOW)

        // Assert
        await expect(metricsBar.bar()).not.toHaveAttribute("data-compact")
        await expect(page.getByTestId("metric-segment-area")).toBeVisible()
    })

    test("should open a cell's chooser and from it the cell's settings at the same button", async ({ page }) => {
        // Arrange
        await page.setViewportSize(NARROW_WINDOW)
        await goto(page)
        await openInspectorBesideExplorer(page)
        const areaButton = page.getByTestId("metric-segment-area-compact")

        // Act
        await areaButton.click()
        await page.getByTestId("metric-select-popover-metric-segment-area").getByTestId("settings-shortcut").click()

        // Assert
        await expect(page.locator("#metric-select-popover-area")).toBeHidden()
        await expect(page.locator("#metric-settings-popover-area")).toBeVisible()

        // Act
        await page.keyboard.press("Escape")

        // Assert
        await expect(page.locator("#metric-settings-popover-area")).toBeHidden()
        await expect(areaButton).toBeFocused()
    })

    test("should name each button by its card and open the scenarios menu", async ({ page }) => {
        // Arrange
        await page.setViewportSize(NARROW_WINDOW)
        await goto(page)
        await openInspectorBesideExplorer(page)

        // Act
        await page.getByTestId("metric-segment-scenario-compact").click()

        // Assert
        await expect(page.getByTestId("metric-segment-area-compact")).toHaveAttribute("aria-label", /^Area · rloc/)
        await expect(page.getByTestId("metrics-bar-layout-cell-compact")).toHaveAttribute("aria-label", /^Layout · /)
        await expect(page.getByTestId("scenarios-menu-open")).toContainText("Open saved scenarios")
        await expect(page.getByTestId("scenarios-menu-save")).toBeVisible()
    })
})
