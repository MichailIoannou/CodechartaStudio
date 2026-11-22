import type { ComparedChangeRequest, ComparedCommit, LoadedSide, ResolvedComparison } from "../../model/compare.model"
import { changeRequestLabel } from "../../services/changeRequestText"
import { chipLabel, refName, showingText, shownSideCaption, staleBadge, staleTitle } from "../../services/comparisonText"

export type SideCaption = "Base" | "Head"

/** One side as the chip's button and its dropdown row show it. */
export interface ChipSide {
    caption: SideCaption
    /** The button's short label: branch, tag, request, snapshot label, else the short commit. */
    buttonLabel: string
    /** Null for a working-tree or imported snapshot, which has no commit. */
    shortCommit: string | null
    /** The dropdown row's label beside the short commit, with " · <folder>" when the sides come from two folders. */
    rowLabel: string
    /** "Base: main (9f8e7d6) in billing-api": one half of the button's title. */
    title: string
    status: SideStatus
}

interface SideStatus {
    badge: string
    isStale: boolean
    title: string
    /** "showing 3c4d5e6, 2 commits older" for a side shown by its nearest analysis. */
    showing: string | null
}

export interface BaseModeLine {
    text: string
    title: string
}

export interface ChipChangeRequest {
    label: string
    url: string | null
    title: string
}

/** `namedBy` is the branch a merge-base side came from, which names it instead of the merge base's short commit. */
export function chipSideOf(
    caption: SideCaption,
    side: LoadedSide | null,
    folderLabel: string | null,
    namedBy: ComparedCommit | null = null
): ChipSide | null {
    if (!side) {
        return null
    }
    const buttonLabel = namedBy ? refName(namedBy) : chipLabel(side)
    const { shortCommit } = side.requested
    const named = shortCommit && buttonLabel !== shortCommit ? `${buttonLabel} (${shortCommit})` : buttonLabel
    const inFolder = folderLabel ? ` in ${folderLabel}` : ""
    const rowLabel = [namedBy ? buttonLabel : shownSideCaption(side), folderLabel].filter(Boolean).join(" · ")
    return { caption, buttonLabel, shortCommit, rowLabel, title: `${caption}: ${named}${inFolder}`, status: statusOf(side) }
}

function statusOf(side: LoadedSide): SideStatus {
    const badge = staleBadge(side)
    return badge
        ? { badge, isStale: true, title: staleTitle(side), showing: showingText(side) }
        : { badge: "analysed", isStale: false, title: "", showing: null }
}

/** Only a comparison of branches or a pull request has a base mode worth naming. */
export function baseModeLineOf(resolved: ResolvedComparison | null): BaseModeLine | null {
    if (!resolved || resolved.origin === "commits") {
        return null
    }
    const head = refName(resolved.head.requested)
    const target = refName(resolved.baseTip ?? resolved.base.requested)
    return resolved.baseMode === "mergeBase"
        ? { text: "since the merge base", title: `Changes on '${head}' since it left '${target}'` }
        : { text: "tip vs tip", title: "Everything that differs between the two tips" }
}

export function chipChangeRequestOf(changeRequest: ComparedChangeRequest | null): ChipChangeRequest | null {
    if (!changeRequest) {
        return null
    }
    const label = changeRequestLabel(changeRequest.provider, changeRequest.number)
    const noun = changeRequest.provider === "gitlab" ? "Merge request" : "Pull request"
    return { label, url: changeRequest.url, title: `${noun} ${label}` }
}
