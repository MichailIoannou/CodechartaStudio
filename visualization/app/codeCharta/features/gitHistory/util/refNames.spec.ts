import { refShortName } from "./refNames"

describe("refNames", () => {
    it("should name branches, remote branches and tags as git shows them", () => {
        // Arrange
        const refNames = ["refs/heads/feature/x", "refs/remotes/origin/main", "refs/tags/v2.4.0"]

        // Act
        const shortNames = refNames.map(refShortName)

        // Assert
        expect(shortNames).toEqual(["feature/x", "origin/main", "v2.4.0"])
    })

    it("should keep a ref outside the usual places whole", () => {
        // Arrange & Act
        const shortName = refShortName("refs/codecharta/pr/12")

        // Assert
        expect(shortName).toBe("refs/codecharta/pr/12")
    })
})
