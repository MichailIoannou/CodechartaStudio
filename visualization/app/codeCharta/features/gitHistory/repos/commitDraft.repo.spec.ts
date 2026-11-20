import { TestBed } from "@angular/core/testing"
import { CommitDraftRepo } from "./commitDraft.repo"

describe("CommitDraftRepo", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("should keep the message per repository", () => {
        // Arrange
        const drafts = TestBed.inject(CommitDraftRepo)

        // Act
        drafts.write("/work/api/.git", { subject: "Fix rounding", body: "Half-even." })

        // Assert
        expect(drafts.read("/work/api/.git")).toEqual({ subject: "Fix rounding", body: "Half-even." })
        expect(drafts.read("/work/web/.git")).toEqual({ subject: "", body: "" })
    })

    it("should read a stored value it cannot use as an empty message", () => {
        // Arrange
        const drafts = TestBed.inject(CommitDraftRepo)
        localStorage.setItem("codeChartaCommitDraft.broken", "{not json")
        localStorage.setItem("codeChartaCommitDraft.null", "null")
        localStorage.setItem("codeChartaCommitDraft.wrong", JSON.stringify({ subject: 3, body: "kept" }))

        // Act
        const messages = ["broken", "null", "wrong"].map(id => drafts.read(id))

        // Assert
        expect(messages).toEqual([
            { subject: "", body: "" },
            { subject: "", body: "" },
            { subject: "", body: "kept" }
        ])
    })
})
