import { aFolder } from "../projects.mocks"
import { labelProblem, rowOfProjectFolder } from "./folderListRows"

describe("folderListRows", () => {
    it("should describe a saved folder with its first remote and relationship", () => {
        // Arrange
        const api = aFolder("f-api", { label: "billing-api" })
        const fork = aFolder("f-fork", {
            label: "billing-fork",
            role: "fork",
            status: "missing",
            snapshotCount: 7,
            relationships: [{ kind: "forkOf", folderId: "f-api" }],
            git: {
                topLevel: "/work/f-fork",
                isRepositoryRoot: true,
                remotes: [{ name: "origin", url: "https://github.com/acme/billing-fork.git" }],
                defaultBranch: "main",
                rootCommits: [],
                isShallow: false,
                detectedAt: ""
            }
        })

        // Act
        const row = rowOfProjectFolder(fork, [api, fork])

        // Assert
        expect(row).toEqual({
            key: "f-fork",
            label: "billing-fork",
            role: "fork",
            kind: "git",
            path: "/work/f-fork",
            remote: "origin github.com/acme/billing-fork",
            hint: "fork of billing-api",
            isMissing: true,
            snapshotCount: 7
        })
    })

    it("should leave out a relationship to a folder that is gone", () => {
        // Arrange
        const fork = aFolder("f-fork", { relationships: [{ kind: "sharesHistoryWith", folderId: "f-gone" }] })

        // Act
        const row = rowOfProjectFolder(fork, [fork])

        // Assert
        expect(row.hint).toBeNull()
        expect(row.remote).toBeNull()
    })

    it("should accept a label that is unique without regard to case and has no slash", () => {
        // Arrange & Act
        const problems = [labelProblem("web", ["api"]), labelProblem(" API ", ["api"]), labelProblem("a/b", [])]

        // Assert
        expect(problems).toEqual([null, "Another folder already uses this label.", "A label cannot contain '/'."])
    })
})
