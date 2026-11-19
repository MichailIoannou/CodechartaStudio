import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { CC_URL, goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import type { FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { aLocalBranch, anErrorPayload, anUpstream, aRefs, aRemoteBranch, aRepositoryInfo, aStatusOn, aTag } from "../services/gitApi.mocks"
import { GitHistoryPageObject } from "./gitHistory.po"

const SAMPLE_MAP = [...gzipSync(readFileSync(join(__dirname, "..", "..", "..", "assets", "sample1.cc.json")))]
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api", path: "/work/billing-api" })], { name: "billing" })

const BILLING_REFS = aRefs({
    head: { kind: "branch", name: "feature/invoice-rounding", commit: "a".repeat(40) },
    localBranches: [
        aLocalBranch("feature/invoice-rounding", {
            isCurrent: true,
            upstream: anUpstream("origin/feature/invoice-rounding", { ahead: 2, behind: 1 })
        }),
        aLocalBranch("main", { upstream: anUpstream("origin/main", { behind: 4 }) }),
        aLocalBranch("release/2.4", { upstream: anUpstream("origin/release/2.4") }),
        aLocalBranch("release/2.5"),
        aLocalBranch("old-experiment", { upstream: anUpstream("origin/old-experiment", { ahead: null, behind: null, isGone: true }) })
    ],
    remoteBranches: [
        aRemoteBranch("origin", "main"),
        aRemoteBranch("origin", "feature/invoice-rounding"),
        aRemoteBranch("origin", "release/2.4"),
        aRemoteBranch("fork", "main")
    ],
    tags: [aTag("v2.3.0"), aTag("v2.4.0")],
    remotes: [
        { name: "origin", url: "https://example.com/acme/billing-api.git" },
        { name: "fork", url: "git@example.com:mia/billing-api.git" }
    ]
})

/** The billing project with a map, so the view switcher shows, and a git working folder. */
function billingSeed(git: FakeDesktopSeed["git"] = {}): FakeDesktopSeed {
    return {
        projects: [BILLING],
        activeProjectId: "p-billing",
        snapshots: [aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "a1b2c3d" })],
        snapshotMaps: { "s-api": SAMPLE_MAP },
        git: {
            "f-api": {
                info: aRepositoryInfo(),
                status: aStatusOn("feature/invoice-rounding", {
                    upstream: anUpstream("origin/feature/invoice-rounding", { ahead: 2, behind: 1 }),
                    counts: { staged: 0, unstaged: 3, untracked: 0, conflicted: 0 }
                }),
                refs: BILLING_REFS,
                ...git["f-api"]
            }
        }
    }
}

test.describe("History", () => {
    test("should open the history from its tab and scope the commits to a clicked branch", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        await standInForTheDesktopBridge(page, billingSeed())
        await goto(page)

        // Act
        await history.open()
        await history.branchRow("refs/heads/main").click()

        // Assert
        await expect(history.repository()).toHaveText("billing-api")
        await expect(history.currentBranch()).toContainText("feature/invoice-rounding")
        await expect(history.branchRow("refs/heads/old-experiment")).toContainText("gone")
        await expect(history.scopeChip()).toHaveText("main")
        await expect(page).toHaveURL(/#\/history/)
    })

    test("should explain a folder that git does not trust", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const distrust = anErrorPayload("DUBIOUS_OWNERSHIP", "unsafe repository", { repositoryPath: "/work/billing-api" })
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { failures: { "git.repositoryInfo": distrust } } }))
        await goto(page)

        // Act
        await history.open()

        // Assert
        await expect(history.problemNotice()).toContainText("Git does not trust '/work/billing-api' because another user owns it.")
        await expect(history.problemNotice()).toContainText("git config --global --add safe.directory /work/billing-api")
    })

    test("should offer no history without a bridge and explain the desktop app at its address", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        await goto(page)
        await expect(page.getByTestId("view-switcher")).toBeVisible()

        // Act
        const tabCount = await history.tab().count()
        await page.goto(`${CC_URL}#/history`)

        // Assert
        expect(tabCount).toBe(0)
        await expect(page.getByText("Commit history is available in the desktop app.")).toBeVisible()
    })
})
