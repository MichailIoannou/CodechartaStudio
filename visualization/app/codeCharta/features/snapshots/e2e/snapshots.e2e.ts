import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { SnapshotsPageObject } from "./snapshots.po"

const ASSETS = join(__dirname, "..", "..", "..", "assets")
const SAMPLE1 = [...gzipSync(readFileSync(join(ASSETS, "sample1.cc.json")))]
const WORKING_TREE_SNAPSHOT_ID = "worktree-20260101T000000000Z-01234567"
const FIRST_JOB_ID = "job-0000000000000001"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], { name: "billing" })
const HEAD_SHA = "a1b2c3d".padEnd(40, "0")
const OLDER = aSnapshot("p-billing", "f-api", "s-older", {
    commit: "9f8e7d6".padEnd(40, "0"),
    shortCommit: "9f8e7d6",
    subject: "Release 2.4.0",
    target: "commit"
})
const STATUS_AT_HEAD = {
    head: { kind: "branch" as const, name: "main", commit: HEAD_SHA },
    upstream: null,
    counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
    operationInProgress: null
}

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

    test("should show the stale notice for a scripted resolution and switch to the analysis of the current checkout", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        await standInForTheDesktopBridge(page, {
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [OLDER],
            snapshotMaps: { "s-older": SAMPLE1, [WORKING_TREE_SNAPSHOT_ID]: SAMPLE1 },
            gitStatuses: { "f-api": STATUS_AT_HEAD },
            resolutions: {
                "f-api/workingTree": { kind: "nearest", snapshot: OLDER, isCurrentProfile: true, relation: "ancestor", behind: 3, ahead: 0 }
            }
        })
        await goto(page)
        await expect(snapshots.notice()).toContainText(
            "No analysis of the current checkout — showing 9f8e7d6 (Release 2.4.0), stale by 3 commits."
        )
        await expect(snapshots.workspaceStatus()).toContainText("stale by 3")

        // Act
        await snapshots.analyseFromTheNotice()
        await expect(snapshots.notice()).toContainText("Analysing the working tree…")
        await snapshots.completeJob(FIRST_JOB_ID)

        // Assert
        await expect(page.getByText("Showing the analysis of the working tree")).toBeVisible()
        await expect(snapshots.notice()).toHaveCount(0)
        await expect(snapshots.workspaceStatus()).not.toContainText("stale by 3")
    })
})
