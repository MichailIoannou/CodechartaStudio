import { expect, type Locator, type Page, test } from "@playwright/test"
import { clearIndexedDB, collapseExplorer, goto } from "../../playwright.helper"
import { MetricsBarPageObject } from "../features/metricsBar/components/metricsBar/metricsBar.po"
import { ExplorerTreeLevelPageObject } from "../features/sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { SidebarInspectorPageObject } from "../features/sidebarInspector/components/sidebarInspector/sidebarInspector.po"
import { CompactMetricsBarPageObject } from "./compactMetricsBar.po"

const NARROW_WINDOW = { width: 900, height: 900 }
const WIDE_WINDOW = { width: 1600, height: 900 }
const WINDOW_STEP_PX = 8
const COARSE_WINDOW_STEP_PX = 50
const SAME_HEIGHT_PX = 74
const SAMPLE_FOLDER = "/root/sample1.cc.json"
const SAMPLE_FILE = "/root/sample1.cc.json/bigLeaf.ts"

async function openInspectorBesideExplorer(page: Page) {
    const explorerTreeLevel = new ExplorerTreeLevelPageObject(page)
    await explorerTreeLevel.openFolder(SAMPLE_FOLDER)
    await explorerTreeLevel.selectNode(SAMPLE_FILE)
    await expect(new SidebarInspectorPageObject(page).nodeName()).toHaveText("bigLeaf.ts")
}

type Box = { x: number; y: number; width: number; height: number }

async function boundingBoxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) {
        throw new Error("The element has not been laid out")
    }
    return box
}

function overlapsHorizontally(first: Box, second: Box) {
    return first.x < second.x + second.width && second.x < first.x + first.width
}

async function isCoveredByASidePanel(page: Page) {
    const bar = await boundingBoxOf(new MetricsBarPageObject(page).bar())
    const explorer = await boundingBoxOf(page.locator("cc-sidebar-explorer"))
    const inspector = await boundingBoxOf(page.locator("cc-sidebar-inspector"))
    return overlapsHorizontally(bar, explorer) || overlapsHorizontally(bar, inspector)
}

test.describe("Compact metrics bar", () => {
    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should turn compact with both side panels open and stay compact until its room is 32 px more than needed", async ({ page }) => {
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

    test("should turn compact rather than reach under a side panel while the window narrows", async ({ page }) => {
        // Arrange
        await page.setViewportSize(WIDE_WINDOW)
        await goto(page)
        await openInspectorBesideExplorer(page)
        const compactBar = new CompactMetricsBarPageObject(page)
        const coveredAt: number[] = []

        // Act
        for (let width = WIDE_WINDOW.width; width >= NARROW_WINDOW.width; width -= COARSE_WINDOW_STEP_PX) {
            await compactBar.resizeTo(width)
            if (await isCoveredByASidePanel(page)) {
                coveredAt.push(width)
            }
        }

        // Assert
        expect(coveredAt).toEqual([])
        await expect(new MetricsBarPageObject(page).bar()).toHaveAttribute("data-compact", "true")
    })

    test("should get no more room when the explorer collapses, so it turns compact at the same window width", async ({ page }) => {
        // Arrange
        await page.setViewportSize(WIDE_WINDOW)
        await goto(page)
        await openInspectorBesideExplorer(page)
        const compactBar = new CompactMetricsBarPageObject(page)
        const compactBelowWithBothPanels = await compactBar.narrowestFullWindow(WIDE_WINDOW.width, WINDOW_STEP_PX)
        await compactBar.resizeTo(WIDE_WINDOW.width)

        // Act
        await collapseExplorer(page)
        const compactBelowWithTheInspectorOnly = await compactBar.narrowestFullWindow(WIDE_WINDOW.width, WINDOW_STEP_PX)

        // Assert
        expect(compactBelowWithTheInspectorOnly).toBe(compactBelowWithBothPanels)
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
