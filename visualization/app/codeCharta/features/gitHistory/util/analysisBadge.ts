import type { AnalysedCommitMarker } from "../ports/analysedCommits.port"
import { shortCommitDateTime } from "./commitDate"

export interface AnalysisBadge {
    label: string
    toneClass: string
    title: string
}

/** The worded badge of design H8's Analysis column. */
export function analysisBadgeOf(marker: AnalysedCommitMarker): AnalysisBadge {
    switch (marker.state) {
        case "analysed":
            return marker.isLoadedInMap
                ? { label: "in map", toneClass: "badge-primary", title: "This analysis is shown in the map" }
                : { label: "analysed", toneClass: "badge-success", title: analysedTitle(marker) }
        case "queued":
            return { label: "queued", toneClass: "badge-ghost", title: "Waiting for another analysis to finish" }
        case "running":
            return { label: runningLabel(marker.progressPercent), toneClass: "badge-info", title: "Analysis running" }
        case "failed":
            return { label: "failed", toneClass: "badge-error", title: failedTitle(marker.failureMessage) }
    }
}

function analysedTitle({ analysedAt, note }: AnalysedCommitMarker): string {
    const when = analysedAt === null || analysedAt === undefined ? "Analysed" : `Analysed ${shortCommitDateTime(analysedAt)}`
    return note ? `${when} — ${note}` : when
}

function runningLabel(progressPercent: number | null | undefined): string {
    return progressPercent === null || progressPercent === undefined ? "analysing" : `${Math.round(progressPercent)} %`
}

function failedTitle(message: string | null | undefined): string {
    return message ? `Analysis failed: ${message}` : "Analysis failed"
}
