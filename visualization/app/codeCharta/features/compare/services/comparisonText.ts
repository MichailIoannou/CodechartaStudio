import type { BaseMode, ComparedCommit, CompareError, ResolvedComparison } from "../model/compare.model"

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
function refName(commit: ComparedCommit): string {
    return commit.label.kind === "commit" ? commit.shortCommit : commit.label.name
}

/** The name shown beside the short commit, or null for a plain commit. */
export function sideCaption(commit: ComparedCommit): string | null {
    return commit.label.kind === "commit" ? null : commit.label.name
}

export function rangeText(base: ComparedCommit, head: ComparedCommit, baseMode: BaseMode): string {
    const separator = baseMode === "mergeBase" ? MERGE_BASE_SEPARATOR : TIP_SEPARATOR
    return `${refName(base)}${separator}${refName(head)}`
}

export function parseRange(text: string): ParsedRange | null {
    const trimmed = text.trim()
    const separator = trimmed.includes(MERGE_BASE_SEPARATOR) ? MERGE_BASE_SEPARATOR : TIP_SEPARATOR
    const [base, head, ...rest] = trimmed.split(separator)
    if (rest.length > 0 || !base || !head) {
        return null
    }
    return { base, head, baseMode: separator === MERGE_BASE_SEPARATOR ? "mergeBase" : "tip" }
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
