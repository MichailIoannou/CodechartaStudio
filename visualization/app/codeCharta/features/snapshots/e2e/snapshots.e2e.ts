import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { aLocalBranch, aLogCommit, aRefs, aRepositoryInfo } from "../../gitHistory/services/gitApi.mocks"
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

const MAIN_COMMITS = ["4", "3", "2", "1"].map((seed, index, seeds) => aLogCommit(seed, `Commit ${seed}`, seeds.slice(index + 1, index + 2)))

function anAnalysisOfDay(day: number) {
    const finishedAt = `2026-11-0${day}T10:00:00Z`
    return aSnapshot("p-billing", "f-api", `s-${day}`, {
        target: "commit",
        commit: `${day}`.repeat(40),
        shortCommit: `${day}`.repeat(7),
        subject: `Commit ${day}`,
        finishedAt,
        createdAt: finishedAt,
        mapBytes: 1_000_000
    })
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

    test("should keep the staleness in the workspace status after dismissing the notice", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        await standInForTheDesktopBridge(page, {
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [OLDER],
            snapshotMaps: { "s-older": SAMPLE1 },
            gitStatuses: { "f-api": STATUS_AT_HEAD },
            resolutions: {
                "f-api/workingTree": { kind: "nearest", snapshot: OLDER, isCurrentProfile: true, relation: "ancestor", behind: 3, ahead: 0 }
            }
        })
        await goto(page)
        await expect(snapshots.notice()).toBeVisible()

        // Act
        await snapshots.dismissTheNotice()

        // Assert
        await expect(snapshots.notice()).toHaveCount(0)
        await expect(snapshots.workspaceStatus()).toContainText("stale by 3")
    })

    test("should say how far a restored analysis is from a moved checkout and offer to analyse the checkout", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        const restored = anAnalysisOfDay(1)
        await standInForTheDesktopBridge(page, {
            projects: [{ ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-1" } } }],
            activeProjectId: "p-billing",
            snapshots: [restored],
            snapshotMaps: { "s-1": SAMPLE1, [WORKING_TREE_SNAPSHOT_ID]: SAMPLE1 },
            git: {
                "f-api": { status: { ...STATUS_AT_HEAD, head: { ...STATUS_AT_HEAD.head, commit: "4".repeat(40) } }, commits: MAIN_COMMITS }
            }
        })
        await goto(page)
        await expect(snapshots.notice()).toContainText(
            "No analysis of the current checkout — showing 1111111 (Commit 1), stale by 3 commits."
        )
        await expect(snapshots.workspaceStatusBadge()).toHaveText("stale by 3")
        await expect(snapshots.workspaceStatusBadge()).toHaveAttribute("title", "Map is 3 commits behind the current checkout")
        await expect(snapshots.workspaceStatus()).toHaveAttribute(
            "title",
            /Map shows 1111111 Commit 1, 3 commits behind the current checkout/
        )

        // Act
        await snapshots.analyseFromTheNotice()
        await expect(snapshots.notice()).toContainText("Analysing the working tree…")
        await snapshots.completeJob(FIRST_JOB_ID)

        // Assert
        await expect(page.getByText("Showing the analysis of the working tree")).toBeVisible()
        await expect(snapshots.notice()).toHaveCount(0)
        await expect(snapshots.workspaceStatus()).not.toContainText("stale by 3")
    })

    test("should explain the badge of an analysis of uncommitted changes", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        const uncommitted = aSnapshot("p-billing", "f-api", "s-dirty", {
            commit: HEAD_SHA,
            shortCommit: "a1b2c3d",
            subject: "Round invoices",
            target: "workingTree",
            dirty: true
        })
        await standInForTheDesktopBridge(page, {
            projects: [{ ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-dirty" } } }],
            activeProjectId: "p-billing",
            snapshots: [uncommitted],
            snapshotMaps: { "s-dirty": SAMPLE1 },
            gitStatuses: { "f-api": STATUS_AT_HEAD }
        })

        // Act
        await goto(page)

        // Assert
        await expect(snapshots.workspaceStatusBadge()).toHaveText("uncommitted")
        await expect(snapshots.workspaceStatusBadge()).toHaveAttribute("title", "Map is an analysis of uncommitted changes on a1b2c3d")
        await expect(snapshots.notice()).toHaveCount(0)
    })

    test("should analyse the last commits of the current branch in one batch and cancel it", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        await standInForTheDesktopBridge(page, {
            projects: [BILLING],
            activeProjectId: "p-billing",
            git: {
                "f-api": {
                    info: aRepositoryInfo(),
                    status: { ...STATUS_AT_HEAD, head: { kind: "branch", name: "main", commit: MAIN_COMMITS[0].sha } },
                    refs: aRefs({ localBranches: [aLocalBranch("main", { isCurrent: true, commit: MAIN_COMMITS[0].sha })] }),
                    commits: MAIN_COMMITS
                }
            }
        })
        await goto(page)
        await snapshots.openSnapshotsDialog()

        // Act
        await snapshots.startBatchOfLastCommits(3)
        await expect(snapshots.batchSummary()).toContainText("3 commits: 3 to analyse, 0 already analysed.")
        await snapshots.confirmBatch()
        await expect(snapshots.activityBatch()).toContainText("Batch: last 3 commits of main (0 of 3 done)")
        await snapshots.cancelBatch()

        // Assert
        await expect(snapshots.snapshotsDialog()).toHaveCount(0)
        await expect(snapshots.activityBatch().getByTestId("activity-cancel-batch")).toHaveCount(0)
    })

    test("should delete one analysis and clean up the older ones", async ({ page }) => {
        // Arrange
        const snapshots = new SnapshotsPageObject(page)
        const analyses = [3, 2, 1].map(anAnalysisOfDay)
        const shown = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], {
            name: "billing",
            view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-3" } }
        })
        await standInForTheDesktopBridge(page, {
            projects: [shown],
            activeProjectId: "p-billing",
            snapshots: analyses,
            snapshotMaps: Object.fromEntries(analyses.map(analysis => [analysis.ref.snapshotId, SAMPLE1]))
        })
        await goto(page)
        await snapshots.openSnapshotsDialog()
        await expect(snapshots.storeUsage()).toHaveText("This project's analyses use 3.0 MB.")

        // Act
        await snapshots.deleteSnapshotRow(1)
        await expect(snapshots.snapshotRows()).toHaveCount(2)
        await snapshots.planCleanupKeeping(0)
        await expect(snapshots.cleanupPlan()).toContainText("Moves 1 analysis (1.0 MB) of billing-api to the recycle bin:")
        await snapshots.confirmCleanup()

        // Assert
        await expect(page.getByText("Moved 1 analysis (1.0 MB) to the recycle bin.")).toBeVisible()
        await expect(snapshots.snapshotRows()).toHaveCount(1)
        await expect(snapshots.snapshotRows()).toContainText("Commit 3")
        await expect(snapshots.storeUsage()).toHaveText("This project's analyses use 1.0 MB.")
    })
})
