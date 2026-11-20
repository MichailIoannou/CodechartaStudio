import { aSnapshot } from "../../projects/projects.mocks"
import { analysesWithSize, deleteQuestion, movedText, recycleFailedForCleanup } from "./retentionWording"

describe("retentionWording", () => {
    it("should ask before moving an analysis or an imported snapshot to the recycle bin", () => {
        // Arrange
        const commit = aSnapshot("p", "f", "s-1", { target: "commit", shortCommit: "a1b2c3d", subject: "Fix invoice rounding" })
        const withoutSubject = aSnapshot("p", "f", "s-2", { target: "commit", shortCommit: "9f8e7d6" })
        const workingTree = aSnapshot("p", "f", "s-3", { target: "workingTree", shortCommit: "a1b2c3d" })
        const imported = aSnapshot("p", "f", "s-4", { source: "imported", originalFileName: "export-2024.cc.json" })
        const importedWithoutName = aSnapshot("p", "f", "s-5", { source: "imported" })

        // Act
        const questions = [commit, withoutSubject, workingTree, imported, importedWithoutName].map(deleteQuestion)

        // Assert
        expect(questions).toEqual([
            "Move the analysis of a1b2c3d (Fix invoice rounding) to the recycle bin?",
            "Move the analysis of 9f8e7d6 to the recycle bin?",
            "Move the analysis of the working tree (on a1b2c3d) to the recycle bin?",
            "Move the imported snapshot 'export-2024.cc.json' to the recycle bin? It can only be restored from the recycle bin.",
            "Move the imported snapshot 's-5' to the recycle bin? It can only be restored from the recycle bin."
        ])
    })

    it("should count what a clean-up moved and freed", () => {
        // Arrange & Act
        const texts = [analysesWithSize(1, 1000), movedText({ deleted: 30, freedBytes: 3_000_000 })]

        // Assert
        expect(texts).toEqual(["1 analysis (1.0 kB)", "Moved 30 analyses (3.0 MB) to the recycle bin."])
    })

    it("should say how much of a clean-up the recycle bin took before it failed", () => {
        // Arrange & Act
        const texts = [recycleFailedForCleanup(0, 30), recycleFailedForCleanup(4, 30)]

        // Assert
        expect(texts).toEqual([
            "Could not move the analyses to the recycle bin. Nothing was deleted.",
            "Could not move every analysis to the recycle bin. Moved 4 of 30; the rest were kept."
        ])
    })
})
