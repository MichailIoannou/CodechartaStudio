import { aLocalBranch, anUpstream } from "../services/gitApi.mocks"
import { branchMenuItems } from "./branchMenu"
import type { BranchRef } from "./branchTree"

function aRef(kind: BranchRef["kind"], overrides: Partial<BranchRef> = {}): BranchRef {
    return { refName: `refs/x/${kind}`, fullName: kind, kind, local: null, lastCommit: null, ...overrides }
}

describe("branchMenuItems", () => {
    it("should offer each kind of branch its actions", () => {
        // Arrange
        const refs = [
            aRef("local", { local: aLocalBranch("main", { isCurrent: true }) }),
            aRef("local", { local: aLocalBranch("feature/x") }),
            aRef("remote"),
            aRef("tag")
        ]

        // Act
        const labels = refs.map(ref => branchMenuItems(ref, false).map(item => item.label))

        // Assert
        expect(labels).toEqual([
            ["Rename…", "Push", "Set Upstream…"],
            ["Switch To", "New Branch from Here…", "Rename…", "Delete…", "Set Upstream…", "Push", "Force Push (with Lease)…"],
            ["Check Out as New Local Branch…", "New Branch from Here…", "Delete from Remote…"],
            ["New Branch from Here…"]
        ])
    })

    it("should disable every item while an operation runs", () => {
        // Arrange
        const ref = aRef("remote")

        // Act
        const reasons = branchMenuItems(ref, true).map(item => item.disabledReason)

        // Assert
        expect(reasons).toEqual(Array.from({ length: 3 }, () => "Waiting for the previous git operation…"))
    })

    it("should not switch to or delete a branch another worktree has checked out", () => {
        // Arrange
        const ref = aRef("local", { local: aLocalBranch("feature/x", { checkedOutInOtherWorktree: "/work/billing-x" }) })

        // Act
        const items = branchMenuItems(ref, false)

        // Assert
        expect(items.map(item => [item.action, item.disabledReason])).toEqual([
            ["switch", "Checked out in /work/billing-x"],
            ["newBranch", null],
            ["rename", null],
            ["delete", "Checked out in /work/billing-x"],
            ["setUpstream", null],
            ["push", "'feature/x' has no upstream branch."],
            ["forcePush", "'feature/x' has no upstream branch."]
        ])
    })

    it("should offer push and force push of a diverged branch and say when there is nothing to push", () => {
        // Arrange
        const diverged = aRef("local", {
            local: aLocalBranch("feature/x", { upstream: anUpstream("origin/feature/x", { ahead: 2, behind: 1 }) })
        })
        const inSync = aRef("local", { local: aLocalBranch("main", { isCurrent: true, upstream: anUpstream("origin/main") }) })

        // Act
        const reasons = [diverged, inSync].map(ref =>
            branchMenuItems(ref, false)
                .filter(item => item.action === "push" || item.action === "forcePush")
                .map(item => item.disabledReason)
        )

        // Assert
        expect(reasons).toEqual([[null, null], ["Nothing to push"]])
    })
})
