import { aLocalBranch, aLogCommit, aRefs, aRemoteBranch, aTag } from "../services/gitApi.mocks"
import { commitMatches, RECENT_BRANCH_COUNT, refOptionGroups, resolveRefText } from "./refOptions"

const REFS = aRefs({
    localBranches: [
        aLocalBranch("feature/invoice", { isCurrent: true, lastCommit: { subject: "Fix invoice", committedAt: 10 } }),
        aLocalBranch("main", { lastCommit: { subject: "Release", committedAt: 1 } }),
        ...["a", "b", "c", "d", "e", "f"].map((name, index) =>
            aLocalBranch(`topic/${name}`, { lastCommit: { subject: name, committedAt: 100 + index } })
        )
    ],
    remoteBranches: [aRemoteBranch("origin", "feature/invoice")],
    tags: [aTag("v2.4.0")]
})

describe("refOptions", () => {
    it("should group branches, tags and commits", () => {
        // Arrange
        const commits = [aLogCommit("1", "Invoice table")]

        // Act
        const groups = refOptionGroups(REFS, "invoice", commits, "main")

        // Assert
        expect(groups.map(group => group.label)).toEqual(["Branches", "Commits"])
        expect(groups[0].options.map(option => [option.kind, option.name])).toEqual([
            ["branch", "feature/invoice"],
            ["remoteBranch", "origin/feature/invoice"]
        ])
        expect(groups[1].options[0]).toEqual(expect.objectContaining({ kind: "commit", subject: "Invoice table" }))
    })

    it("should suggest the current, the default and the most recent branches, then tags, without a query", () => {
        // Act
        const groups = refOptionGroups(REFS, " ", [aLogCommit("1", "Ignored")], "main")

        // Assert
        expect(groups.map(group => group.id)).toEqual(["branches", "tags"])
        expect(groups[0].options.map(option => option.name)).toEqual([
            "feature/invoice",
            "main",
            "topic/f",
            "topic/e",
            "topic/d",
            "topic/c",
            "topic/b"
        ])
        expect(groups[0].options).toHaveLength(2 + RECENT_BRANCH_COUNT)
    })

    it("should resolve a typed tag before a branch of the same name, and a known commit by its hash", () => {
        // Arrange
        const refs = aRefs({ localBranches: [aLocalBranch("v2.4.0")], tags: [aTag("v2.4.0")] })
        const commit = aLogCommit("e", "Found earlier")

        // Act
        const tag = resolveRefText(refs, "v2.4.0", [])
        const byHash = resolveRefText(refs, "EEEE", [commit])
        const unknown = resolveRefText(refs, "nowhere", [commit])

        // Assert
        expect(tag?.kind).toBe("tag")
        expect(byHash).toEqual({ kind: "commit", name: commit.sha, sha: commit.sha, subject: "Found earlier" })
        expect(unknown).toBeNull()
    })

    it("should put commits whose hash starts with the query before subject matches, once each", () => {
        // Arrange
        const byHash = aLogCommit("ab", "First")
        const bySubject = aLogCommit("c", "Mentions abab")

        // Act
        const matches = commitMatches("abab", [byHash, bySubject], [bySubject, byHash])

        // Assert
        expect(matches).toEqual([byHash, bySubject])
    })
})
