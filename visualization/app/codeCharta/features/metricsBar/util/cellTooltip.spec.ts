import { cellTooltip } from "./cellTooltip"

describe("cellTooltip", () => {
    it("should join the label and what the card shows", () => {
        // Act
        const tooltip = cellTooltip("Area", "rloc", "Σ 1,420")

        // Assert
        expect(tooltip).toBe("Area · rloc · Σ 1,420")
    })

    it("should leave out the parts the card does not show", () => {
        // Act
        const tooltip = cellTooltip("Edges", "avgCommits", null, "", undefined)

        // Assert
        expect(tooltip).toBe("Edges · avgCommits")
    })
})
