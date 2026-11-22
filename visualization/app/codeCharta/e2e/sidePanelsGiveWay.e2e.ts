import { expect, type Page, test } from "@playwright/test"
import { clearIndexedDB, goto } from "../../playwright.helper"
import { NavBarFolderButtonPageObject } from "../features/navBar/components/navBarFolderButton/navBarFolderButton.po"
import { ViewSwitcherPageObject } from "../features/navBar/components/viewSwitcher/viewSwitcher.po"
import { ExplorerTreeLevelPageObject } from "../features/sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { SidebarInspectorPageObject } from "../features/sidebarInspector/components/sidebarInspector/sidebarInspector.po"

const NARROW_WINDOW = { width: 900, height: 900 }
const WIDE_ENOUGH_WINDOW = { width: 1150, height: 900 }
const SAMPLE_FOLDER = "/root/sample1.cc.json"
const SAMPLE_FILE = "/root/sample1.cc.json/bigLeaf.ts"
const OTHER_SAMPLE_FILE = "/root/sample1.cc.json/sample1OnlyLeaf.scss"
const FILE_WITH_DECLARATIONS = "./app/codeCharta/resources/sample_with_declarations.cc.json"

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
        await expect(inspector.selectionChangedDot()).toHaveCount(0)

        // Act & Assert: another selection stays in the strip, marked as not yet seen
        await new ExplorerTreeLevelPageObject(page).selectNode(OTHER_SAMPLE_FILE)
        await expect(inspector.collapsedName()).toHaveText("sample1OnlyLeaf.scss")
        await expect(inspector.selectionChangedDot()).toBeVisible()
        await expect(explorerCollapseButton(page)).toBeVisible()
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

    test("should let the panels of the Dependencies view give way to each other in a narrow window", async ({ page }) => {
        // Arrange
        await page.setViewportSize(NARROW_WINDOW)
        await goto(page)
        await new NavBarFolderButtonPageObject(page).openFiles([FILE_WITH_DECLARATIONS])
        await new ViewSwitcherPageObject(page).switchToDependencies()
        const view = page.locator("cc-dependency-view")
        const inspector = view.locator("cc-dependency-inspector")
        const explorer = new ExplorerTreeLevelPageObject(page, "dependencies")

        // Act & Assert: selecting in the explorer keeps the explorer, the inspector opens collapsed
        await explorer.selectNode("/root/bigLeaf.ts")
        await expect(inspector.getByTestId("inspector-collapsed-name")).toHaveText("bigLeaf.ts")
        await expect(view.getByTestId("explorer-collapse-button")).toBeVisible()

        // Act & Assert: opening the inspector collapses the explorer
        await inspector.getByTestId("inspector-expand-button").click()
        await expect(inspector.getByTestId("dependency-inspector-title")).toHaveText("bigLeaf.ts")
        await expect(view.getByTestId("explorer-expand-button")).toBeVisible()

        // Act & Assert: reopening the explorer collapses the inspector, and a new selection only marks its strip
        await view.getByTestId("explorer-expand-button").click()
        await expect(inspector.getByTestId("inspector-collapsed-name")).toHaveText("bigLeaf.ts")
        await explorer.openFolder("/root/ParentLeaf")
        await explorer.selectNode("/root/ParentLeaf/otherSmallLeaf.ts")
        await expect(inspector.getByTestId("inspector-collapsed-name")).toHaveText("otherSmallLeaf.ts")
        await expect(inspector.getByTestId("inspector-selection-changed")).toBeVisible()
        await expect(view.getByTestId("explorer-collapse-button")).toBeVisible()
    })
})
