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

const seedOf = (project: typeof BILLING, responses: Record<string, unknown>) => ({
    projects: [project],
    activeProjectId: "p-billing",
    snapshots: [commitSnapshot("s-base", BASE_SHA, "Release 2.4.0"), commitSnapshot("s-head", HEAD_SHA, "Fix invoice rounding")],
    snapshotMaps: { "s-base": gzippedSample("sample1.cc.json"), "s-head": gzippedSample("sample2.cc.json") },
    responses: { "compare.changedFiles": CHANGED_FILES, ...responses },
    git: {
        "f-api": {
            info: aRepositoryInfo(),
            status: aStatusOn("feature/x", { head: { kind: "branch", name: "feature/x", commit: HEAD_SHA } }),
            refs: REFS,
            commits: [commit(LATEST_SHA, [NEXT_SHA]), commit(NEXT_SHA, [HEAD_SHA]), commit(HEAD_SHA, [BASE_SHA]), commit(BASE_SHA, [])]
        }
    }
})

test.describe("Compare pull requests", () => {
    const WITH_GITHUB_REMOTE = aProject(
        "p-billing",
        [
            aFolder("f-api", {
                label: "billing-api",
                git: {
                    topLevel: "/work/f-api",
                    isRepositoryRoot: true,
                    remotes: [{ name: "origin", url: "https://github.com/mia/billing.git" }],
                    defaultBranch: "main",
                    rootCommits: [],
                    isShallow: false,
                    detectedAt: "2026-11-20T00:00:00Z"
                }
            })
        ],
        { name: "billing", view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-head" } } }
    )

    test.beforeEach(async ({ page }) => {
        await standInForTheDesktopBridge(
            page,
            seedOf(WITH_GITHUB_REMOTE, {
                "hosting.status": {
                    provider: "github",
                    host: "github.com",
                    repository: "mia/billing",
                    remote: "origin",
                    detectedBy: "knownHost"
                },
                "hosting.fetchChangeRequestHead": { gitRef: "refs/codecharta/pr/7", commit: HEAD_SHA },
                "tools.doctor": {
                    checkedAt: "2026-11-20T00:00:00Z",
                    tools: [
                        {
                            tool: "gh",
                            isRequired: false,
                            state: "missing",
                            path: null,
                            source: null,
                            version: null,
                            minimumVersion: null,
                            problem: null
                        }
                    ],
                    canUseGit: true,
                    canAnalyse: true
                }
            })
        )
        await goto(page)
    })

    test("should open a pull request by number without the GitHub CLI and compare it from its merge base", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()
        await expect(compare.changeRequestsNotInstalled()).toContainText("Install the GitHub CLI (gh) to list pull requests")

        // Act
        await compare.openPullRequestByNumber("7")

        // Assert
        await expect(compare.dialog()).toHaveCount(0)
        await expect(compare.chipButton()).toContainText("#7")
        await compare.openTheChipDetails()
        await expect(compare.chipSide("head")).toContainText("PR #7")
        await expect(compare.pullRequestBadge().getByRole("link")).toHaveAttribute("href", "https://github.com/mia/billing/pull/7")
        await expect(compare.baseModeBadge()).toHaveText("since the merge base")
    })
})

test.describe("Compare", () => {
    test.beforeEach(async ({ page }) => {
        await standInForTheDesktopBridge(page, seedOf(BILLING, {}))
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
        await expect(compare.chipButton()).toHaveAttribute("title", "Base: main (9f8e7d6) · Head: feature/x (a1b2c3d)")
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
        await expect(page.getByTestId("workspace-status-trigger")).toHaveAttribute("title", /Map shows a1b2c3d/)
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
        await expect(compare.chipButton()).toHaveAttribute("title", "Base: main (9f8e7d6) · Head: feature/x (a1b2c3d)")
        await compare.openTheChipDetails()
        await expect(compare.baseModeBadge()).toHaveText("since the merge base")
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
        await expect(compare.chipButton()).toContainText("main")
        await expect(compare.chipButton()).toContainText("feature/x")
    })

    test("should compare a commit with its parent from the History", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        const history = new GitHistoryPageObject(page)
        await history.open()

        // Act
        await compare.chooseFromTheCommitMenu(history.commitRows().filter({ hasText: "a1b2c3d" }), "Compare with Parent")

        // Assert
        await expect(compare.chipButton()).toHaveAttribute("title", "Base: 9f8e7d6 · Head: a1b2c3d")
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
        await expect(compare.staleDot()).toBeVisible()
        await compare.openTheChipDetails()
        await expect(compare.staleBadge()).toHaveText("stale by 2")
        await expect(compare.staleBadge()).toHaveAttribute("title", "No analysis for c3d4e5f. Showing a1b2c3d, 2 commits older.")
    })
})

test.describe("Compare a renamed file", () => {
    const RENAMED_IN_GIT = {
        source: "git",
        files: [{ change: "renamed", path: "ParentLeaf/sample2LeafMergedIn.kt", previousPath: "sample1OnlyLeaf.scss" }]
    }

    test.beforeEach(async ({ page }) => {
        await standInForTheDesktopBridge(page, seedOf(BILLING, { "compare.changedFiles": RENAMED_IN_GIT }))
        await goto(page)
    })

    test("should show a file git renamed as one file at its new path, not as removed plus added", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        const explorer = page.locator("cc-sidebar-explorer")
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.compare("main", "feature/x")

        // Assert
        await expect(compare.chip()).toBeVisible()
        await expect(explorer).toContainText("bigLeaf.ts")
        await expect(explorer).not.toContainText("sample1OnlyLeaf.scss")
        await new ExplorerTreeLevelPageObject(page).openFolder("/root/ParentLeaf")
        await expect(explorer).toContainText("sample2LeafMergedIn.kt")
    })
})

const NAV_BAR_WIDTHS = [
    { windowWidth: 1920, chipWidth: 288, showsFolderName: true },
    { windowWidth: 1280, chipWidth: 224, showsFolderName: true },
    { windowWidth: 1024, chipWidth: 128, showsFolderName: false }
]

test.describe("Comparison chip in the nav bar", () => {
    test.beforeEach(async ({ page }) => {
        await standInForTheDesktopBridge(page, seedOf(BILLING, {}))
        await goto(page)
    })

    for (const { windowWidth, chipWidth, showsFolderName } of NAV_BAR_WIDTHS) {
        test(`should fit beside the project menu at ${windowWidth} px and reach Leave compare with the mouse`, async ({ page }) => {
            // Arrange
            await page.setViewportSize({ width: windowWidth, height: 900 })
            const compare = new ComparePageObject(page)
            await compare.openTheDialogFromTheCompareTab()
            await compare.pick("base", "mai", "main")
            await compare.pick("head", "feature/later", "feature/later")
            await compare.submit()
            await compare.useNearest()

            // Act
            await compare.openTheChipDetails()

            // Assert
            const chip = await compare.chipButton().boundingBox()
            const viewSwitcher = await compare.viewSwitcher().boundingBox()
            expect(Math.round(chip?.width ?? 0)).toBe(chipWidth)
            expect(await compare.chipButton().evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true)
            expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual(viewSwitcher?.x ?? 0)
            expect(chip?.y ?? 0).toBeLessThan((viewSwitcher?.y ?? 0) + (viewSwitcher?.height ?? 0))
            await expect(compare.staleDot()).toBeVisible()
            await expect(compare.projectMenuLabel()).toBeVisible({ visible: showsFolderName })
            await expect(compare.staleBadge()).toHaveText("stale by 2")
            await compare.leaveButton().click()
            await expect(compare.chip()).toHaveCount(0)
        })
    }
})

const FORK = aFolder("f-fork", { label: "billing-fork", role: "fork" })
const WITH_A_FORK = aProject("p-billing", [aFolder("f-api", { label: "billing-api" }), FORK], {
    name: "billing",
    view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-head" } }
})

test.describe("Compare against a snapshot or another folder", () => {
    test.beforeEach(async ({ page }) => {
        const seed = seedOf(WITH_A_FORK, { "compare.changedFiles": { source: "unavailable", files: [] } })
        const workingTree = aSnapshot("p-billing", "f-api", "s-tree", {
            target: "workingTree",
            commit: HEAD_SHA,
            shortCommit: "a1b2c3d",
            dirty: true,
            createdAt: "2026-11-04T09:12:00Z"
        })
        const forked = aSnapshot("p-billing", "f-fork", "s-fork", { commit: LATEST_SHA, shortCommit: "c3d4e5f", target: "commit" })
        await standInForTheDesktopBridge(page, {
            ...seed,
            snapshots: [...seed.snapshots, workingTree, forked],
            snapshotMaps: { ...seed.snapshotMaps, "s-tree": gzippedSample("sample3.cc.json"), "s-fork": gzippedSample("sample3.cc.json") },
            git: { ...seed.git, "f-fork": seed.git["f-api"] }
        })
        await goto(page)
    })

    test("should compare a commit with the analysed working tree and list the changes from the metrics", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.pick("base", "mai", "main")
        await compare.pick("head", "Working", "Working tree")
        await compare.submit()

        // Assert
        await expect(compare.chipButton()).toContainText("working tree")
        await expect(compare.staleDot()).toHaveCount(0)
        await compare.openTheLegend()
        await expect(compare.legendCaption()).toHaveText("Δ = head working tree − base 9f8e7d6")
        await compare.openTheChangesMode()
        await expect(compare.changesSource()).toHaveText("Files with metric changes")
    })

    test("should compare a branch of the working folder with one of the fork", async ({ page }) => {
        // Arrange
        const compare = new ComparePageObject(page)
        await compare.openTheDialogFromTheCompareTab()

        // Act
        await compare.compareWithAnotherFolder("billing-fork")
        await compare.compare("main", "feature/later")

        // Assert
        await expect(compare.dialog()).toHaveCount(0)
        await expect(compare.chipButton()).toHaveAttribute(
            "title",
            "Base: main (9f8e7d6) in billing-api · Head: feature/later (c3d4e5f) in billing-fork"
        )
        await compare.openTheChipDetails()
        await expect(compare.chipSide("head")).toContainText("feature/later · billing-fork")
    })
})
