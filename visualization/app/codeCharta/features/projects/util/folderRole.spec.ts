import type { FolderGitFacts } from "../../../model/coreApi/FolderGitFacts"
import { defaultRoleFor } from "./folderRole"

function gitWithRoots(...rootCommits: string[]): FolderGitFacts {
    return { topLevel: "/work", isRepositoryRoot: true, remotes: [], defaultBranch: "main", rootCommits, isShallow: false, detectedAt: "" }
}

describe("defaultRoleFor", () => {
    it("should make the first folder primary", () => {
        // Arrange & Act
        const role = defaultRoleFor(gitWithRoots("a"), [])

        // Assert
        expect(role).toBe("primary")
    })

    it("should preselect fork for a folder sharing history with the primary", () => {
        // Arrange
        const folders = [{ role: "primary" as const, git: gitWithRoots("a", "b") }]

        // Act
        const role = defaultRoleFor(gitWithRoots("b"), folders)

        // Assert
        expect(role).toBe("fork")
    })

    it("should preselect helper for an unrelated or plain folder", () => {
        // Arrange
        const folders = [{ role: "primary" as const, git: gitWithRoots("a") }]

        // Act
        const roles = [defaultRoleFor(gitWithRoots("z"), folders), defaultRoleFor(null, folders)]

        // Assert
        expect(roles).toEqual(["helper", "helper"])
    })
})
