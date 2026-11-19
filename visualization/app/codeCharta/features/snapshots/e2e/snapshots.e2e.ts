import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { SnapshotsPageObject } from "./snapshots.po"

const ASSETS = join(__dirname, "..", "..", "..", "assets")
const SAMPLE1 = [...gzipSync(readFileSync(join(ASSETS, "sample1.cc.json")))]
const WORKING_TREE_SNAPSHOT_ID = "worktree-20260101T000000000Z-01234567"
const FIRST_JOB_ID = "job-0000000000000001"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], { name: "billing" })

test.describe("Snapshots", () => {
    test("should analyse the working folder from the workspace status and show its map", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        await standInForTheDesktopBridge(page, {
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshotMaps: { [WORKING_TREE_SNAPSHOT_ID]: SAMPLE1 }
        })
        await goto(page)
        await expect(snapshots.workspaceStatus()).toContainText("not analysed")

        // Act
        await snapshots.analyseCurrentCheckoutFromTheStatus()
        await expect(snapshots.workspaceStatus()).toContainText("Analysing…")
        await snapshots.completeJob(FIRST_JOB_ID)

        // Assert
        await expect(page.locator("cc-sidebar-explorer")).toContainText("sample1OnlyLeaf.scss")
        await expect(snapshots.workspaceStatus()).not.toContainText("not analysed")
    })

    test("should list the new snapshot in the snapshots dialog", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        await standInForTheDesktopBridge(page, { projects: [BILLING], activeProjectId: "p-billing" })
        await goto(page)
        await snapshots.analyseCurrentCheckoutFromTheStatus()
        await snapshots.completeJob(FIRST_JOB_ID)

        // Act
        await snapshots.openSnapshotsDialog()

        // Assert
        await expect(snapshots.snapshotsDialog().getByTestId("snapshots-row")).toHaveCount(1)
        await expect(snapshots.snapshotsDialog().getByTestId("snapshots-row")).toContainText("working tree")
    })
})
