import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { CC_URL, goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { GitWorkingTreeEntry } from "../../../model/coreApi/GitWorkingTreeEntry"
import type { FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import {
    aLocalBranch,
    aLogCommit,
    anErrorPayload,
    anUpstream,
    aRefs,
    aRemoteBranch,
    aRepositoryInfo,
    aStatusOn,
    aTag
} from "../services/gitApi.mocks"
import { GitHistoryPageObject } from "./gitHistory.po"

function anEntry(path: string, kind: GitEntryKind, change: GitFileChange = "modified"): GitWorkingTreeEntry {
    return { path, previousPath: null, kind, change, conflict: null }
}

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

    test("should list the commits with their graph, show a merge commit's files and search without the graph", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const merge = aLogCommit("e", "Merge branch 'main' into feature/invoice-rounding", ["d", "c"])
        const commits = [
            aLogCommit("a", "Fix invoice rounding", ["e"]),
            merge,
            aLogCommit("d", "Add currency table", ["b"]),
            aLogCommit("c", "Release 2.4.0", ["b"]),
            aLogCommit("b", "Start the invoice module")
        ]
        const files = [
            { change: "modified" as const, path: "src/billing/invoice.ts", previousPath: null, insertions: 40, deletions: 8 },
            { change: "added" as const, path: "src/billing/currency.ts", previousPath: null, insertions: 80, deletions: 0 }
        ]
        const details = {
            ...merge,
            committerName: merge.authorName,
            committerEmail: merge.authorEmail,
            message: merge.subject,
            comparedToParent: merge.parents[0],
            files,
            areFilesTruncated: false,
            totals: { filesChanged: 2, insertions: 120, deletions: 8 }
        }
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, details: { [merge.sha]: details } } }))
        await goto(page)
        await history.open()

        // Act
        await history.commitRows().nth(1).click()

        // Assert
        await expect(history.uncommittedChangesRow()).toHaveText("Uncommitted changes (3)")
        await expect(history.commitRows()).toHaveCount(5)
        await expect(history.commitListHeader()).toContainText("Graph")
        await expect(history.commitDetails()).toContainText("Changes compared with the first parent")
        await expect(history.changedFiles()).toHaveCount(2)
        await history.search().fill("release")
        await expect(history.commitRows()).toHaveCount(1)
        await expect(history.commitListHeader()).not.toContainText("Graph")
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

test.describe("History writes", () => {
    const commits = [aLogCommit("a", "Fix invoice rounding", ["b"]), aLogCommit("b", "Start the invoice module")]

    test("should fetch after the hooks notice, show its progress in the workspace status and cancel it", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const progress = { message: "Receiving objects: 45% (9/20)", done: 45, total: 100 }
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, slow: { "git.fetch": { progress } } } }))
        await goto(page)
        await history.open()

        // Act
        await history.syncButton().click()
        await expect(history.confirmDialog()).toContainText("Git runs this repository's hooks and filters")
        await history.confirm("yes")

        // Assert
        await expect(history.syncButton()).toHaveText("Fetching…")
        await expect(history.syncButton()).toBeDisabled()
        await expect(history.workspaceStatus()).toContainText(/Fetching ·\s*45 %/)
        await history.cancelSync().click()
        await expect(history.syncButton()).toHaveText("Fetch")
        await expect(history.workspaceStatus()).not.toContainText("Fetching")
    })

    test("should ask for a passphrase over any view and send it once", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const prompts = [{ kind: "secret" as const, message: 'Enter passphrase for "/home/mia/.ssh/id_ed25519": ' }]
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, slow: { "git.fetch": { prompts } } } }))
        await goto(page)
        await history.open()
        await history.syncButton().click()
        await history.confirm("yes")

        // Act
        await expect(history.credentialPrompt()).toContainText("Enter passphrase for")
        await page.goto(`${CC_URL}#/metrics`)
        await expect(history.credentialPrompt()).toBeVisible()
        await history.credentialInput().fill("correct horse")
        await history.credentialInput().press("Enter")

        // Assert
        await expect(history.credentialPrompt()).toBeHidden()
        const answers = await page.evaluate(() => {
            const bridge = (window as unknown as { codeChartaDesktop: { calls: { args: unknown[] }[] } }).codeChartaDesktop
            return bridge.calls.filter(call => call.args[0] === "prompt.answer").length
        })
        expect(answers).toBe(1)
        await expect(history.toasts().filter({ hasText: "Already up to date" })).toBeVisible()
    })

    test("should create a branch from a commit's menu and switch to it from the branch menu", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits } }))
        await goto(page)
        await history.open()

        // Act
        await history.commitRows().nth(1).click({ button: "right" })
        await page.getByText("New Branch Here…").click()
        await history.branchDialog().getByTestId("branch-dialog-name").fill("feature/tax-tables")
        await history.branchDialog().getByTestId("branch-dialog-submit").click()
        await history.confirm("yes")
        await history.branchRow("refs/heads/feature/tax-tables").click({ button: "right" })
        await page.getByTestId("branch-context-menu").getByText("Switch To").click()
        await expect(history.confirmDialog()).toContainText("Switch 'billing-api' from 'feature/invoice-rounding' to 'feature/tax-tables'?")
        await history.confirm("yes")

        // Assert
        await expect(history.currentBranch()).toContainText("feature/tax-tables")
        await expect(history.branchRow("refs/heads/feature/tax-tables").locator(".fa-check")).toBeVisible()
    })

    test("should show git's files when it refuses to switch", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const detail =
            "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/billing/invoice.ts\nAborting"
        const refusal = anErrorPayload("LOCAL_CHANGES_WOULD_BE_OVERWRITTEN", "git refused.", { detail })
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, failures: { "git.switch": refusal } } }))
        await goto(page)
        await history.open()

        // Act
        await history.branchRow("refs/heads/main").dblclick()
        await history.confirm("yes")
        await history.confirm("yes")

        // Assert
        const toast = history.toasts().filter({ hasText: "Git did not switch" })
        await expect(toast).toContainText("src/billing/invoice.ts")
        await toast.getByRole("button", { name: "Details" }).click()
        await expect(toast).toContainText("Aborting")
        await expect(history.currentBranch()).toContainText("feature/invoice-rounding")
    })
})

test.describe("History changes", () => {
    const commits = [aLogCommit("a", "Fix invoice rounding", ["b"]), aLogCommit("b", "Start the invoice module")]
    const changes = [
        anEntry("src/billing/currency.ts", "staged"),
        anEntry("src/app.ts", "unstaged"),
        anEntry("notes.md", "untracked", "added")
    ]
    const diffs = {
        "unstaged:src/app.ts": {
            path: "src/app.ts",
            text: "diff --git a/src/app.ts b/src/app.ts\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\n",
            isBinary: false,
            isTruncated: false
        }
    }

    test("should show a file's diff, stage it and discard an untracked file after the confirmation", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, changes, diffs } }))
        await goto(page)
        await history.open()

        // Act
        await history.changesTab().click()
        await history.changeRow("unstaged:src/app.ts").click()
        await expect(history.diffLines().filter({ hasText: "+new" })).toHaveClass(/text-success/)
        await history.changeRow("unstaged:src/app.ts").getByTestId("change-row-stage").click()
        await history.confirm("yes")
        await expect(history.changeRow("staged:src/app.ts")).toBeVisible()
        await history.changeRow("untracked:notes.md").getByTestId("change-row-discard").click()
        await expect(history.confirmDialog()).toContainText("Discard changes to 'notes.md'?")
        await history.confirm("verb")

        // Assert
        await expect(history.changeRow("untracked:notes.md")).toHaveCount(0)
        await expect(history.groupHeaders()).toHaveText([/Staged\s*\(2\)/])
        await expect(history.changesTab()).toContainText("2")
    })

    test("should commit the staged files with Ctrl+Enter and show the new commit in the log", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, changes } }))
        await goto(page)
        await history.open()
        await history.changesTab().click()

        // Act
        await history.commitSummary().fill("Add the currency table")
        await history.commitSummary().press("Control+Enter")
        await history.confirm("yes")

        // Assert
        await expect(history.toasts().filter({ hasText: /Committed [0-9a-c]{7}/ })).toBeVisible()
        await expect(history.commitSummary()).toHaveValue("")
        await expect(history.changeRow("staged:src/billing/currency.ts")).toHaveCount(0)
        await page.getByTestId("history-tab-log").click()
        await expect(history.commitRows().first()).toContainText("Add the currency table")
    })

    test("should keep the message and show the hook's output when a hook stops the commit", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const failures = { "git.commit": anErrorPayload("HOOK_FAILED", "The hook failed.", { detail: "lint: 3 problems in src/app.ts" }) }
        await standInForTheDesktopBridge(page, billingSeed({ "f-api": { commits, changes, failures } }))
        await goto(page)
        await history.open()
        await history.changesTab().click()

        // Act
        await history.commitSummary().fill("Add the currency table")
        await history.commitButton().click()
        await history.confirm("yes")

        // Assert
        const toast = history.toasts().filter({ hasText: "A git hook stopped the commit." })
        await toast.getByRole("button", { name: "Details" }).click()
        await expect(toast).toContainText("lint: 3 problems in src/app.ts")
        await expect(history.commitSummary()).toHaveValue("Add the currency table")
    })
})

test.describe("Show in map", () => {
    test("should show a commit's analysis in the map from its details and on double-click", async ({ page }) => {
        // Arrange
        const history = new GitHistoryPageObject(page)
        const commits = [aLogCommit("a", "Fix invoice rounding", ["c"]), aLogCommit("c", "Release 2.4.0")]
        const release = aSnapshot("p-billing", "f-api", "s-release", { commit: "c".repeat(40), shortCommit: "ccccccc", target: "commit" })
        const seed = { ...billingSeed({ "f-api": { commits } }), snapshots: [release], snapshotMaps: { "s-release": SAMPLE_MAP } }
        await standInForTheDesktopBridge(page, seed)
        await goto(page)
        await history.open()

        // Act
        await history.commitRows().nth(1).click()
        const firstAction = history.commitDetails().getByRole("button").filter({ hasText: "Show in map" })
        await expect(firstAction).toBeVisible()
        await history.commitRows().nth(1).dblclick()

        // Assert
        await expect(page).toHaveURL(/#\/$/)
        await expect(history.workspaceStatus()).toContainText("ccccccc")
    })
})
