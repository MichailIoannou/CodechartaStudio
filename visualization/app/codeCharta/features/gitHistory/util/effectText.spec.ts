import {
    amendPushedConfirmation,
    commitResult,
    deleteLocalConfirmation,
    deleteRemoteConfirmation,
    deleteUnmergedConfirmation,
    discardConfirmation,
    fetchResult,
    HOOKS_NOTICE,
    renameEffect,
    switchConfirmation
} from "./effectText"

describe("effectText", () => {
    it("should name the folder and both branches when asking to switch with changed files", () => {
        // Arrange & Act
        const many = switchConfirmation({ folderLabel: "billing-api", from: "'main'", to: "feature/x", changedFiles: 3 })
        const one = switchConfirmation({ folderLabel: "billing-api", from: "a1b2c3d", to: "main", changedFiles: 1 })

        // Assert
        expect(many).toEqual({
            title: "Switch Branch",
            text: "Switch 'billing-api' from 'main' to 'feature/x'? Your 3 changed files stay as they are if git can carry them over; otherwise git refuses and nothing changes.",
            verb: null
        })
        expect(one.text).toBe(
            "Switch 'billing-api' from a1b2c3d to 'main'? Your 1 changed file stays as they are if git can carry them over; otherwise git refuses and nothing changes."
        )
    })

    it("should say where the commits of a deleted branch stay reachable, or that they become unreachable", () => {
        // Arrange & Act
        const kept = deleteLocalConfirmation("feature/x", "origin/feature/x")
        const lost = deleteLocalConfirmation("feature/x", null)

        // Assert
        expect(kept).toEqual({
            title: "Delete Branch",
            text: "Delete the local branch 'feature/x'? Its commits stay reachable from 'origin/feature/x'.",
            verb: "Delete"
        })
        expect(lost.text).toBe("Delete the local branch 'feature/x'? Its commits are not on any other branch and become unreachable.")
    })

    it("should count the unmerged commits before a forced delete", () => {
        // Arrange & Act
        const counted = deleteUnmergedConfirmation({ branch: "feature/x", into: "main", commits: 2 })
        const uncounted = deleteUnmergedConfirmation({ branch: "feature/x", into: "main", commits: null })

        // Assert
        expect(counted).toEqual({
            title: "Delete Unmerged Branch",
            text: "'feature/x' has 2 commits not merged into 'main'. Deleting it anyway makes them unreachable (recoverable only through git reflog).",
            verb: "Delete anyway"
        })
        expect(uncounted.text.startsWith("'feature/x' has commits not merged into 'main'.")).toBe(true)
    })

    it("should name the remote when deleting a remote branch", () => {
        // Arrange & Act
        const confirmation = deleteRemoteConfirmation("feature/x", "origin")

        // Assert
        expect(confirmation).toEqual({
            title: "Delete Remote Branch",
            text: "Delete 'feature/x' on remote 'origin'? This removes it for everyone who uses that remote.",
            verb: "Delete from remote"
        })
    })

    it("should word the rename, the hooks notice and the fetch result", () => {
        // Arrange & Act
        const texts = [renameEffect("a", "b"), HOOKS_NOTICE.text, fetchResult(0), fetchResult(1), fetchResult(3)]

        // Assert
        expect(texts).toEqual([
            "Renames the local branch 'a' to 'b'. Its upstream setting is kept; the remote branch is not renamed.",
            "Git runs this repository's hooks and filters, as it would in a terminal. Continue?",
            "Already up to date",
            "Fetched 1 updated ref",
            "Fetched 3 updated refs"
        ])
        expect(HOOKS_NOTICE).toEqual(expect.objectContaining({ title: "Git Hooks", verb: null }))
    })

    it("should name the pushed commit and its upstream before amending it, and word the commit result", () => {
        // Arrange & Act
        const confirmation = amendPushedConfirmation({ shortSha: "abc1234", subject: "Fix invoice rounding", upstream: "origin/main" })

        // Assert
        expect(confirmation).toEqual({
            title: "Amend Pushed Commit",
            text: "The last commit abc1234 'Fix invoice rounding' is already on origin/main. Amending it rewrites it; pushing afterwards needs a force push.",
            verb: "Amend anyway"
        })
        expect(commitResult("a1b2c3d")).toBe("Committed a1b2c3d")
    })

    it("should name up to ten files to discard and count the rest", () => {
        // Arrange
        const eleven = Array.from({ length: 11 }, (_, index) => `f${index}.ts`)
        const tail = "? Tracked files return to the last commit; untracked files go to the recycle bin."

        // Act
        const texts = [["src/a.ts"], ["src/a.ts", "src/b.ts"], ["a", "b", "c"], eleven].map(paths => discardConfirmation(paths).text)

        // Assert
        expect(texts).toEqual([
            `Discard changes to 'src/a.ts'${tail}`,
            `Discard changes to 'src/a.ts' and 'src/b.ts'${tail}`,
            `Discard changes to 'a', 'b' and 'c'${tail}`,
            `Discard changes to 'f0.ts', 'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts', 'f7.ts', 'f8.ts', 'f9.ts' and 1 more${tail}`
        ])
        expect(discardConfirmation(["a"])).toEqual(expect.objectContaining({ title: "Discard Changes", verb: "Discard" }))
    })
})
