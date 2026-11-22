import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { LocalSourcePageObject } from "../../localSource/e2e/localSource.po"
import { ExplorerTreeLevelPageObject } from "../../sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { aFolder, aPickedFolder, aPickedImportFile, aProject, aSnapshot } from "../projects.mocks"
import { ProjectsPageObject } from "./projects.po"

const ASSETS = join(__dirname, "..", "..", "..", "assets")
const SAMPLE1 = [...gzipSync(readFileSync(join(ASSETS, "sample1.cc.json")))]
const SAMPLE2 = [...gzipSync(readFileSync(join(ASSETS, "sample2.cc.json")))]

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], { name: "billing" })
const DOTFILES = aProject("p-dots", [aFolder("f-dots", { label: "dotfiles" })], { name: "dotfiles" })
const SEED = {
    projects: [BILLING, DOTFILES],
    activeProjectId: "p-billing",
    snapshots: [aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "a1b2c3d" }), aSnapshot("p-dots", "f-dots", "s-dots")],
    snapshotMaps: { "s-api": SAMPLE1, "s-dots": SAMPLE2 }
}

test.describe("Projects", () => {
    test("should boot a seeded project with a snapshot into the map", async ({ page }) => {
        // Arrange
        const projects = new ProjectsPageObject(page)
        await standInForTheDesktopBridge(page, SEED)

        // Act
        await goto(page)

        // Assert
        await expect(projects.switcherTrigger()).toContainText("billing-api")
        await expect(projects.viewSwitcher()).toBeVisible()
        await expect(page.locator("cc-sidebar-explorer")).toContainText("sample1OnlyLeaf.scss")
    })

    test("should swap the map when another project is chosen", async ({ page }) => {
        // Arrange
        const projects = new ProjectsPageObject(page)
        await standInForTheDesktopBridge(page, SEED)
        await goto(page)

        // Act
        await projects.chooseFolderOfOtherProject("dotfiles", "dotfiles")

        // Assert
        await expect(projects.switcherTrigger()).toContainText("dotfiles")
        await expect(page.locator("cc-sidebar-explorer")).not.toContainText("sample1OnlyLeaf.scss")
        await expect(page.locator("cc-sidebar-explorer")).toContainText("bigLeaf.ts")
    })

    test("should create a project and list its folders on the overview", async ({ page }) => {
        // Arrange
        const projects = new ProjectsPageObject(page)
        await standInForTheDesktopBridge(page, { pickedFolders: [aPickedFolder("billing-api"), aPickedFolder("billing-web")] })
        await goto(page)
        await expect(projects.overview()).toContainText("No projects yet.")

        // Act
        await projects.createProject("billing", 2)

        // Assert
        await expect(projects.overview().getByRole("heading", { name: "billing" })).toBeVisible()
        await expect(projects.overviewFolders()).toHaveText(["billing-api", "billing-web"])
        await expect(projects.viewSwitcher()).toHaveCount(0)
    })

    test("should open a cc.json file with Ctrl+O into a new project and show its map", async ({ page }) => {
        // Arrange
        const projects = new ProjectsPageObject(page)
        const firstImportedId = "imported-0000000000000003"
        await standInForTheDesktopBridge(page, {
            pickedImportFile: aPickedImportFile("Downloads"),
            snapshotMaps: { [firstImportedId]: SAMPLE1 }
        })
        await goto(page)
        await expect(projects.overview()).toContainText("No projects yet.")

        // Act
        await projects.openFileWithShortcut()
        await expect(projects.openFileDialog()).toContainText("Imported snapshot — analysis time unknown")
        await projects.openFileDialog().getByTestId("open-file-submit").click()

        // Assert
        await expect(projects.switcherTrigger()).toContainText("Downloads")
        await expect(page.locator("cc-sidebar-explorer")).toContainText("sample1OnlyLeaf.scss")
    })

    test("should show a source file of a project map from its folder without asking for a folder", async ({ page }) => {
        // Arrange
        const localSource = new LocalSourcePageObject(page)
        await standInForTheDesktopBridge(page, { ...SEED, sourceFiles: { "f-api/bigLeaf.ts": "export const big = 42" } })
        await goto(page)

        // Act
        await new ExplorerTreeLevelPageObject(page).openContextMenu("/root/bigLeaf.ts")
        await page.locator("#codemap-context-menu").getByText("Show Source").click()

        // Assert
        await expect(localSource.sourceDialog()).toContainText("export const big = 42")
        await expect(localSource.folderDialog()).toHaveCount(0)
    })

    test("should offer to re-link a missing project folder when its source is asked for", async ({ page }) => {
        // Arrange
        const missingApi = aProject("p-billing", [aFolder("f-api", { label: "billing-api", status: "missing" })], { name: "billing" })
        await standInForTheDesktopBridge(page, { ...SEED, projects: [missingApi, DOTFILES], pickedFolders: [aPickedFolder("billing-api")] })
        await goto(page)
        await new ExplorerTreeLevelPageObject(page).openContextMenu("/root/bigLeaf.ts")
        await page.locator("#codemap-context-menu").getByText("Show Source").click()
        const unavailable = page.getByTestId("local-source-unavailable-folder-dialog")
        await expect(unavailable).toContainText("The folder 'billing-api' is not available, so its files cannot be opened.")

        // Act
        await unavailable.getByRole("button", { name: "Re-link folder…" }).click()

        // Assert
        await expect(unavailable).not.toBeVisible()
        await expect(new LocalSourcePageObject(page).folderDialog()).toHaveCount(0)
    })

    test("should keep the upload button and no project menu without a bridge", async ({ page }) => {
        // Arrange & Act
        const projects = new ProjectsPageObject(page)
        await goto(page)

        // Assert
        await expect(projects.switcherTrigger()).toHaveCount(0)
        await expect(page.locator("cc-nav-bar-folder-button")).toHaveCount(1)
    })
})
