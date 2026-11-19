import { changeBadgeOf, fileNameOf, folderOf, workingTreeSummary } from "./changedFileText"

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
})
