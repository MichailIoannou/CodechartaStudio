import { aComparedCommit, aResolvedComparison, BASE_SHA, HEAD_SHA } from "../ports/compareGateways.mocks"
import { errorSentence, parseRange, rangeText, resolveOutcome, sideCaption } from "./comparisonText"

const MAIN = aComparedCommit(BASE_SHA, { kind: "branch", name: "main" })
const FEATURE = aComparedCommit(HEAD_SHA, { kind: "branch", name: "feature/x" })

describe("comparisonText", () => {
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
