import { expect, type Page, test } from "@playwright/test"
import { clearIndexedDB, goto } from "../../playwright.helper"
import { MetricsBarPageObject } from "../features/metricsBar/components/metricsBar/metricsBar.po"
import { ExplorerTreeLevelPageObject } from "../features/sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { SidebarInspectorPageObject } from "../features/sidebarInspector/components/sidebarInspector/sidebarInspector.po"
import { CompactMetricsBarPageObject } from "./compactMetricsBar.po"

const NARROW_WINDOW = { width: 900, height: 900 }
const WIDE_WINDOW = { width: 1600, height: 900 }
const WINDOW_STEP_PX = 8
const SAME_HEIGHT_PX = 74
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

    test("should turn compact between both open side panels and stay compact until 32 px more than needed are free", async ({ page }) => {
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

        // Arrange
        const compactBar = new CompactMetricsBarPageObject(page)
        await compactBar.resizeTo(WIDE_WINDOW.width)
        await expect(metricsBar.bar()).not.toHaveAttribute("data-compact")

        // Act
        const compactBelow = await compactBar.narrowestFullWindow(WIDE_WINDOW.width, WINDOW_STEP_PX)
        await compactBar.resizeTo(compactBelow + 3 * WINDOW_STEP_PX)
        const isCompactJustAbove = await compactBar.isCompact()
        await compactBar.resizeTo(compactBelow + 5 * WINDOW_STEP_PX)

        // Assert
        expect(isCompactJustAbove).toBe(true)
        await expect(metricsBar.bar()).not.toHaveAttribute("data-compact")
        await expect(page.getByTestId("metric-segment-area")).toBeVisible()
    })

    test("should keep the bar 74 px tall in both forms", async ({ page }) => {
        // Arrange
        await page.setViewportSize(WIDE_WINDOW)
        await goto(page)
        await openInspectorBesideExplorer(page)
        const compactBar = new CompactMetricsBarPageObject(page)
        const fullHeight = await compactBar.height()

        // Act
        await compactBar.resizeTo(NARROW_WINDOW.width)

        // Assert
        await expect(new MetricsBarPageObject(page).bar()).toHaveAttribute("data-compact", "true")
        expect(fullHeight).toBe(SAME_HEIGHT_PX)
        expect(await compactBar.height()).toBe(SAME_HEIGHT_PX)
    })

    test("should animate the switch and switch instantly with reduced motion", async ({ page }) => {
        // Arrange
        await page.setViewportSize(WIDE_WINDOW)
        await goto(page)
        await openInspectorBesideExplorer(page)
        const compactBar = new CompactMetricsBarPageObject(page)

        // Act
        const animatedSwitch = await compactBar.switchAnimationsWhenResizedTo(NARROW_WINDOW.width)
        await page.emulateMedia({ reducedMotion: "reduce" })
        await compactBar.resizeTo(WIDE_WINDOW.width)
        const instantSwitch = await compactBar.switchAnimationsWhenResizedTo(NARROW_WINDOW.width)

        // Assert
        expect(animatedSwitch).toBeGreaterThan(0)
        expect(instantSwitch).toBe(0)
        await expect(new MetricsBarPageObject(page).bar()).toHaveAttribute("data-compact", "true")
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
