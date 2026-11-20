import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { AnalysedCommitMarker } from "../../gitHistory/facade"
import { progressPercent } from "./analysisWording"

const IMPORTED_NOTE = "imported map, analysis time unknown"
const MILLISECONDS_PER_SECOND = 1000

export interface CommitMarkerSources {
    /** The snapshots of one folder. */
    snapshots: readonly SnapshotSummary[]
    /** The jobs of the same folder. */
    jobs: readonly AnalysisJob[]
    shownSnapshotId: string | null
}

/**
 * Design S10: what the History's Analysis column says per commit. A queued, running or failed job of a commit wins over
 * its snapshot; a commit-bound import counts as analysed with its time unknown; unbound imports and working-tree
 * analyses mark no commit.
 */
export function commitMarkersOf({ snapshots, jobs, shownSnapshotId }: CommitMarkerSources): ReadonlyMap<string, AnalysedCommitMarker> {
    const markers = new Map<string, AnalysedCommitMarker>()
    for (const snapshot of preferredSnapshotPerCommit(snapshots, shownSnapshotId).values()) {
        markers.set(snapshot.commit as string, snapshotMarkerOf(snapshot, shownSnapshotId))
    }
    for (const [sha, job] of latestJobPerCommit(jobs)) {
        const jobMarker = jobMarkerOf(job, markers.get(sha)?.isLoadedInMap ?? false)
        if (jobMarker) {
            markers.set(sha, jobMarker)
        }
    }
    return markers
}

function preferredSnapshotPerCommit(snapshots: readonly SnapshotSummary[], shownSnapshotId: string | null): Map<string, SnapshotSummary> {
    const preferred = new Map<string, SnapshotSummary>()
    for (const snapshot of snapshots.filter(marksItsCommit)) {
        const sha = snapshot.commit as string
        const known = preferred.get(sha)
        if (!known || rankOf(snapshot, shownSnapshotId) > rankOf(known, shownSnapshotId)) {
            preferred.set(sha, snapshot)
        }
    }
    return preferred
}

function marksItsCommit(snapshot: SnapshotSummary): boolean {
    return snapshot.commit !== null && (snapshot.target === "commit" || snapshot.source === "imported")
}

/** The shown snapshot first, then an analysis over an import, then the newest. */
function rankOf(snapshot: SnapshotSummary, shownSnapshotId: string | null): string {
    const isShown = snapshot.ref.snapshotId === shownSnapshotId ? "1" : "0"
    const isAnalysed = snapshot.source === "analysed" ? "1" : "0"
    return `${isShown}${isAnalysed}${snapshot.finishedAt ?? snapshot.createdAt}`
}

function snapshotMarkerOf(snapshot: SnapshotSummary, shownSnapshotId: string | null): AnalysedCommitMarker {
    const isImported = snapshot.source === "imported"
    return {
        state: "analysed",
        isLoadedInMap: snapshot.ref.snapshotId === shownSnapshotId,
        analysedAt: isImported || !snapshot.finishedAt ? null : Date.parse(snapshot.finishedAt) / MILLISECONDS_PER_SECOND,
        note: isImported ? IMPORTED_NOTE : null
    }
}

function latestJobPerCommit(jobs: readonly AnalysisJob[]): Map<string, AnalysisJob> {
    const latest = new Map<string, AnalysisJob>()
    for (const job of jobs) {
        if (job.target.kind !== "commit") {
            continue
        }
        const known = latest.get(job.target.sha)
        if (!known || job.queuedAt >= known.queuedAt) {
            latest.set(job.target.sha, job)
        }
    }
    return latest
}

/** Nothing for a job that is done or was cancelled: the snapshot, if any, speaks for the commit then. */
function jobMarkerOf(job: AnalysisJob, isLoadedInMap: boolean): AnalysedCommitMarker | null {
    switch (job.state) {
        case "queued":
            return { state: "queued", isLoadedInMap }
        case "running":
            return { state: "running", isLoadedInMap, progressPercent: progressPercent(job.progress) }
        case "failed":
            return { state: "failed", isLoadedInMap, failureMessage: job.error?.message ?? null }
        default:
            return null
    }
}
