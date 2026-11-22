import { aLocalBranch, anUpstream } from "../services/gitApi.mocks"
import {
    forcePushReasonOf,
    mainSyncAction,
    publishReasonOf,
    publishRemoteOf,
    pullReasonOf,
    pushReasonOf,
    remoteOfUpstream,
    syncMenuItems
} from "./syncState"

const ORIGIN = { name: "origin", url: "https://example.com/billing-api.git" }
const FORK = { name: "fork", url: "https://example.com/fork.git" }
const NESTED = { name: "team/fork", url: "https://example.com/team.git" }

function onBranch(upstream: ReturnType<typeof anUpstream> | null) {
    return aLocalBranch("feature/x", { isCurrent: true, upstream })
}

describe("syncState", () => {
    describe("mainSyncAction", () => {
        it("should fetch when HEAD is detached", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: null, remotes: [ORIGIN] })

            // Assert
            expect(action).toEqual({
                kind: "fetch",
                label: "Fetch",
                icon: "fa-solid fa-rotate",
                title: "Fetch from all remotes",
                ahead: null,
                behind: null,
                disabledReason: null
            })
        })

        it("should publish a branch without upstream to origin", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: onBranch(null), remotes: [FORK, ORIGIN] })

            // Assert
            expect(action).toEqual(
                expect.objectContaining({
                    kind: "publish",
                    label: "Publish",
                    icon: "fa-solid fa-cloud-arrow-up",
                    title: "Publish 'feature/x' to origin and track it",
                    disabledReason: null
                })
            )
        })

        it("should offer publish disabled in a repository without remotes", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: onBranch(null), remotes: [] })

            // Assert
            expect(action).toEqual(expect.objectContaining({ kind: "publish", disabledReason: "This repository has no remote." }))
        })

        it("should fetch when the upstream no longer exists", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: onBranch(anUpstream("origin/feature/x", { isGone: true })), remotes: [ORIGIN] })

            // Assert
            expect(action).toEqual(
                expect.objectContaining({
                    kind: "fetch",
                    title: "origin/feature/x no longer exists — set another upstream in the menu"
                })
            )
        })

        it("should pull when behind, fast-forward only", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: onBranch(anUpstream("origin/feature/x", { behind: 3 })), remotes: [ORIGIN] })

            // Assert
            expect(action).toEqual(
                expect.objectContaining({
                    kind: "pull",
                    label: "Pull",
                    icon: "fa-solid fa-arrow-down",
                    title: "Pull 3 commits from origin/feature/x (fast-forward only)",
                    ahead: null,
                    behind: 3
                })
            )
        })

        it("should pull first and show both counts when the branch has diverged", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: onBranch(anUpstream("origin/feature/x", { ahead: 2, behind: 1 })), remotes: [ORIGIN] })

            // Assert
            expect(action).toEqual(
                expect.objectContaining({ kind: "pull", title: "The branch has diverged: pull first, then push", ahead: 2, behind: 1 })
            )
        })

        it("should push when ahead", () => {
            // Arrange & Act
            const action = mainSyncAction({ branch: onBranch(anUpstream("origin/feature/x", { ahead: 1 })), remotes: [ORIGIN] })

            // Assert
            expect(action).toEqual(
                expect.objectContaining({
                    kind: "push",
                    label: "Push",
                    icon: "fa-solid fa-arrow-up",
                    title: "Push 1 commit to origin/feature/x",
                    ahead: 1,
                    behind: null
                })
            )
        })

        it("should fetch during a merge or rebase, even when the branch is behind or unpublished", () => {
            // Arrange
            const branches = [onBranch(anUpstream("origin/feature/x", { behind: 3 })), onBranch(null)]

            // Act
            const actions = branches.map(branch => mainSyncAction({ branch, remotes: [ORIGIN], inProgress: "rebase" }))

            // Assert
            expect(actions.map(action => [action.kind, action.disabledReason])).toEqual([
                ["fetch", null],
                ["fetch", null]
            ])
        })

        it("should fetch when the branch is in sync or git could not count", () => {
            // Arrange & Act
            const kinds = [anUpstream("origin/feature/x"), anUpstream("origin/feature/x", { ahead: null, behind: null })].map(
                upstream => mainSyncAction({ branch: onBranch(upstream), remotes: [ORIGIN] }).kind
            )

            // Assert
            expect(kinds).toEqual(["fetch", "fetch"])
        })
    })

    describe("reasons", () => {
        it("should give every sync item a reason on a detached HEAD", () => {
            // Arrange & Act
            const reasons = [pullReasonOf(null), pushReasonOf(null), forcePushReasonOf(null)]

            // Assert
            expect(reasons).toEqual(Array.from({ length: 3 }, () => "HEAD is detached: switch to a branch first."))
        })

        it("should refuse pull, push and force push without an upstream or with a gone one", () => {
            // Arrange
            const branches = [onBranch(null), onBranch(anUpstream("origin/feature/x", { isGone: true }))]

            // Act
            const reasons = branches.map(branch => [pullReasonOf(branch), pushReasonOf(branch), forcePushReasonOf(branch)])

            // Assert
            expect(reasons).toEqual([
                Array.from({ length: 3 }, () => "'feature/x' has no upstream branch."),
                Array.from({ length: 3 }, () => "origin/feature/x no longer exists — set another upstream in the menu")
            ])
        })

        it("should leave a pull to git when nothing is behind and refuse a push with nothing to push and a force push with nothing to replace", () => {
            // Arrange
            const branch = onBranch(anUpstream("origin/feature/x"))

            // Act
            const reasons = [pullReasonOf(branch), pushReasonOf(branch), forcePushReasonOf(branch)]

            // Assert
            expect(reasons).toEqual([null, "Nothing to push", "Nothing on the remote would be replaced."])
        })

        it("should refuse pull, push, publish and force push until a merge or rebase is finished", () => {
            // Arrange
            const branch = onBranch(anUpstream("origin/feature/x", { ahead: 2, behind: 1 }))

            // Act
            const reasons = (["merge", "rebase"] as const).map(inProgress => [
                pullReasonOf(branch, inProgress),
                pushReasonOf(branch, inProgress),
                forcePushReasonOf(branch, inProgress),
                publishReasonOf([ORIGIN], inProgress)
            ])

            // Assert
            expect(reasons).toEqual([
                Array.from({ length: 4 }, () => "Finish or abort the merge first."),
                Array.from({ length: 4 }, () => "Finish or abort the rebase first.")
            ])
        })

        it("should allow push and force push of a branch that has diverged", () => {
            // Arrange
            const branch = onBranch(anUpstream("origin/feature/x", { ahead: 2, behind: 1 }))

            // Act
            const reasons = [pushReasonOf(branch), forcePushReasonOf(branch)]

            // Assert
            expect(reasons).toEqual([null, null])
        })

        it("should refuse to publish without a remote", () => {
            // Arrange & Act
            const reasons = [publishReasonOf([]), publishReasonOf([ORIGIN])]

            // Assert
            expect(reasons).toEqual(["This repository has no remote.", null])
        })
    })

    describe("remotes", () => {
        it("should publish to origin, else to the first remote", () => {
            // Arrange & Act
            const remotes = [publishRemoteOf([FORK, ORIGIN]), publishRemoteOf([FORK]), publishRemoteOf([])]

            // Assert
            expect(remotes).toEqual(["origin", "fork", null])
        })

        it("should find the remote of an upstream, preferring the longest matching remote name", () => {
            // Arrange & Act
            const remotes = [
                remoteOfUpstream(anUpstream("origin/feature/x"), [ORIGIN, FORK]),
                remoteOfUpstream(anUpstream("team/fork/main"), [FORK, NESTED]),
                remoteOfUpstream(anUpstream("gone/main"), [ORIGIN])
            ]

            // Assert
            expect(remotes).toEqual(["origin", "team/fork", null])
        })
    })

    describe("syncMenuItems", () => {
        it("should list every sync action of a tracked branch with the reason it cannot run", () => {
            // Arrange & Act
            const items = syncMenuItems({ branch: onBranch(anUpstream("origin/feature/x", { behind: 1 })), remotes: [ORIGIN] })

            // Assert
            expect(items.map(item => [item.label, item.disabledReason])).toEqual([
                ["Fetch", null],
                ["Fetch and Remove Deleted Branches", null],
                ["Pull", null],
                ["Push", "Nothing to push"],
                ["Force Push (with Lease)…", null],
                ["Set Upstream…", null]
            ])
        })

        it("should disable every item but fetch and set upstream during a merge", () => {
            // Arrange
            const branch = onBranch(anUpstream("origin/feature/x", { behind: 1 }))

            // Act
            const items = syncMenuItems({ branch, remotes: [ORIGIN], inProgress: "merge" })

            // Assert
            expect(items.map(item => [item.action, item.disabledReason])).toEqual([
                ["fetch", null],
                ["fetchPrune", null],
                ["pull", "Finish or abort the merge first."],
                ["push", "Finish or abort the merge first."],
                ["forcePush", "Finish or abort the merge first."],
                ["setUpstream", null]
            ])
        })

        it("should add Publish Branch for a branch without upstream", () => {
            // Arrange & Act
            const items = syncMenuItems({ branch: onBranch(null), remotes: [ORIGIN] })

            // Assert
            expect(items.map(item => item.action)).toEqual(["fetch", "fetchPrune", "pull", "push", "publish", "forcePush", "setUpstream"])
        })

        it("should leave out the branch actions while HEAD is detached", () => {
            // Arrange & Act
            const items = syncMenuItems({ branch: null, remotes: [ORIGIN] })

            // Assert
            expect(items.map(item => item.action)).toEqual(["fetch", "fetchPrune", "pull", "push", "forcePush"])
            expect(items[2].disabledReason).toBe("HEAD is detached: switch to a branch first.")
        })
    })
})
