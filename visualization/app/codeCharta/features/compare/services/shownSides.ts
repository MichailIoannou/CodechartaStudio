import type { LoadedSide, ResolvedComparison, ResolvedSide } from "../model/compare.model"

/** The snapshot a side would show (its own, else its nearest) and how many commits that is away from it. */
export type ShownSide = Omit<LoadedSide, "checksum">

/** A side without an analysis, a size verdict other than ok or differing profiles ask the user before loading. */
export function needsDecision({ base, head, preflight }: ResolvedComparison): boolean {
    return (
        base.status.status === "missing" || head.status.status === "missing" || preflight.sizeVerdict !== "ok" || preflight.profilesDiffer
    )
}

export function shownSideOf({ requested, status }: ResolvedSide): ShownSide | null {
    if (status.status === "exact") {
        return { requested, snapshot: status.snapshot, relation: null, staleBy: 0, behind: 0, ahead: 0 }
    }
    const { nearest } = status
    return nearest ? { requested, ...nearest } : null
}
