import { aStatusOn } from "../services/gitApi.mocks"
import { operationNoticeOf, operationSummaryOf } from "./operationNotice"

const CONFLICTS = { staged: 0, unstaged: 0, untracked: 0, conflicted: 2 }

describe("operationNoticeOf", () => {
    it("should say nothing while no operation is in progress", () => {
        // Arrange & Act
        const notice = operationNoticeOf(aStatusOn("main"))

        // Assert
        expect(notice).toBe(null)
    })

    it("should explain how to finish a merge, count its conflicted files and offer to abort it", () => {
        // Arrange & Act
        const notices = [
            operationNoticeOf(aStatusOn("main", { operationInProgress: "merge", counts: CONFLICTS })),
            operationNoticeOf(aStatusOn("main", { operationInProgress: "merge", counts: { ...CONFLICTS, conflicted: 1 } })),
            operationNoticeOf(aStatusOn("main", { operationInProgress: "merge", counts: { ...CONFLICTS, conflicted: 0 } }))
        ]

        // Assert
        expect(notices).toEqual([
            {
                text: "Merging into 'main'. Resolve the conflicts in your editor, stage the files, then commit. 2 files have conflicts.",
                abortable: "merge"
            },
            {
                text: "Merging into 'main'. Resolve the conflicts in your editor, stage the files, then commit. 1 file has conflicts.",
                abortable: "merge"
            },
            { text: "Merging into 'main'. Resolve the conflicts in your editor, stage the files, then commit.", abortable: "merge" }
        ])
    })

    it("should explain how to finish a rebase, also while git has no branch checked out", () => {
        // Arrange & Act
        const notices = [
            operationNoticeOf(aStatusOn("feature/x", { operationInProgress: "rebase" })),
            operationNoticeOf(aStatusOn("feature/x", { operationInProgress: "rebase", head: { kind: "detached", commit: "a".repeat(40) } }))
        ]

        // Assert
        expect(notices).toEqual([
            {
                text: "Rebasing 'feature/x'. Resolve the conflicts in your editor, stage the files, then continue the rebase in a terminal.",
                abortable: "rebase"
            },
            {
                text: "A rebase is in progress. Resolve the conflicts in your editor, stage the files, then continue the rebase in a terminal.",
                abortable: "rebase"
            }
        ])
    })

    it.each([
        ["cherryPick", "A cherry-pick is in progress. Finish or abort it in a terminal."],
        ["revert", "A revert is in progress. Finish or abort it in a terminal."],
        ["bisect", "A bisect is in progress. Finish or abort it in a terminal."]
    ] as const)("should leave a %s to the terminal", (operationInProgress, text) => {
        // Arrange & Act
        const notice = operationNoticeOf(aStatusOn("main", { operationInProgress }))

        // Assert
        expect(notice).toEqual({ text, abortable: null })
    })

    it("should name a detached HEAD by its short SHA during a merge", () => {
        // Arrange & Act
        const notice = operationNoticeOf(
            aStatusOn("main", { operationInProgress: "merge", head: { kind: "detached", commit: "b".repeat(40) } })
        )

        // Assert
        expect(notice?.text).toMatch(/^Merging into bbbbbbb\./)
    })
})

describe("operationSummaryOf", () => {
    it("should name a merge or rebase with its conflicts and point to the History, and other operations to a terminal", () => {
        // Arrange & Act
        const summaries = [
            operationSummaryOf(aStatusOn("main")),
            operationSummaryOf(aStatusOn("main", { operationInProgress: "merge", counts: CONFLICTS })),
            operationSummaryOf(aStatusOn("main", { operationInProgress: "rebase", counts: { ...CONFLICTS, conflicted: 0 } })),
            operationSummaryOf(aStatusOn("main", { operationInProgress: "cherryPick" }))
        ]

        // Assert
        expect(summaries).toEqual([
            null,
            "Merging — 2 files have conflicts. Finish or abort it in the History.",
            "Rebasing. Finish or abort it in the History.",
            "A cherry-pick is in progress. Finish or abort it in a terminal."
        ])
    })
})
