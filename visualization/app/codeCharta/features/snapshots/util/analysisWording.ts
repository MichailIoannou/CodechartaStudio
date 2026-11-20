import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { JobProgress } from "../../../model/coreApi/JobProgress"
import type { ProblemCode } from "../../../model/coreApi/ProblemCode"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"

const SHORT_SHA_LENGTH = 7
const SHORT_PROFILE_LENGTH = 4
const TOOL_PROBLEMS: ReadonlySet<ProblemCode> = new Set([
    "CCSH_NOT_FOUND",
    "CCSH_TOO_OLD",
    "JAVA_NOT_FOUND",
    "JAVA_TOO_OLD",
    "GIT_NOT_FOUND"
])

/** The short name of what an analysis maps, as it reads inside a sentence: "a1b2c3d" or "the working tree". */
export function targetName(target: AnalysisTarget): string {
    return target.kind === "commit" ? target.sha.slice(0, SHORT_SHA_LENGTH) : "the working tree"
}

/** The same name as a list label: "a1b2c3d" or "working tree". */
export function targetLabel(target: AnalysisTarget): string {
    return target.kind === "commit" ? targetName(target) : "working tree"
}

export function progressPercent(progress: JobProgress): number | null {
    return progress.mode === "determinate" ? progress.percent : null
}

export function isPendingJob(job: AnalysisJob): boolean {
    return job.state === "queued" || job.state === "running"
}

export function jobDurationMs(job: AnalysisJob): number | null {
    if (!(job.startedAt && job.finishedAt)) {
        return null
    }
    return Date.parse(job.finishedAt) - Date.parse(job.startedAt)
}

export function shortProfile(profileHash: string | null): string {
    return profileHash ? `${profileHash.slice(0, SHORT_PROFILE_LENGTH)}…` : "unknown"
}

export function isToolProblem(code: ProblemCode): boolean {
    return TOOL_PROBLEMS.has(code)
}

export function isUnboundImport(snapshot: SnapshotSummary): boolean {
    return snapshot.source === "imported" && snapshot.commit === null
}

export function snapshotCommitLabel(snapshot: SnapshotSummary): string {
    if (snapshot.target === "workingTree") {
        return snapshot.shortCommit ? `working tree (on ${snapshot.shortCommit})` : "working tree"
    }
    return snapshot.shortCommit ?? snapshot.originalFileName ?? snapshot.ref.snapshotId
}

export function reanalyseTarget(snapshot: SnapshotSummary): AnalysisTarget | null {
    if (snapshot.source !== "analysed") {
        return null
    }
    return snapshot.target === "commit" && snapshot.commit ? { kind: "commit", sha: snapshot.commit } : { kind: "workingTree" }
}
