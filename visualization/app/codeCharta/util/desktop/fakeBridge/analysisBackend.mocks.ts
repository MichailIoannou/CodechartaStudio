import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { BatchSelection } from "../../../model/coreApi/BatchSelection"
import type { JobError } from "../../../model/coreApi/JobError"
import type { JobProgress } from "../../../model/coreApi/JobProgress"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeAnalysisBackend(kit: FakeBridgeKit): FakeBackend {
    const MAX_BATCH_JOBS = 200
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

    function newJob(params: FakeRequestParams, target: AnalysisTarget, batchId: string | null): AnalysisJob {
        return {
            id: nextId("job"),
            batchId,
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
        const job = queueJob(params, target, null)
        return succeed({ status: "queued", job: copyOf(job) })
    }

    function queueJob(params: FakeRequestParams, target: AnalysisTarget, batchId: string | null) {
        const job = newJob(params, target, batchId)
        store.jobs.push(job)
        announceJob("analysis.queued", job)
        return job
    }

    function isAnalysedCommit(snapshot: SnapshotSummary) {
        return snapshot.source === "analysed" && snapshot.target === "commit"
    }

    function batchShasOf(params: FakeRequestParams, selection: BatchSelection) {
        const repository = store.git[params.folderId ?? ""]
        if (selection.kind === "commits") {
            return selection.shas
        }
        if (selection.kind === "tags") {
            return [...new Set((repository?.refs?.tags ?? []).map(tag => tag.commit))]
        }
        const commits = (repository?.commits ?? []).map(commit => commit.sha)
        const tipIndex = commits.indexOf(selection.tipSha)
        return tipIndex === -1 ? [] : commits.slice(tipIndex, tipIndex + selection.count)
    }

    function estimatedDurationOf(analysed: SnapshotSummary[], count: number) {
        const durations = analysed.map(snapshot => snapshot.durationMs).filter(duration => duration !== null)
        const averageMs = durations.length > 0 ? durations.reduce((total, duration) => total + duration, 0) / durations.length : null
        return averageMs === null ? null : Math.round(averageMs * count)
    }

    function enqueueBatch(params: FakeRequestParams) {
        const selection = params.selection as BatchSelection
        const count = selection.kind === "lastCommits" ? selection.count : 1
        if (count < 1 || count > MAX_BATCH_JOBS) {
            return refuse("BAD_REQUEST", `A batch holds 1 to ${MAX_BATCH_JOBS} commits.`)
        }
        const analysed = kit.snapshots.snapshotsOf(params.projectId ?? "", params.folderId).filter(isAnalysedCommit)
        const analysedShas = new Set(analysed.map(snapshot => snapshot.commit))
        const shas = batchShasOf(params, selection)
        const notAnalysed = shas.filter(sha => !analysedShas.has(sha))
        const toAnalyse = notAnalysed.slice(0, MAX_BATCH_JOBS)
        const batchId = params.dryRun || toAnalyse.length === 0 ? null : nextId("batch")
        const jobs = batchId ? toAnalyse.map(sha => queueJob(params, { kind: "commit", sha }, batchId)) : []
        return succeed({
            batchId,
            toAnalyse,
            alreadyAnalysed: shas.filter(sha => analysedShas.has(sha)),
            leftOut: Math.max(0, notAnalysed.length - MAX_BATCH_JOBS),
            jobs: copyOf(jobs),
            estimatedDurationMs: estimatedDurationOf(analysed, toAnalyse.length),
            problems: []
        })
    }

    function cancelBatch(params: FakeRequestParams) {
        const jobs = store.jobs.filter(job => job.batchId === params.batchId)
        if (jobs.length === 0) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no batch ${String(params.batchId)}.`)
        }
        for (const job of jobs.filter(isPending)) {
            Object.assign(job, { state: "cancelled", finishedAt: now })
            announceJob("analysis.cancelled", job)
        }
        return succeed(null)
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
        "analysis.enqueueBatch": enqueueBatch,
        "analysis.cancelBatch": cancelBatch,
        "analysis.list": listJobs,
        "analysis.clearFinished": clearFinishedAnalyses,
        "analysis.readLog": readFailedLog
    }
}
