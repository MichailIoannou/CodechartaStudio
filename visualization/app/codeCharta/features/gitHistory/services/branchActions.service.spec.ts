import { TestBed } from "@angular/core/testing"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import type { GitConfirmation } from "../util/effectText"
import { BranchActionsService } from "./branchActions.service"
import { aLocalBranch, anErrorPayload, anUpstream, aRefs, aRemoteBranch, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { GitConfirmationService } from "./gitConfirmation.service"
import { provideGitHistory, settleGit } from "./gitHistoryTestBed.mocks"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])
const MAIN = aLocalBranch("main", { isCurrent: true, commit: "a".repeat(40) })
const FEATURE = aLocalBranch("feature/x", { commit: "c".repeat(40) })
const TRACKED = aLocalBranch("tracked", { upstream: anUpstream("origin/tracked") })
const REMOTE = aRemoteBranch("origin", "feature/y")
const DIRTY = { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 }

function seedWith(
    status: GitStatus = aStatusOn("main"),
    extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}
): FakeDesktopSeed {
    const refs = aRefs({
        head: { kind: "branch", name: "main", commit: MAIN.commit },
        localBranches: [MAIN, FEATURE, TRACKED],
        remoteBranches: [REMOTE, aRemoteBranch("origin", "tracked")],
        remotes: [{ name: "origin", url: "https://example.com/acme/billing-api.git" }]
    })
    return { git: { "f-api": { info: aRepositoryInfo(), status, refs, ...extra } } }
}

describe("BranchActionsService", () => {
    let bridge: FakeDesktopBridge
    let confirmations: GitConfirmationService
    let toast: ToastService
    let asked: (GitConfirmation | null)[]

    async function createService(seed = seedWith()) {
        bridge = provideGitHistory(seed, BILLING).bridge
        confirmations = TestBed.inject(GitConfirmationService)
        toast = TestBed.inject(ToastService)
        asked = []
        const service = TestBed.inject(BranchActionsService)
        await settleGit()
        return service
    }

    /** Answers each confirmation as it appears; the hooks notice of the first write is one of them. */
    async function answerEach(...answers: boolean[]) {
        for (const answer of answers) {
            await settleGit()
            asked.push(confirmations.current())
            confirmations.answer(answer)
        }
        await settleGit()
    }

    const writesOf = (method: string) =>
        bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])

    afterEach(() => {
        jest.clearAllTimers()
    })

    it("should name the folder and both branches before switching with changed files", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main", { counts: DIRTY })))

        // Act
        const switching = service.switchTo(FEATURE)
        await answerEach(true, true)
        await switching

        // Assert
        expect(asked[0]?.text).toBe(
            "Switch 'billing-api' from 'main' to 'feature/x'? Your 3 changed files stay as they are if git can carry them over; otherwise git refuses and nothing changes."
        )
        expect(asked[1]?.title).toBe("Git Hooks")
        expect(writesOf("git.switch")).toEqual([{ repo: API, target: { kind: "local", refName: FEATURE.refName } }])
    })

    it("should send nothing when the switch is declined", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main", { counts: DIRTY })))

        // Act
        const switching = service.switchTo(FEATURE)
        await answerEach(false)
        await switching

        // Assert
        expect(writesOf("git.switch")).toEqual([])
    })

    it("should switch a clean tree without asking, and never to the current branch", async () => {
        // Arrange
        const service = await createService()

        // Act
        await service.switchTo(MAIN)
        const switching = service.switchTo(FEATURE)
        await answerEach(true)
        await switching

        // Assert
        expect(asked.map(confirmation => confirmation?.title)).toEqual(["Git Hooks"])
        expect(writesOf("git.switch")).toHaveLength(1)
    })

    it("should show git's files in an error toast when the switch is refused", async () => {
        // Arrange
        const detail = "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/invoice.ts\nAborting"
        const failure = anErrorPayload("LOCAL_CHANGES_WOULD_BE_OVERWRITTEN", "git refused.", { detail })
        const service = await createService(seedWith(aStatusOn("main"), { failures: { "git.switch": failure } }))

        // Act
        const switching = service.switchTo(FEATURE)
        await answerEach(true)
        await switching

        // Assert
        expect(toast.messages()).toEqual([
            expect.objectContaining({
                text: "Git did not switch: your changes to these files would be overwritten:\nsrc/invoice.ts",
                severity: "error",
                details: detail
            })
        ])
    })

    it("should ask a second time before deleting an unmerged branch with force", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main"), { unmergedBranches: ["feature/x"] }))

        // Act
        const deleting = service.deleteLocal(FEATURE)
        await answerEach(true, true, true)
        await deleting

        // Assert
        expect(asked.map(confirmation => confirmation?.title)).toEqual(["Delete Branch", "Git Hooks", "Delete Unmerged Branch"])
        expect(asked[0]?.text).toBe("Delete the local branch 'feature/x'? Its commits stay reachable from 'main'.")
        expect(asked[2]?.text).toContain("not merged into 'main'.")
        expect(writesOf("git.branchDelete").map(params => (params as { target: unknown }).target)).toEqual([
            { kind: "local", refName: FEATURE.refName, force: false },
            { kind: "local", refName: FEATURE.refName, force: true }
        ])
        expect(toast.messages()).toEqual([])
    })

    it("should keep an unmerged branch when the second confirmation is declined", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main"), { unmergedBranches: ["tracked"] }))

        // Act
        const deleting = service.deleteLocal(TRACKED)
        await answerEach(true, true, false)
        await deleting

        // Assert
        expect(asked[0]?.text).toBe("Delete the local branch 'tracked'? Its commits stay reachable from 'origin/tracked'.")
        expect(writesOf("git.branchDelete")).toHaveLength(1)
    })

    it("should name the remote before deleting a remote branch", async () => {
        // Arrange
        const service = await createService()

        // Act
        const deleting = service.deleteRemote(REMOTE)
        await answerEach(true, true)
        await deleting

        // Assert
        expect(asked[0]).toEqual({
            title: "Delete Remote Branch",
            text: "Delete 'feature/y' on remote 'origin'? This removes it for everyone who uses that remote.",
            verb: "Delete from remote"
        })
        expect(writesOf("git.branchDelete")).toEqual([{ repo: API, target: { kind: "remote", remoteRefName: REMOTE.refName } }])
    })

    it("should toast what a fetch brought, and name the remote when it fails", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main"), { fetchedRefs: 3 }))
        const fetching = service.fetch(true)
        await answerEach(true)
        await fetching
        bridge.failWith("git.fetch", anErrorPayload("NETWORK_UNAVAILABLE", "git could not reach the remote."))

        // Act
        await service.fetch(false)

        // Assert
        expect(writesOf("git.fetch")).toEqual([
            { repo: API, prune: true },
            { repo: API, prune: false }
        ])
        expect(toast.messages().map(message => [message.text, message.severity])).toEqual([
            ["Fetched 3 updated refs", "success"],
            ["'origin' could not be reached. Check your connection.", "error"]
        ])
    })

    it("should say nothing when the user cancelled the operation", async () => {
        // Arrange
        const service = await createService(
            seedWith(aStatusOn("main"), { failures: { "git.fetch": anErrorPayload("CANCELLED", "cancelled") } })
        )

        // Act
        const fetching = service.fetch(false)
        await answerEach(true)
        await fetching

        // Assert
        expect(toast.messages()).toEqual([])
    })

    it("should create, rename, track and set the upstream of branches", async () => {
        // Arrange
        const service = await createService()

        // Act
        const creating = service.createBranch({ name: "feature/z", startPoint: "d".repeat(40), checkout: true })
        await answerEach(true)
        await creating
        await service.renameBranch(FEATURE, "feature/renamed")
        await service.checkOutRemote(REMOTE, "feature/y")
        await service.setUpstream(TRACKED, null)

        // Assert
        expect(writesOf("git.branchCreate")).toEqual([{ repo: API, name: "feature/z", startPoint: "d".repeat(40), checkout: true }])
        expect(writesOf("git.branchRename")).toEqual([{ repo: API, refName: FEATURE.refName, newName: "feature/renamed" }])
        expect(writesOf("git.switch")).toEqual([
            { repo: API, target: { kind: "trackRemote", remoteRefName: REMOTE.refName, localName: "feature/y" } }
        ])
        expect(writesOf("git.setUpstream")).toEqual([{ repo: API, refName: TRACKED.refName, upstreamRefName: null }])
    })

    it("should open and close the branch dialogs", async () => {
        // Arrange
        const service = await createService()

        // Act
        service.openDialog({ kind: "rename", branch: FEATURE })
        const opened = service.dialog()
        service.closeDialog()

        // Assert
        expect(opened).toEqual({ kind: "rename", branch: FEATURE })
        expect(service.dialog()).toBe(null)
    })

    it("should send nothing when a confirmation before a write is declined", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main", { counts: DIRTY })))

        // Act
        const actions = [
            service.checkOutRemote(REMOTE, "feature/y"),
            service.createBranch({ name: "feature/z", startPoint: "d".repeat(40), checkout: true }),
            service.deleteLocal(FEATURE),
            service.deleteRemote(REMOTE)
        ]
        await answerEach(false, false, false, false)
        await Promise.all(actions)

        // Assert
        const writes = ["git.switch", "git.branchCreate", "git.branchDelete"].flatMap(method => writesOf(method))
        expect(writes).toEqual([])
    })

    it("should name a detached HEAD by its short SHA and delete without a branch to keep the commits", async () => {
        // Arrange
        const detached = aStatusOn("main", { head: { kind: "detached", commit: "e".repeat(40) }, counts: DIRTY })
        const seed = seedWith(detached)
        const refs = seed.git?.["f-api"].refs
        if (refs) {
            refs.head = { kind: "detached", commit: "e".repeat(40) }
        }
        const service = await createService(seed)

        // Act
        const switching = service.switchTo(FEATURE)
        await answerEach(false)
        await switching
        const deleting = service.deleteLocal(FEATURE)
        await answerEach(false)
        await deleting

        // Assert
        expect(asked[0]?.text).toContain("from eeeeeee to 'feature/x'")
        expect(asked[1]?.text).toBe("Delete the local branch 'feature/x'? Its commits are not on any other branch and become unreachable.")
    })

    it("should do nothing without a working folder", async () => {
        // Arrange
        bridge = provideGitHistory(seedWith(), null).bridge
        const service = TestBed.inject(BranchActionsService)

        // Act
        await service.renameBranch(FEATURE, "renamed")

        // Assert
        expect(writesOf("git.branchRename")).toEqual([])
    })
})
