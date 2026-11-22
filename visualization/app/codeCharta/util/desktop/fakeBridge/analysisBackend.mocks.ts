import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { JobError } from "../../../model/coreApi/JobError"
import type { JobProgress } from "../../../model/coreApi/JobProgress"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeAnalysisBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, nextId, now, emit, seed } = kit
    Object.assign(store, { jobs: JSON.parse(JSON.stringify(seed.analysisJobs ?? [])), failedJobLogs: { ...seed.failedJobLogs } })

    function findJob(jobId: string) {
        return store.jobs.find(job => job.id === jobId)
    }

    function isPending(job: AnalysisJob) {
        return job.state === "queued" || job.state === "running"
    }

    function jobKeyOf(job: { projectId: string; folderId: string; target: AnalysisTarget }) {
        return `${job.projectId}/${job.folderId}/${job.target.kind === "commit" ? job.target.sha : "workingTree"}`
    }

    function copyOf<Value>(value: Value): Value {
        return JSON.parse(JSON.stringify(value))
    }

    function announceJob(event: string, job: AnalysisJob) {
        emit(event, { job: copyOf(job) })
    }

    function newJob(params: FakeRequestParams, target: AnalysisTarget): AnalysisJob {
        return {
            id: nextId("job"),
            batchId: null,
            projectId: params.projectId ?? "",
            folderId: params.folderId ?? "",
            target,
            profileHash: "0123456789abcdef",
            state: "queued",
            progress: { mode: "indeterminate" },
            queuedAt: now,
            startedAt: null,
            finishedAt: null,
            snapshotId: null,
            error: null
        }
    }

    function enqueueAnalysis(params: FakeRequestParams) {
        const target = params.target as AnalysisTarget
        const key = jobKeyOf({ projectId: params.projectId ?? "", folderId: params.folderId ?? "", target })
        const queued = store.jobs.find(candidate => isPending(candidate) && jobKeyOf(candidate) === key)
        if (queued) {
            return succeed({ status: "alreadyQueued", job: copyOf(queued) })
        }
        const job = newJob(params, target)
        store.jobs.push(job)
        announceJob("analysis.queued", job)
        return succeed({ status: "queued", job: copyOf(job) })
    }

    function cancelAnalysis(params: FakeRequestParams) {
        const job = findJob(params.jobId ?? "")
        if (!job) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no job ${String(params.jobId)}.`)
        }
        if (isPending(job)) {
            Object.assign(job, { state: "cancelled", finishedAt: now })
            announceJob("analysis.cancelled", job)
        }
        return succeed(null)
    }

    function clearFinishedAnalyses() {
        for (const job of store.jobs.filter(candidate => !isPending(candidate))) {
            delete store.failedJobLogs[job.id]
        }
        store.jobs = store.jobs.filter(isPending)
        return succeed(null)
    }

    function readFailedLog(params: FakeRequestParams) {
        const jobId = params.jobId ?? ""
        const isFailed = findJob(jobId)?.state === "failed"
        return isFailed && Object.hasOwn(store.failedJobLogs, jobId)
            ? succeed({ log: store.failedJobLogs[jobId] })
            : refuse("NOT_FOUND", `There is no failed analysis ${jobId}.`)
    }

    function listJobs() {
        return succeed({ jobs: copyOf(store.jobs) })
    }

    function preflight() {
        return succeed({ ok: true, problems: [] })
    }

    function analysedSnapshot(job: AnalysisJob): SnapshotSummary {
        const commit = job.target.kind === "commit" ? job.target.sha : null
        const snapshotId = commit ? `${commit}-01234567` : "worktree-20260101T000000000Z-01234567"
        return {
            ref: { projectId: job.projectId, folderId: job.folderId, snapshotId },
            source: "analysed",
            createdAt: now,
            commit,
            shortCommit: commit?.slice(0, 7) ?? null,
            subject: null,
            commitDate: null,
            dirty: commit === null,
            originalFileName: null,
            fileModifiedAt: null,
            mapBytes: 100,
            checksum: null,
            profileHash: job.profileHash,
            target: job.target.kind,
            finishedAt: now,
            durationMs: 1000,
            notInMap: []
        }
    }

    function startJob(jobId: string) {
        const job = findJob(jobId)
        if (job) {
            Object.assign(job, { state: "running", startedAt: now })
            announceJob("analysis.started", job)
        }
    }

    function reportProgress(jobId: string, progress: JobProgress) {
        const job = findJob(jobId)
        if (job) {
            job.progress = progress
            emit("analysis.progress", { jobId, progress })
        }
    }

    function completeJob(jobId: string, snapshot?: SnapshotSummary) {
        const job = findJob(jobId)
        if (!job) {
            return
        }
        const summary = copyOf(snapshot ?? analysedSnapshot(job))
        store.snapshots.push(summary)
        kit.resolutions.forget(job.folderId, job.target)
        Object.assign(job, { state: "done", finishedAt: now, snapshotId: summary.ref.snapshotId })
        announceJob("analysis.finished", job)
        emit("snapshots.changed", { projectId: job.projectId, folderId: job.folderId })
    }

    function failJob(jobId: string, error: JobError, log?: string) {
        const job = findJob(jobId)
        if (job) {
            Object.assign(job, { state: "failed", finishedAt: now, error })
            store.failedJobLogs[jobId] = log ?? error.message
            announceJob("analysis.failed", job)
        }
    }

    Object.assign(kit.controls, { startJob, reportProgress, completeJob, failJob })

    return {
        "analysis.preflight": preflight,
        "analysis.enqueue": enqueueAnalysis,
        "analysis.cancel": cancelAnalysis,
        "analysis.list": listJobs,
        "analysis.clearFinished": clearFinishedAnalyses,
        "analysis.readLog": readFailedLog
    }
}
