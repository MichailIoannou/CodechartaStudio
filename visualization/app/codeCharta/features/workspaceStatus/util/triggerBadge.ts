import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { counted } from "../../projects/facade"
import { isUnboundImport, UNCOMMITTED_ANALYSIS_CHIP, uncommittedAnalysisPhrase } from "../../snapshots/facade"

type BadgeTone = "error" | "warning" | "ghost"

export interface TriggerBadge {
    text: string
    tone: BadgeTone
    /** What the badge means, for its `title` and the trigger's `aria-label`. */
    hint: string
}

type BadgeLook = Omit<TriggerBadge, "hint">

/** How far the snapshot in the map is from what the user asked for, as a badge and as words for the title. */
export interface Staleness {
    badge: TriggerBadge
    phrase: string
}

export interface BadgeSituation {
    isFailed: boolean
    isGitActivityBesideAnalysis: boolean
    isAnalysing: boolean
    staleness: Staleness | null
    shown: SnapshotSummary | null
    hasSnapshots: boolean
}

/** The one badge of the workspace status, highest priority first (design W1). */
export function badgeOf(situation: BadgeSituation): TriggerBadge | null {
    const { shown } = situation
    if (situation.isFailed) {
        return { text: "failed", tone: "error", hint: "The analysis failed; the menu has its log" }
    }
    if (situation.isGitActivityBesideAnalysis) {
        return { text: "+1", tone: "ghost", hint: "Another analysis runs as well" }
    }
    if (situation.staleness) {
        return situation.staleness.badge
    }
    if (shown?.dirty) {
        return { ...UNCOMMITTED_ANALYSIS_CHIP, hint: `Map is ${uncommittedAnalysisPhrase(shown.shortCommit)}` }
    }
    if (shown?.source === "imported" && !isUnboundImport(shown)) {
        return { text: "imported", tone: "ghost", hint: "Map is imported; its analysis time is unknown" }
    }
    return situation.hasSnapshots || situation.isAnalysing
        ? null
        : { text: "not analysed", tone: "ghost", hint: "This folder has no analysis yet" }
}

export function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1)
}

/** `wanted` names what the user asked for in a sentence: a short SHA or "the current checkout". */
export function stalenessOf(resolution: SnapshotResolution | null, badge: BadgeLook | null, wanted: string): Staleness | null {
    if (!badge || !(resolution?.kind === "nearest" || resolution?.kind === "exact")) {
        return null
    }
    const phrase = resolution.kind === "exact" ? "analysed with a different profile" : distancePhrase(resolution, wanted)
    return { badge: { ...badge, hint: `Map is ${phrase}` }, phrase }
}

function distancePhrase({ relation, behind, ahead }: Extract<SnapshotResolution, { kind: "nearest" }>, wanted: string): string {
    switch (relation) {
        case "ancestor":
            return `${counted(behind, "commit")} behind ${wanted}`
        case "descendant":
            return `${counted(ahead, "commit")} ahead of ${wanted}`
        case "diverged":
            return `${counted(behind, "commit")} behind and ${ahead} ahead of ${wanted}`
    }
}
