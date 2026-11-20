import type { AnalysisJob, EnqueueResult, ResolvedComparison, ResolvedSide, SideAnalysis } from "../model/compare.model"

type AnalysisState = "pending" | "done" | "failed" | "cancelled"
export type BatchOutcome = "pending" | "cancelled" | "finished"

/** One analysis per side without its own snapshot; a commit on both sides of one folder is analysed once. */
export function missingSidesOf(resolved: ResolvedComparison): SideAnalysis[] {
    const sides: [SideAnalysis["side"], ResolvedSide][] = [
        ["base", resolved.base],
        ["head", resolved.head]
    ]
    const missing = sides
        .filter(([, side]) => side.status.status === "missing")
        .map(([caption, side]) => ({
            side: caption,
            commit: side.requested.commit,
            shortCommit: side.requested.shortCommit,
            jobId: null,
            failure: null
        }))
    const isFirstOfItsFolder = (analysis: SideAnalysis, index: number) =>
        missing.findIndex(other => other.commit === analysis.commit && folderIdOf(resolved, other) === folderIdOf(resolved, analysis)) ===
        index
    return missing.filter(isFirstOfItsFolder)
}

/** The folder a side's commit is analysed in: its own, which differs from the other side's across two folders. */
export function folderOfSide(resolved: ResolvedComparison, analysis: SideAnalysis) {
    return resolved[analysis.side].requested.folder
}

function folderIdOf(resolved: ResolvedComparison, analysis: SideAnalysis): string {
    return folderOfSide(resolved, analysis).folderId
}

/** What the queue answered for one side: its job, nothing to wait for, or why it was refused. */
export function queuedAnalysis(analysis: SideAnalysis, result: EnqueueResult): SideAnalysis {
    switch (result.status) {
        case "queued":
        case "alreadyQueued":
            return { ...analysis, jobId: result.job.id }
        case "alreadyAnalysed":
            return analysis
        case "rejected":
            return { ...analysis, failure: result.problems.map(problem => problem.message).join(" ") }
    }
}

/** Cancelled as soon as one analysis was cancelled; finished once none is queued or running. */
export function batchOutcome(analyses: readonly SideAnalysis[], jobs: readonly AnalysisJob[]): BatchOutcome {
    const states = analyses.map(analysis => stateOf(analysis, jobs))
    if (states.includes("cancelled")) {
        return "cancelled"
    }
    return states.includes("pending") ? "pending" : "finished"
}

/** The analyses with the message of each failed job. */
export function withFailures(analyses: readonly SideAnalysis[], jobs: readonly AnalysisJob[]): SideAnalysis[] {
    return analyses.map(analysis => {
        const job = jobOf(analysis, jobs)
        return job?.state === "failed" ? { ...analysis, failure: job.error?.message ?? "" } : analysis
    })
}

export function pendingJobIds(analyses: readonly SideAnalysis[], jobs: readonly AnalysisJob[]): string[] {
    return analyses.filter(analysis => stateOf(analysis, jobs) === "pending").flatMap(analysis => (analysis.jobId ? [analysis.jobId] : []))
}

function stateOf(analysis: SideAnalysis, jobs: readonly AnalysisJob[]): AnalysisState {
    if (analysis.failure !== null) {
        return "failed"
    }
    if (analysis.jobId === null) {
        return "done"
    }
    const state = jobOf(analysis, jobs)?.state ?? "queued"
    return state === "queued" || state === "running" ? "pending" : state
}

function jobOf(analysis: SideAnalysis, jobs: readonly AnalysisJob[]): AnalysisJob | undefined {
    return jobs.find(job => job.id === analysis.jobId)
}
