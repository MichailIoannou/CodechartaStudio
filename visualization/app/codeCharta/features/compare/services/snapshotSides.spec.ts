import { aSnapshot } from "../../projects/projects.mocks"
import { aCommitSnapshot, BASE_SHA } from "../ports/compareGateways.mocks"
import { snapshotInputOf, snapshotOptionsOf } from "./snapshotSides"

describe("snapshotSides", () => {
    it("should offer working-tree and imported snapshots newest first under names no other one has", () => {
        // Arrange
        const snapshots = [
            aSnapshot("p", "f", "s-old", { source: "imported", originalFileName: "export.cc.json", createdAt: "2026-11-01T08:00:00Z" }),
            aSnapshot("p", "f", "s-new", { source: "imported", originalFileName: "export.cc.json", createdAt: "2026-11-03T08:00:00Z" }),
            aSnapshot("p", "f", "s-wt", { target: "workingTree", shortCommit: "a1b2c3d", createdAt: "2026-11-04T09:12:00Z" }),
            aCommitSnapshot(BASE_SHA)
        ]

        // Act
        const options = snapshotOptionsOf(snapshots)

        // Assert
        expect(options.map(option => [option.snapshotId, option.kind, option.name])).toEqual([
            ["s-wt", "workingTree", expect.stringMatching(/^Working tree \(4 Nov \d\d:\d\d\)$/)],
            ["s-new", "imported", "export.cc.json"],
            ["s-old", "imported", "export.cc.json (2)"]
        ])
        expect(options[0].detail).toBe("uncommitted changes on a1b2c3d")
    })

    it("should offer only the three newest working-tree analyses and every imported map", () => {
        // Arrange
        const workingTree = (day: number) =>
            aSnapshot("p", "f", `s-wt-${day}`, { target: "workingTree", createdAt: `2026-11-0${day}T09:00:00Z` })
        const imported = aSnapshot("p", "f", "s-imp", {
            source: "imported",
            originalFileName: "old.cc.json",
            createdAt: "2026-10-01T08:00:00Z"
        })

        // Act
        const options = snapshotOptionsOf([workingTree(1), workingTree(2), workingTree(3), workingTree(4), imported])

        // Assert
        expect(options.map(option => option.snapshotId)).toEqual(["s-wt-4", "s-wt-3", "s-wt-2", "s-imp"])
    })

    it("should take a picked snapshot as the side and a revision as none", () => {
        // Act
        const picked = snapshotInputOf({ kind: "imported", name: "export.cc.json", sha: "", subject: null, snapshotId: "s-imp" })
        const revision = snapshotInputOf({ kind: "branch", name: "main", sha: BASE_SHA, subject: null })

        // Assert
        expect(picked).toEqual({ kind: "imported", snapshotId: "s-imp" })
        expect(revision).toBeNull()
        expect(snapshotInputOf(null)).toBeNull()
    })
})
