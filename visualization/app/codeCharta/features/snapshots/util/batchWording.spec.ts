import type { BatchResult } from "../../../model/coreApi/BatchResult"
import { batchLabel, batchSummary, estimateText, leftOutText } from "./batchWording"

const TIP = "a1b2c3d".padEnd(40, "0")

function aResult(toAnalyse: number, alreadyAnalysed: number): BatchResult {
    return {
        batchId: null,
        toAnalyse: Array.from({ length: toAnalyse }, (_, index) => `${index}`.padEnd(40, "a")),
        alreadyAnalysed: Array.from({ length: alreadyAnalysed }, (_, index) => `${index}`.padEnd(40, "b")),
        leftOut: 0,
        jobs: [],
        estimatedDurationMs: null,
        problems: []
    }
}

describe("batchWording", () => {
    it("should count the commits to analyse and the analysed ones", () => {
        // Arrange
        const lastCommits = { kind: "lastCommits" as const, tipSha: TIP, count: 20, firstParentOnly: true }

        // Act
        const summaries = [
            batchSummary(aResult(13, 7), lastCommits),
            batchSummary(aResult(1, 0), lastCommits),
            batchSummary(aResult(2, 1), { kind: "tags" })
        ]

        // Assert
        expect(summaries).toEqual([
            "20 commits: 13 to analyse, 7 already analysed.",
            "1 commit: 1 to analyse, 0 already analysed.",
            "3 tagged commits: 2 to analyse, 1 already analysed."
        ])
    })

    it("should estimate in minutes or hours and say when there is no estimate", () => {
        // Arrange
        const durations = [null, 10_000, 14 * 60_000, 3 * 60 * 60_000]

        // Act
        const texts = durations.map(estimateText)

        // Assert
        expect(texts).toEqual([
            "No estimate yet — this folder has no earlier analyses.",
            "About 1 minute (based on earlier analyses of this folder).",
            "About 14 minutes (based on earlier analyses of this folder).",
            "About 3 hours (based on earlier analyses of this folder)."
        ])
    })

    it("should mention left out tags only when there are some", () => {
        // Arrange & Act
        const texts = [leftOutText(0), leftOutText(5)]

        // Assert
        expect(texts).toEqual([null, "5 older tagged commits left out — at most 200 commits per batch."])
    })

    it("should name a batch by its branch, its tip or its tags", () => {
        // Arrange
        const lastCommits = { kind: "lastCommits" as const, tipSha: TIP, count: 20, firstParentOnly: true }

        // Act
        const labels = [
            batchLabel(lastCommits, "main"),
            batchLabel(lastCommits, null),
            batchLabel({ kind: "tags" }, null),
            batchLabel({ kind: "commits", shas: [TIP] }, null)
        ]

        // Assert
        expect(labels).toEqual(["last 20 commits of main", "last 20 commits up to a1b2c3d", "every tag", "1 commit"])
    })
})
