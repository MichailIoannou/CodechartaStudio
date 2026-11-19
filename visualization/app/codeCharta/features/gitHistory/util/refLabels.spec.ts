import { aLocalBranch, aRefs, aRemoteBranch, aTag } from "../services/gitApi.mocks"
import { refLabelsByCommit } from "./refLabels"

const TIP = "1".repeat(40)
const RELEASE = "2".repeat(40)

describe("refLabelsByCommit", () => {
    it("should put each label on its commit with the current branch first and tags last", () => {
        // Arrange
        const refs = aRefs({
            head: { kind: "branch", name: "feature/x", commit: TIP },
            localBranches: [aLocalBranch("main", { commit: RELEASE }), aLocalBranch("feature/x", { commit: TIP, isCurrent: true })],
            remoteBranches: [{ ...aRemoteBranch("origin", "feature/x"), commit: TIP }],
            tags: [{ ...aTag("v2.4.0"), commit: RELEASE }]
        })

        // Act
        const labels = refLabelsByCommit(refs)

        // Assert
        expect(labels.get(TIP)).toEqual([
            { kind: "currentBranch", name: "feature/x", refName: "refs/heads/feature/x" },
            { kind: "remoteBranch", name: "origin/feature/x", refName: "refs/remotes/origin/feature/x" }
        ])
        expect(labels.get(RELEASE)).toEqual([
            { kind: "localBranch", name: "main", refName: "refs/heads/main" },
            { kind: "tag", name: "v2.4.0", refName: "refs/tags/v2.4.0" }
        ])
    })

    it("should label a detached head", () => {
        // Arrange
        const refs = aRefs({ head: { kind: "detached", commit: TIP }, localBranches: [aLocalBranch("main", { commit: RELEASE })] })

        // Act
        const labels = refLabelsByCommit(refs)

        // Assert
        expect(labels.get(TIP)).toEqual([{ kind: "detachedHead", name: "HEAD", refName: "HEAD" }])
    })

    it("should give a commit without refs no labels", () => {
        // Act
        const labels = refLabelsByCommit(aRefs())

        // Assert
        expect(labels.has(TIP)).toBe(false)
    })
})
