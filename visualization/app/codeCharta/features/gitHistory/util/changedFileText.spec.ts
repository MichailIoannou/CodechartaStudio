import { changeBadgeOf, displayNameOf, distanceSentence, entryBadgeOf, fileNameOf, folderOf, workingTreeSummary } from "./changedFileText"

describe("changedFileText", () => {
    it("should word every kind of change", () => {
        // Act
        const labels = (["added", "modified", "deleted", "renamed", "copied", "typeChanged", "unknown"] as const).map(
            change => changeBadgeOf(change).label
        )

        // Assert
        expect(labels).toEqual(["added", "modified", "deleted", "renamed", "copied", "type", "unknown"])
        expect(changeBadgeOf("typeChanged").title).toBe("File type changed, e.g. file to symlink")
    })

    it("should split a path into the file name and its folder", () => {
        // Act & Assert
        expect([fileNameOf("src/billing/invoice.ts"), folderOf("src/billing/invoice.ts")]).toEqual(["invoice.ts", "src/billing"])
        expect([fileNameOf("README.md"), folderOf("README.md")]).toEqual(["README.md", ""])
    })

    it("should sum the working tree changes and name the kinds present", () => {
        // Act
        const summary = workingTreeSummary({ staged: 1, unstaged: 2, untracked: 0, conflicted: 0 })
        const one = workingTreeSummary({ staged: 0, unstaged: 0, untracked: 1, conflicted: 0 })

        // Assert
        expect(summary).toBe("3 changed files: 1 staged, 2 unstaged")
        expect(one).toBe("1 changed file: 1 untracked")
    })

    it("should say how far the newer of two commits is ahead of and behind the older one", () => {
        // Arrange
        const newer = "a1b2c3d4e5".padEnd(40, "0")
        const older = "9f8e7d6c5b".padEnd(40, "0")

        // Act
        const diverged = distanceSentence(newer, older, { sha: older, onlyInTarget: 3, onlyInCandidate: 1 })
        const oneAhead = distanceSentence(newer, older, { sha: older, onlyInTarget: 1, onlyInCandidate: 0 })

        // Assert
        expect(diverged).toBe("a1b2c3d is 3 commits ahead of and 1 behind 9f8e7d6")
        expect(oneAhead).toBe("a1b2c3d is 1 commit ahead of and 0 behind 9f8e7d6")
    })

    it("should word a changes-panel row as conflict, untracked or its change", () => {
        // Arrange & Act
        const labels = [
            entryBadgeOf({ kind: "conflicted", change: "modified" }),
            entryBadgeOf({ kind: "untracked", change: "added" }),
            entryBadgeOf({ kind: "staged", change: "deleted" })
        ].map(badge => [badge.label, badge.toneClass, badge.isSolid ?? false])

        // Assert
        expect(labels).toEqual([
            ["conflict", "badge-warning", true],
            ["untracked", "badge-ghost", false],
            ["deleted", "badge-error", false]
        ])
    })

    it("should name a renamed file with its old and new name", () => {
        // Arrange & Act
        const names = [displayNameOf("src/money.ts", "src/old.ts"), displayNameOf("src/app.ts", null)]

        // Assert
        expect(names).toEqual(["old.ts → money.ts", "app.ts"])
    })
})
