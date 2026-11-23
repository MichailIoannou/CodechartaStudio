import { expect, test } from "@playwright/test"
import { clearIndexedDB, collapseExplorer, goto } from "../../../../../playwright.helper"
import { NodeContextMenuPageObject } from "../../../nodeContextMenu/components/nodeContextMenu/nodeContextMenu.po"
import { ExplorerTreeLevelPageObject } from "./explorerTreeLevel.po"

test.describe("ExplorerTreeLevel", () => {
    test.beforeEach(async ({ page }) => {
        await goto(page)
    })

    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test.describe("Excluding", () => {
        test("excluding a building should exclude it from the tree-view as well", async ({ page }) => {
            const explorerTreeLevel = new ExplorerTreeLevelPageObject(page)
            const nodeContextMenu = new NodeContextMenuPageObject(page)

            const filePath = "/root/sample1.cc.json/ParentLeaf/smallLeaf.html"

            await explorerTreeLevel.openFolder("/root/sample1.cc.json")
            await explorerTreeLevel.openFolder("/root/sample1.cc.json/ParentLeaf")
            await explorerTreeLevel.openContextMenu(filePath)
            await nodeContextMenu.exclude()

            await expect(explorerTreeLevel.node(filePath)).toHaveCount(0)
        })
    })

    test.describe("Collapsing the explorer", () => {
        test("should show the same rows again, still open, when the explorer is re-opened", async ({ page }) => {
            // Arrange
            const explorerTreeLevel = new ExplorerTreeLevelPageObject(page)
            const filePath = "/root/sample1.cc.json/bigLeaf.ts"
            await explorerTreeLevel.openFolder("/root/sample1.cc.json")
            await explorerTreeLevel.node(filePath).evaluate(row => row.setAttribute("data-e2e-kept", "true"))

            // Act
            await collapseExplorer(page)
            await expect(explorerTreeLevel.node(filePath)).toBeHidden()
            await page.getByTestId("explorer-expand-button").click()

            // Assert
            await expect(explorerTreeLevel.node(filePath)).toBeVisible()
            await expect(explorerTreeLevel.node(filePath)).toHaveAttribute("data-e2e-kept", "true")
        })
    })

    test.describe("NodeContextMenu", () => {
        test("should keep node marked when hovering over another node while context menu is open", async ({ page }) => {
            const explorerTreeLevel = new ExplorerTreeLevelPageObject(page)

            // Arrange
            const markedNodePath = "/root/sample1.cc.json/bigLeaf.ts"
            const hoverNodePath = "/root/sample1.cc.json/sample1OnlyLeaf.scss"

            await explorerTreeLevel.openFolder("/root/sample1.cc.json")

            // Act
            await explorerTreeLevel.openContextMenu(markedNodePath)
            const markedBeforeHover = await explorerTreeLevel.hasMarkedClass(markedNodePath)
            await explorerTreeLevel.hoverNodeWithoutScrolling(hoverNodePath)

            // Assert
            const markedAfterHover = await explorerTreeLevel.hasMarkedClass(markedNodePath)
            expect(markedBeforeHover).toBe(true)
            expect(markedAfterHover).toBe(true)
        })
    })
})
