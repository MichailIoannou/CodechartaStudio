import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import { GitHistoryPageObject } from "../../gitHistory/e2e/gitHistory.po"
import { aRepositoryInfo, aStatusOn } from "../../gitHistory/services/gitApi.mocks"
import { MetricsBarPageObject } from "../../metricsBar/components/metricsBar/metricsBar.po"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { ExplorerTreeLevelPageObject } from "../../sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { ComparePageObject } from "./compare.po"

const ASSETS = join(__dirname, "..", "..", "..", "assets")
const gzippedSample = (fileName: string) => [...gzipSync(readFileSync(join(ASSETS, fileName)))]

const BASE_SHA = "9f8e7d6".padEnd(40, "0")
const HEAD_SHA = "a1b2c3d".padEnd(40, "0")
const NEXT_SHA = "b2c3d4e".padEnd(40, "0")
const LATEST_SHA = "c3d4e5f".padEnd(40, "0")
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], {
    name: "billing",
    view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-head" } }
})
const commitSnapshot = (snapshotId: string, sha: string, subject: string) =>
    aSnapshot("p-billing", "f-api", snapshotId, { commit: sha, shortCommit: sha.slice(0, 7), subject, target: "commit" })
const commit = (sha: string, parents: string[]): GitCommitSummary => ({
    sha,
    parents,
    authorName: "Mia Chen",
    authorEmail: "mia@example.org",
    authoredAt: 1_700_000_000,
    committedAt: 1_700_000_000,
    subject: sha.slice(0, 7)
})
const branch = (name: string, sha: string, isCurrent: boolean) => ({
    refName: `refs/heads/${name}`,
    name,
    commit: sha,
    isCurrent,
    upstream: null,
    checkedOutInOtherWorktree: null,
    lastCommit: { subject: "", committedAt: 1_700_000_000 }
})
const REFS = {
    fingerprint: "refs-1",
    head: { kind: "branch", name: "feature/x", commit: HEAD_SHA },
    localBranches: [branch("main", BASE_SHA, false), branch("feature/x", HEAD_SHA, true), branch("feature/later", LATEST_SHA, false)],
    remoteBranches: [],
    tags: [],
    remotes: []
} as unknown as GitRefs

const CHANGED_FILES = {
    source: "git",
    files: [
        { change: "modified", path: "bigLeaf.ts", previousPath: null },
        { change: "added", path: "ParentLeaf/sample2LeafMergedIn.kt", previousPath: null },
        { change: "modified", path: "README.md", previousPath: null }
    ]
}

test.describe("Compare", () => {
    test.beforeEach(async ({ page }) => {
        await standInForTheDesktopBridge(page, {
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [commitSnapshot("s-base", BASE_SHA, "Release 2.4.0"), commitSnapshot("s-head", HEAD_SHA, "Fix invoice rounding")],
            snapshotMaps: { "s-base": gzippedSample("sample1.cc.json"), "s-head": gzippedSample("sample2.cc.json") },
            responses: { "compare.changedFiles": CHANGED_FILES },
            git: {
                "f-api": {
                    info: aRepositoryInfo(),
                    status: aStatusOn("feature/x", { head: { kind: "branch", name: "feature/x", commit: HEAD_SHA } }),
                    refs: REFS,
                    commits: [
                        commit(LATEST_SHA, [NEXT_SHA]),
                        commit(NEXT_SHA, [HEAD_SHA]),
                        commit(HEAD_SHA, [BASE_SHA]),
                        commit(BASE_SHA, [])
                    ]
                }
            }
        })
        await goto(page)
    })

    test("should compare two commits of the working folder in delta mode and keep the chosen metrics", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.openAreaMetricSelect()
        await metricsBar.selectAreaMetricOption("functions")
        await page.keyboard.press("Escape")
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.compare("main", "feature/x")

        // Assert
        await expect(compare.dialog()).toHaveCount(0)
        await expect(compare.chip()).toContainText("9f8e7d6")
        await expect(compare.chip()).toContainText("main")
        await expect(compare.chip()).toContainText("a1b2c3d")
        await expect(compare.chip()).toContainText("feature/x")
        await compare.openTheLegend()
        await expect(compare.legendCaption()).toHaveText("Δ = head a1b2c3d − base 9f8e7d6")
        expect(await metricsBar.getSelectedAreaMetricName()).toContain("functions")
        await new ExplorerTreeLevelPageObject(page).selectNode("/root/bigLeaf.ts")
        await expect(page.getByTestId("metric-row-delta").first()).toBeVisible()
    })

    test("should list the files git changed and grey out the others", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()
        await compare.compare("main", "feature/x")
        await expect(compare.chip()).toBeVisible()

        // Act
        await compare.openTheChangesMode()
        await compare.showOnlyChangedFiles()

        // Assert
        await expect(compare.changesSource()).toHaveText("Files changed in git")
        await expect(compare.changeRows()).toHaveCount(3)
        await expect(compare.changeRows().nth(2)).toHaveAttribute("title", "Not part of the analysis")
        await expect(compare.flattenedCount()).toContainText("3")
    })

    test("should leave the comparison with the head alone", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()
        await compare.compare("main", "feature/x")
        await expect(compare.chip()).toBeVisible()

        // Act
        await compare.leave()

        // Assert
        await expect(compare.chip()).toHaveCount(0)
        await expect(page.getByTestId("workspace-status-trigger")).toContainText("a1b2c3d")
        await expect(page.locator("cc-sidebar-explorer")).not.toContainText("sample1OnlyLeaf.scss")
    })

    test("should pick both sides from the lists and compare a branch from where it left the base", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.pick("base", "mai", "main")
        await compare.pick("head", "feature/x", "feature/x")
        await compare.submit()

        // Assert
        await expect(compare.chip()).toContainText("9f8e7d6")
        await expect(compare.chip()).toContainText("feature/x")
        await expect(compare.baseModeBadge()).toHaveText("since merge base")
    })

    test("should compare again from a recent comparison", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()
        await compare.compare("main", "feature/x")
        await compare.leave()
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.useRecent()
        await compare.submit()

        // Assert
        await expect(compare.chip()).toContainText("main")
        await expect(compare.chip()).toContainText("feature/x")
    })

    test("should compare a commit with its parent from the History", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        const history = new GitHistoryPageObject(page)
        await history.open()

        // Act
        await compare.chooseFromTheCommitMenu(history.commitRows().filter({ hasText: "a1b2c3d" }), "Compare with Parent")

        // Assert
        await expect(compare.chip()).toContainText("9f8e7d6")
        await expect(compare.chip()).toContainText("a1b2c3d")
    })

    test("should open the dialog with a branch as the head from the branch menu", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        const history = new GitHistoryPageObject(page)
        await history.open()

        // Act
        await compare.chooseFromTheBranchMenu(history.branchRow("refs/heads/feature/later"), "Compare with…")

        // Assert
        await expect(compare.dialog()).toBeVisible()
        await expect(page.getByTestId("compare-head")).toHaveValue("feature/later")
    })

    test("should name a ref the folder does not have", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.compare("main", "nope")

        // Assert
        await expect(page.getByTestId("compare-error")).toHaveText("'nope' is not a branch, tag or commit of 'billing-api'.")
    })

    test("should compare with the nearest analysis of a head that is not analysed and say how stale it is", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()
        await compare.compare("main", "feature/later")
        await expect(compare.preparation()).toContainText("not analysed · nearest: a1b2c3d, 2 commits older")

        // Act
        await compare.useNearest()

        // Assert
        await expect(compare.dialog()).toHaveCount(0)
        await expect(compare.staleBadge()).toHaveText("stale by 2")
        await expect(compare.staleBadge()).toHaveAttribute("title", "No analysis for c3d4e5f. Showing a1b2c3d, 2 commits older.")
    })
})
