import { CodeMapNode, NodeType } from "../../../model/codeCharta.model"
import { deltaChangeSummaryOf, gitChangeLine, signedNumber } from "./deltaChangeSummary"

const ROOT: CodeMapNode = {
    name: "root",
    path: "/root",
    type: NodeType.FOLDER,
    attributes: {},
    fileCount: { added: 12, removed: 3, changed: 41 },
    deltas: { rloc: 1240, complexity: -35 }
}

describe("deltaChangeSummary", () => {
    it("should sum added, removed and changed from the delta root", () => {
        // Act
        const summary = deltaChangeSummaryOf(ROOT, ["rloc", "complexity"])

        // Assert
        expect(summary).toEqual({
            added: 12,
            removed: 3,
            changed: 41,
            metricDeltas: [
                { metric: "rloc", text: "+1,240" },
                { metric: "complexity", text: "−35" }
            ]
        })
    })

    it("should name a metric used for area and height once", () => {
        // Act
        const summary = deltaChangeSummaryOf(ROOT, ["rloc", "rloc"])

        // Assert
        expect(summary.metricDeltas.map(delta => delta.metric)).toEqual(["rloc"])
    })

    it("should count nothing without a delta tree", () => {
        // Act
        const summary = deltaChangeSummaryOf(undefined, ["rloc"])

        // Assert
        expect(summary).toEqual({ added: 0, removed: 0, changed: 0, metricDeltas: [{ metric: "rloc", text: "±0" }] })
    })

    it("should count the files git changed and the renamed ones", () => {
        // Arrange
        const files = [
            { change: "modified" as const, path: "a.ts", previousPath: null },
            { change: "renamed" as const, path: "b.ts", previousPath: "old.ts" }
        ]

        // Act
        const lines = [gitChangeLine(files), gitChangeLine(files.slice(0, 1))]

        // Assert
        expect(lines).toEqual(["2 files changed in git (1 renamed)", "1 file changed in git"])
    })

    it("should sign a number", () => {
        // Act
        const texts = [signedNumber(5), signedNumber(-1500), signedNumber(0)]

        // Assert
        expect(texts).toEqual(["+5", "−1,500", "±0"])
    })
})
