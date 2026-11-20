import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, Page, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import type { GitUpstream } from "../../../model/coreApi/GitUpstream"
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
    aStatusOn
} from "../services/gitApi.mocks"
import { GitHistoryPageObject } from "./gitHistory.po"

const SAMPLE_MAP = [...gzipSync(readFileSync(join(__dirname, "..", "..", "..", "assets", "sample1.cc.json")))]
const BRANCH = "feature/invoice-rounding"
const UPSTREAM = `origin/${BRANCH}`
const LOCAL_SHA = "b".repeat(40)
const REMOTE_SHA = "c".repeat(40)
const COMMITS = [
    aLogCommit("c", "Round half-even upstream", ["b"]),
    aLogCommit("b", "Fix invoice rounding", ["a"]),
    aLogCommit("a", "Start")
]

type RepositorySeed = Partial<NonNullable<FakeDesktopSeed["git"]>[string]>

/** The billing project whose working folder is on BRANCH, tracking UPSTREAM as given. */
function workflowSeed(upstream: GitUpstream | null, extra: RepositorySeed = {}): FakeDesktopSeed {
    const head = { kind: "branch" as const, name: BRANCH, commit: LOCAL_SHA }
    const refs = aRefs({
        head,
        localBranches: [aLocalBranch(BRANCH, { isCurrent: true, commit: LOCAL_SHA, upstream }), aLocalBranch("main")],
        remoteBranches: [{ ...aRemoteBranch("origin", BRANCH), commit: REMOTE_SHA }, aRemoteBranch("origin", "main")],
        remotes: [{ name: "origin", url: "https://example.com/acme/billing-api.git" }]
    })
    return {
        projects: [aProject("p-billing", [aFolder("f-api", { label: "billing-api", path: "/work/billing-api" })], { name: "billing" })],
        activeProjectId: "p-billing",
        snapshots: [aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "a1b2c3d" })],
        snapshotMaps: { "s-api": SAMPLE_MAP },
        git: {
            "f-api": { info: aRepositoryInfo(), status: aStatusOn(BRANCH, { head, upstream }), refs, commits: COMMITS, ...extra }
        }
    }
}

const tracking = (ahead: number, behind: number) => anUpstream(UPSTREAM, { ahead, behind })

async function openHistory(page: Page, seed: FakeDesktopSeed) {
    const history = new GitHistoryPageObject(page)
    await standInForTheDesktopBridge(page, seed)
    await goto(page)
    await history.open()
    return history
}

async function requestsOf(page: Page, method: string) {
    return page.evaluate(name => {
        const bridge = (window as unknown as { codeChartaDesktop: { calls: { name: string; args: unknown[] }[] } }).codeChartaDesktop
        return bridge.calls.filter(call => call.name === "request" && call.args[0] === name).map(call => call.args[1])
    }, method)
}

test.describe("Git workflow", () => {
    test("should offer rebase and merge after git refused to fast-forward and pull with the chosen mode", async ({ page }) => {
        // Arrange
        const refusal = anErrorPayload("NOT_FAST_FORWARD", "fatal: Not possible to fast-forward, aborting.")
        const history = await openHistory(page, workflowSeed(tracking(0, 1), { pullRefusals: { ffOnly: refusal } }))
        await expect(history.syncButton()).toHaveAttribute("title", `Pull 1 commit from ${UPSTREAM} (fast-forward only)`)

        // Act
        await history.syncButton().click()
        await history.confirm("yes")
        await expect(history.confirmDialog()).toContainText("Branches Have Diverged")
        await history.choose("rebase")

        // Assert
        await expect(history.toasts().filter({ hasText: "Pulled 1 commit" })).toBeVisible()
        const modes = (await requestsOf(page, "git.pull")).map(params => (params as { mode: string }).mode)
        expect(modes).toEqual(["ffOnly", "rebase"])
        await expect(history.syncButton()).toHaveAttribute("title", /^Fetch from all remotes/)
    })

    test("should stop a merge pull on conflicts, show the merge notice and abort it after its confirmation", async ({ page }) => {
        // Arrange
        const seed = workflowSeed(tracking(2, 1), { pullConflicts: ["src/billing/invoice.ts"] })
        const history = await openHistory(page, seed)
        await expect(history.syncButton()).toHaveAttribute("title", "The branch has diverged: pull first, then push")

        // Act
        await history.syncButton().click()
        await history.choose("merge")
        await history.confirm("yes")

        // Assert
        await expect(
            history
                .toasts()
                .filter({ hasText: "Git stopped on conflicts in 1 file. The notice above the list says how to finish or abort." })
        ).toBeVisible()
        await expect(history.operationNotice()).toContainText(`Merging into '${BRANCH}'.`)
        await expect(history.operationNotice()).toContainText("1 file has conflicts.")
        await history.abortOperation().click()
        await expect(history.confirmDialog()).toContainText(
            "Abort the merge and return 'feature/invoice-rounding' to the state before the pull?"
        )
        await history.confirm("verb")
        await expect(history.operationNotice()).toBeHidden()
    })

    test("should ask separately before a force push and lease the remote commit it named", async ({ page }) => {
        // Arrange
        const history = await openHistory(page, workflowSeed(tracking(2, 1)))

        // Act
        await history.chooseFromSyncMenu("forcePush")
        await expect(history.confirmDialog()).toContainText(
            `Replace '${UPSTREAM}' (at ccccccc) with your '${BRANCH}' (at bbbbbbb)? 1 commit on the remote that is not in your branch is removed from it.`
        )
        await history.confirm("verb")
        await history.confirm("yes")

        // Assert
        await expect(history.toasts().filter({ hasText: `Pushed 2 commits to ${UPSTREAM}` })).toBeVisible()
        expect(await requestsOf(page, "git.push")).toEqual([expect.objectContaining({ forceWithLeaseExpected: REMOTE_SHA })])
    })

    test("should publish a branch without upstream and then fetch from the main part", async ({ page }) => {
        // Arrange
        const history = await openHistory(page, workflowSeed(null))
        await expect(history.syncButton()).toHaveAttribute("title", `Publish '${BRANCH}' to origin and track it`)

        // Act
        await history.syncButton().click()
        await history.confirm("yes")

        // Assert
        await expect(history.toasts().filter({ hasText: `Published '${BRANCH}' to origin` })).toBeVisible()
        await expect(history.syncButton()).toHaveAttribute("title", /^Fetch from all remotes/)
    })

    test("should offer Pull in the toast of a rejected push", async ({ page }) => {
        // Arrange
        const failures = { "git.push": anErrorPayload("PUSH_REJECTED", "error: failed to push some refs") }
        const history = await openHistory(page, workflowSeed(tracking(2, 0), { failures }))
        await expect(history.syncButton()).toHaveAttribute("title", `Push 2 commits to ${UPSTREAM}`)

        // Act
        await history.syncButton().click()
        await history.confirm("yes")
        const rejection = history.toasts().filter({ hasText: "The remote has commits you do not have. Pull first, then push." })
        await rejection.getByRole("button", { name: "Pull" }).click()

        // Assert
        await expect(history.toasts().filter({ hasText: "Pulled 1 commit" })).toBeVisible()
    })
})
