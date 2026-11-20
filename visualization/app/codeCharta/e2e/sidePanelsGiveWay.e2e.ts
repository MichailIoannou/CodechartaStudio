import { expect, type Page, test } from "@playwright/test"
import { clearIndexedDB, goto } from "../../playwright.helper"
import { ExplorerTreeLevelPageObject } from "../features/sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { SidebarInspectorPageObject } from "../features/sidebarInspector/components/sidebarInspector/sidebarInspector.po"

const NARROW_WINDOW = { width: 900, height: 900 }
const WIDE_ENOUGH_WINDOW = { width: 1150, height: 900 }
const SAMPLE_FOLDER = "/root/sample1.cc.json"
const SAMPLE_FILE = "/root/sample1.cc.json/bigLeaf.ts"

const explorerExpandButton = (page: Page) => page.getByTestId("explorer-expand-button")
const explorerCollapseButton = (page: Page) => page.getByTestId("explorer-collapse-button")

async function selectSampleFileInExplorer(page: Page) {
    const explorerTreeLevel = new ExplorerTreeLevelPageObject(page)
    await explorerTreeLevel.openFolder(SAMPLE_FOLDER)
    await explorerTreeLevel.selectNode(SAMPLE_FILE)
}

test.describe("Side panels give way", () => {
    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should collapse the panel on the other side whenever one opens in a narrow window", async ({ page }) => {
        // Arrange
        await page.setViewportSize(NARROW_WINDOW)
        await goto(page)
        const inspector = new SidebarInspectorPageObject(page)

        // Act & Assert: selecting in the explorer keeps the explorer, the inspector opens collapsed
        await selectSampleFileInExplorer(page)
        await expect(inspector.collapsedName()).toHaveText("bigLeaf.ts")
        await expect(explorerCollapseButton(page)).toBeVisible()

        // Act & Assert: opening the inspector collapses the explorer
        await inspector.expandButton().click()
        await expect(inspector.nodeName()).toHaveText("bigLeaf.ts")
        await expect(explorerExpandButton(page)).toBeVisible()

        // Act & Assert: reopening the explorer collapses the inspector, which keeps its file
        await explorerExpandButton(page).click()
        await expect(explorerCollapseButton(page)).toBeVisible()
        await expect(inspector.collapsedName()).toHaveText("bigLeaf.ts")
    })

    test("should keep the metrics bar's tools clickable beside the open inspector", async ({ page }) => {
        // Arrange
        await page.setViewportSize(NARROW_WINDOW)
        await goto(page)
        const inspector = new SidebarInspectorPageObject(page)
        await selectSampleFileInExplorer(page)
        await inspector.expandButton().click()
        await expect(inspector.nodeName()).toHaveText("bigLeaf.ts")

        // Act
        await page.getByTestId("legend-panel-button").click()

        // Assert
        await expect(page.getByTestId("legend-panel")).toBeVisible()
    })

    test("should keep both panels open while the window is wide enough and collapse the inspector once it narrows", async ({ page }) => {
        // Arrange
        await page.setViewportSize(WIDE_ENOUGH_WINDOW)
        await goto(page)
        const inspector = new SidebarInspectorPageObject(page)
        await selectSampleFileInExplorer(page)
        await expect(inspector.nodeName()).toHaveText("bigLeaf.ts")
        await expect(explorerCollapseButton(page)).toBeVisible()

        // Act
        await page.setViewportSize(NARROW_WINDOW)

        // Assert
        await expect(inspector.collapsedName()).toHaveText("bigLeaf.ts")
        await expect(explorerCollapseButton(page)).toBeVisible()
    })
})
