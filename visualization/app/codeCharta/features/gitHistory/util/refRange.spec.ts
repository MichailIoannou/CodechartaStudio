import { parseRefRange } from "./refRange"

describe("parseRefRange", () => {
    it("should read two dots as tip with tip and three dots as from the merge base", () => {
        // Act
        const tip = parseRefRange(" main..feature/x ")
        const mergeBase = parseRefRange("v1.0...HEAD")

        // Assert
        expect(tip).toEqual({ base: "main", head: "feature/x", isMergeBase: false })
        expect(mergeBase).toEqual({ base: "v1.0", head: "HEAD", isMergeBase: true })
    })

    it("should not read text without both sides or with a second range", () => {
        // Act
        const results = ["main", "main..", "..main", "a..b..c"].map(parseRefRange)

        // Assert
        expect(results).toEqual([null, null, null, null])
    })
})
