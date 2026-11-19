import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import { MetricsBarPageObject } from "../../metricsBar/components/metricsBar/metricsBar.po"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { ExplorerTreeLevelPageObject } from "../../sidebarExplorer/components/explorerTreeLevel/explorerTreeLevel.po"
import { ComparePageObject } from "./compare.po"

const ASSETS = join(__dirname, "..", "..", "..", "assets")
const gzippedSample = (fileName: string) => [...gzipSync(readFileSync(join(ASSETS, fileName)))]

const BASE_SHA = "9f8e7d6".padEnd(40, "0")
const HEAD_SHA = "a1b2c3d".padEnd(40, "0")
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
    localBranches: [branch("main", BASE_SHA, false), branch("feature/x", HEAD_SHA, true)],
    remoteBranches: [],
    tags: [],
    remotes: []
} as unknown as GitRefs

test.describe("Compare", () => {
    test.beforeEach(async ({ page }) => {
        await standInForTheDesktopBridge(page, {
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [commitSnapshot("s-base", BASE_SHA, "Release 2.4.0"), commitSnapshot("s-head", HEAD_SHA, "Fix invoice rounding")],
            snapshotMaps: { "s-base": gzippedSample("sample1.cc.json"), "s-head": gzippedSample("sample2.cc.json") },
            git: { "f-api": { refs: REFS, commits: [commit(HEAD_SHA, [BASE_SHA]), commit(BASE_SHA, [])] } }
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

    test("should name a ref the folder does not have", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.compare("main", "nope")

        // Assert
        await expect(page.getByTestId("compare-error")).toHaveText("'nope' is not a branch, tag or commit of 'billing-api'.")
    })
})
