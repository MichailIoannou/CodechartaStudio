import { TestBed } from "@angular/core/testing"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"
import { BaseModeRepo } from "./baseMode.repo"
import { RECENT_COMPARISON_LIMIT, RecentComparison, RecentComparisonsRepo } from "./recentComparisons.repo"

function aComparison(head: string, overrides: Partial<RecentComparison> = {}): RecentComparison {
    return { folderId: "f-api", base: "main", head, baseMode: "mergeBase", comparedAt: 1, ...overrides }
}

describe("RecentComparisonsRepo", () => {
    let repo: RecentComparisonsRepo

    beforeEach(() => {
        localStorage.clear()
        repo = TestBed.inject(RecentComparisonsRepo)
    })

    it("should keep the ten most recent comparisons per project", () => {
        // Arrange
        const heads = Array.from({ length: RECENT_COMPARISON_LIMIT + 2 }, (_, index) => `feature/${index}`)

        // Act
        for (const head of heads) {
            repo.remember("p-billing", aComparison(head))
        }
        repo.remember("p-other", aComparison("elsewhere"))

        // Assert
        expect(repo.read("p-billing").map(entry => entry.head)).toEqual(heads.reverse().slice(0, RECENT_COMPARISON_LIMIT))
        expect(repo.read("p-other")).toEqual([aComparison("elsewhere")])
    })

    it("should not store a comparison twice", () => {
        // Act
        repo.remember("p-billing", aComparison("feature/x", { comparedAt: 1 }))
        repo.remember("p-billing", aComparison("feature/y"))
        repo.remember("p-billing", aComparison("feature/x", { comparedAt: 3 }))
        repo.remember("p-billing", aComparison("feature/x", { baseMode: "tip" }))

        // Assert
        expect(repo.read("p-billing")).toEqual([
            aComparison("feature/x", { baseMode: "tip" }),
            aComparison("feature/x", { comparedAt: 3 }),
            aComparison("feature/y")
        ])
    })

    it("should survive unreadable storage", () => {
        // Arrange
        localStorage.setItem("codeChartaRecentComparisons", "{not json")
        const unreadable = repo.read("p-billing")
        localStorage.setItem("codeChartaRecentComparisons", JSON.stringify({ "p-billing": [{ head: 1 }, aComparison("kept")] }))
        jest.spyOn(TestBed.inject(LocalStorageRepo), "write").mockImplementation(() => undefined)

        // Act
        const partly = repo.read("p-billing")
        repo.remember("p-billing", aComparison("lost"))

        // Assert
        expect(unreadable).toEqual([])
        expect(partly).toEqual([aComparison("kept")])
    })
})

describe("BaseModeRepo", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("should start from the merge base and remember tip vs tip per project", () => {
        // Arrange
        const repo = TestBed.inject(BaseModeRepo)
        const initial = repo.read("p-billing")

        // Act
        repo.write("p-billing", "tip")

        // Assert
        expect(initial).toBe("mergeBase")
        expect(repo.read("p-billing")).toBe("tip")
        expect(repo.read("p-other")).toBe("mergeBase")
    })

    it("should read unreadable storage as the default", () => {
        // Arrange
        localStorage.setItem("codeChartaCompareBaseMode", "[")

        // Act
        const baseMode = TestBed.inject(BaseModeRepo).read("p-billing")

        // Assert
        expect(baseMode).toBe("mergeBase")
    })
})
