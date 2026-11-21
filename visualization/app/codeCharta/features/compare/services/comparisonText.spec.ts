import { aSnapshot } from "../../projects/projects.mocks"
import type { ComparedCommit } from "../model/compare.model"
import { aComparedCommit, aResolvedComparison, BASE_SHA, HEAD_SHA } from "../ports/compareGateways.mocks"
import {
    chipLabel,
    errorSentence,
    parseRange,
    rangeText,
    resolveOutcome,
    showingText,
    shownSideCaption,
    sideCaption,
    sideName
} from "./comparisonText"

const MAIN = aComparedCommit(BASE_SHA, { kind: "branch", name: "main" })
const FEATURE = aComparedCommit(HEAD_SHA, { kind: "branch", name: "feature/x" })

function aSnapshotSide(kind: "workingTree" | "imported", name: string): ComparedCommit {
    return { ...aComparedCommit(BASE_SHA), kind, commit: null, shortCommit: null, snapshotId: `s-${kind}`, label: { kind, name } }
}

describe("comparisonText", () => {
    it("should name a side by its short commit, else by the label of its snapshot", () => {
        // Act
        const names = [sideName(MAIN), sideName(aSnapshotSide("workingTree", "working tree"))]

        // Assert
        expect(names).toEqual(["9f8e7d6", "working tree"])
    })

    it("should label an imported side by the date of its file, or say the date is unknown", () => {
        // Arrange
        const imported = aSnapshotSide("imported", "export.cc.json")
        const withDate = aSnapshot("p", "f", "s-imported", { source: "imported", fileModifiedAt: "2026-11-12T10:00:00Z" })
        const withoutDate = aSnapshot("p", "f", "s-imported", { source: "imported" })

        // Act
        const captions = [
            shownSideCaption({ requested: imported, snapshot: withDate }),
            shownSideCaption({ requested: imported, snapshot: withoutDate }),
            shownSideCaption({ requested: aSnapshotSide("workingTree", "working tree"), snapshot: withoutDate })
        ]

        // Assert
        expect(captions).toEqual(["imported 12 Nov", "imported, date unknown", "working tree"])
    })

    it("should label a side in the chip's button by its name, a request by its number, else by its short commit", () => {
        // Arrange
        const snapshot = aSnapshot("p", "f", "s-1", {})

        // Act
        const labels = [
            MAIN,
            aComparedCommit(HEAD_SHA),
            aComparedCommit(HEAD_SHA, { kind: "pullRequest", name: "#123" }),
            aSnapshotSide("workingTree", "working tree")
        ].map(requested => chipLabel({ requested, snapshot }))

        // Assert
        expect(labels).toEqual(["main", "a1b2c3d", "#123", "working tree"])
    })

    it("should say which older or newer analysis a stale side shows", () => {
        // Arrange
        const snapshot = aSnapshot("p", "f", "s-1", { shortCommit: "3c4d5e6" })

        // Act
        const lines = [
            showingText({ snapshot, relation: "ancestor", behind: 2, ahead: 0 }),
            showingText({ snapshot, relation: "descendant", behind: 0, ahead: 1 })
        ]

        // Assert
        expect(lines).toEqual(["showing 3c4d5e6, 2 commits older", "showing 3c4d5e6, which is ahead by 1 commit"])
    })

    it("should call the same snapshot on both sides the same analysis", () => {
        // Arrange
        const side = { requested: aSnapshotSide("workingTree", "working tree"), status: aResolvedComparison().base.status }

        // Act
        const outcome = resolveOutcome(aResolvedComparison({ status: { kind: "sameCommit" }, base: side, head: side }))

        // Assert
        expect(outcome?.text).toBe("Both sides are the same analysis — nothing to compare.")
    })

    it("should label a merge-base comparison with three dots", () => {
        // Act
        const text = rangeText(MAIN, FEATURE, "mergeBase")

        // Assert
        expect(text).toBe("main...feature/x")
    })

    it("should label a tip comparison of plain commits with two dots and short commits", () => {
        // Act
        const text = rangeText(aComparedCommit(BASE_SHA), aComparedCommit(HEAD_SHA), "tip")

        // Assert
        expect(text).toBe("9f8e7d6..a1b2c3d")
    })

    it("should parse a two-dot range into base and head", () => {
        // Act
        const range = parseRange(" main..feature/x ")

        // Assert
        expect(range).toEqual({ base: "main", head: "feature/x", baseMode: "tip" })
    })

    it("should parse a three-dot range as a merge-base comparison", () => {
        // Act
        const range = parseRange("v1.0...HEAD")

        // Assert
        expect(range).toEqual({ base: "v1.0", head: "HEAD", baseMode: "mergeBase" })
    })

    it("should not parse text without both sides", () => {
        // Act
        const ranges = [parseRange("main"), parseRange("main.."), parseRange("a..b..c")]

        // Assert
        expect(ranges).toEqual([null, null, null])
    })

    it("should caption a branch side with its name and a plain commit with nothing", () => {
        // Act
        const captions = [sideCaption(MAIN), sideCaption(aComparedCommit(HEAD_SHA))]

        // Assert
        expect(captions).toEqual(["main", null])
    })

    it("should caption a pull or merge request side as PR or MR with its number", () => {
        // Act
        const captions = [
            sideCaption(aComparedCommit(HEAD_SHA, { kind: "pullRequest", name: "#123" })),
            sideCaption(aComparedCommit(HEAD_SHA, { kind: "pullRequest", name: "!123" }))
        ]

        // Assert
        expect(captions).toEqual(["PR #123", "MR !123"])
    })

    it("should word each stop status of the resolution", () => {
        // Arrange
        const statuses = [
            { kind: "sameCommit" },
            { kind: "alreadyMerged", target: "main" },
            { kind: "noCommonAncestor" },
            { kind: "ready" }
        ] as const

        // Act
        const outcomes = statuses.map(status => resolveOutcome(aResolvedComparison({ status })))

        // Assert
        expect(outcomes).toEqual([
            { tone: "info", text: "Both sides are the same commit — nothing to compare.", offersTipVsTip: false },
            {
                tone: "info",
                text: "'feature/x' is already contained in 'main'. Compare tip vs tip, or pick a base commit.",
                offersTipVsTip: false
            },
            { tone: "warning", text: "'main' and 'feature/x' share no history. Only tip vs tip is possible.", offersTipVsTip: true },
            null
        ])
    })

    it("should word each error of a comparison", () => {
        // Arrange
        const errors = [
            { kind: "refNotFound", message: "", input: "nope", folderLabel: "billing-api" },
            { kind: "loadFailed", message: "disk full" },
            { kind: "rootMismatch", message: "" },
            { kind: "coreUnavailable", message: "" },
            { kind: "coreError", message: "Git is too old." }
        ] as const

        // Act
        const sentences = errors.map(error => errorSentence(error))

        // Assert
        expect(sentences).toEqual([
            "'nope' is not a branch, tag or commit of 'billing-api'.",
            "The analyses could not be loaded: disk full",
            "The two analyses could not be aligned (different root folders). Showing the head alone.",
            "The CodeCharta core is not running.",
            "Git is too old."
        ])
    })
})
