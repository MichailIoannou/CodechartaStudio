import type { BatchResult } from "../../../model/coreApi/BatchResult"
import type { BatchSelection } from "../../../model/coreApi/BatchSelection"
import { counted, shortSha } from "../../../util/wording"

export const MAX_BATCH_COMMITS = 200

const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60

/** Design S7: "20 commits: 13 to analyse, 7 already analysed." */
export function batchSummary(result: BatchResult, selection: BatchSelection): string {
    const total = result.toAnalyse.length + result.alreadyAnalysed.length
    const what = selection.kind === "tags" ? counted(total, "tagged commit") : counted(total, "commit")
    return `${what}: ${result.toAnalyse.length} to analyse, ${result.alreadyAnalysed.length} already analysed.`
}

export function leftOutText(leftOut: number): string | null {
    return leftOut > 0 ? `${counted(leftOut, "older tagged commit")} left out — at most ${MAX_BATCH_COMMITS} commits per batch.` : null
}

export function estimateText(estimatedDurationMs: number | null): string {
    if (estimatedDurationMs === null) {
        return "No estimate yet — this folder has no earlier analyses."
    }
    const minutes = Math.max(1, Math.round(estimatedDurationMs / MS_PER_MINUTE))
    const duration = minutes < MINUTES_PER_HOUR ? counted(minutes, "minute") : counted(Math.round(minutes / MINUTES_PER_HOUR), "hour")
    return `About ${duration} (based on earlier analyses of this folder).`
}

/** How the activity names a batch: "last 20 commits of main", "last 20 commits up to a1b2c3d" or "every tag". */
export function batchLabel(selection: BatchSelection, branchName: string | null): string {
    if (selection.kind === "tags") {
        return "every tag"
    }
    if (selection.kind === "commits") {
        return counted(selection.shas.length, "commit")
    }
    const commits = `last ${counted(selection.count, "commit")}`
    return branchName ? `${commits} of ${branchName}` : `${commits} up to ${shortSha(selection.tipSha)}`
}
