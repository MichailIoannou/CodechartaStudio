import { checkBranchName } from "./branchName"

describe("checkBranchName", () => {
    it("should accept a new well-formed name", () => {
        // Arrange & Act
        const check = checkBranchName("feature/invoice-rounding", ["main"])

        // Assert
        expect(check).toEqual({ isValid: true, message: null })
    })

    it("should refuse an empty name without a message", () => {
        // Arrange & Act
        const check = checkBranchName("", ["main"])

        // Assert
        expect(check).toEqual({ isValid: false, message: null })
    })

    it("should explain a leading dash, forbidden characters and a taken name", () => {
        // Arrange
        const names = ["-x", "a..b", "my branch", "x~1", "x^", "a:b", "what?", "a*", "[a", "a\\b", "a@{1}", "main"]

        // Act
        const messages = names.map(name => checkBranchName(name, ["main"]).message)

        // Assert
        const forbidden = "A branch name cannot contain spaces, '..', '~', '^', ':', '?', '*', '[', '\\' or '@{'."
        expect(messages).toEqual([
            "A branch name cannot start with '-'.",
            ...Array.from({ length: 10 }, () => forbidden),
            "A branch named 'main' already exists."
        ])
    })
})
