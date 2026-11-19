import { counted } from "../../../util/wording"
import { parseRefRange } from "../../gitHistory/facade"
import type { BaseMode, ComparedCommit, CompareError, LoadedSide, ResolvedComparison, ResolvedSide } from "../model/compare.model"

const MERGE_BASE_SEPARATOR = "..."
const TIP_SEPARATOR = ".."

export interface ParsedRange {
    base: string
    head: string
    baseMode: BaseMode
}

export interface ResolveOutcome {
    tone: "info" | "warning"
    text: string
    offersTipVsTip: boolean
}

/** The branch or tag the user picked, else the short commit. */
export function refName(commit: ComparedCommit): string {
    return commit.label.kind === "commit" ? commit.shortCommit : commit.label.name
}

/** The name shown beside the short commit, or null for a plain commit. */
export function sideCaption(commit: ComparedCommit): string | null {
    return commit.label.kind === "commit" ? null : commit.label.name
}

export function rangeText(base: ComparedCommit, head: ComparedCommit, baseMode: BaseMode): string {
    return rangeOf(refName(base), refName(head), baseMode)
}

/** As git writes a range: three dots from the merge base, two dots tip with tip. */
export function rangeOf(base: string, head: string, baseMode: BaseMode): string {
    return `${base}${baseMode === "mergeBase" ? MERGE_BASE_SEPARATOR : TIP_SEPARATOR}${head}`
}

export function parseRange(text: string): ParsedRange | null {
    const range = parseRefRange(text)
    return range && { base: range.base, head: range.head, baseMode: range.isMergeBase ? "mergeBase" : "tip" }
}

export function resolveOutcome(resolved: ResolvedComparison): ResolveOutcome | null {
    const base = refName(resolved.base.requested)
    const head = refName(resolved.head.requested)
    switch (resolved.status.kind) {
        case "sameCommit":
            return { tone: "info", text: "Both sides are the same commit — nothing to compare.", offersTipVsTip: false }
        case "alreadyMerged":
            return {
                tone: "info",
                text: `'${head}' is already contained in '${resolved.status.target}'. Compare tip vs tip, or pick a base commit.`,
                offersTipVsTip: false
            }
        case "noCommonAncestor":
            return { tone: "warning", text: `'${base}' and '${head}' share no history. Only tip vs tip is possible.`, offersTipVsTip: true }
        case "ready":
            return null
    }
}

export function errorSentence(error: CompareError): string {
    switch (error.kind) {
        case "refNotFound":
            return `'${error.input ?? ""}' is not a branch, tag or commit of '${error.folderLabel ?? ""}'.`
        case "loadFailed":
            return `The analyses could not be loaded: ${error.message}`
        case "rootMismatch":
            return "The two analyses could not be aligned (different root folders). Showing the head alone."
        case "coreUnavailable":
            return "The CodeCharta core is not running."
        case "coreError":
            return error.message
    }
}

/** The analysis status of one side in the preparation rows. */
export function sideStatusText({ status }: ResolvedSide): string {
    if (status.status === "exact") {
        return "analysed"
    }
    const { nearest } = status
    if (!nearest) {
        return "not analysed"
    }
    const older = nearest.relation === "ancestor" ? `, ${counted(nearest.staleBy, "commit")} older` : ""
    return `not analysed · nearest: ${nearest.snapshot.shortCommit ?? ""}${older}`
}

export function staleTitle(side: LoadedSide): string {
    const older = side.relation === "ancestor" ? `, ${counted(side.staleBy, "commit")} older` : ""
    return `No analysis for ${side.requested.shortCommit}. Showing ${side.snapshot.shortCommit ?? ""}${older}.`
}

/** Why "Use nearest" cannot go on, or null when every missing side has a nearest analysis and the two differ. */
export function useNearestRefusal({ base, head }: ResolvedComparison): string | null {
    const sideWithoutNearest = [base, head].find(side => side.status.status === "missing" && side.status.nearest === null)
    if (sideWithoutNearest) {
        return `No nearest analysis for ${refName(sideWithoutNearest.requested)}`
    }
    const [baseId, headId] = [base, head].map(side => shownSnapshotIdOf(side))
    return baseId === headId ? "Both sides would show the same analysis" : null
}

function shownSnapshotIdOf({ status }: ResolvedSide): string | undefined {
    return status.status === "exact" ? status.snapshot.ref.snapshotId : status.nearest?.snapshot.ref.snapshotId
}
