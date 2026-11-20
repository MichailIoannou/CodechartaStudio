import { DestroyRef, effect, Injectable, inject, signal, untracked } from "@angular/core"
import { Subject } from "rxjs"
import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { BatchResult } from "../../../model/coreApi/BatchResult"
import type { BatchSelection } from "../../../model/coreApi/BatchSelection"
import type { EnqueueResult } from "../../../model/coreApi/EnqueueResult"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { DesktopBridge } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { valueOrThrow } from "../../../util/desktop/desktopResult"

const JOB_EVENTS = ["analysis.queued", "analysis.started", "analysis.finished", "analysis.failed", "analysis.cancelled"] as const
const OUTCOME_EVENTS: ReadonlySet<string> = new Set(["analysis.finished", "analysis.failed"])

/** The core's analysis queue as the app sees it; every bridge callback ends in a signal update. */
@Injectable({ providedIn: "root" })
export class AnalysisJobsService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly jobList = signal<AnalysisJob[]>([])
    private readonly finishedJobs = new Subject<AnalysisJob>()
    private readonly batchLabels = signal<Readonly<Record<string, string>>>({})

    readonly jobs = this.jobList.asReadonly()
    /** Jobs that just finished or failed, once each, as the core reported them. */
    readonly outcomes$ = this.finishedJobs.asObservable()

    constructor() {
        const destroyRef = inject(DestroyRef)
        if (!this.environment.isDesktop()) {
            return
        }
        const bridge = this.bridge
        const unsubscribers = [
            ...JOB_EVENTS.map(event => bridge.subscribe(event, ({ job }) => this.applyJob(job, OUTCOME_EVENTS.has(event)))),
            bridge.subscribe("analysis.progress", ({ jobId, progress }) => this.updateJob(jobId, job => ({ ...job, progress })))
        ]
        destroyRef.onDestroy(() => {
            for (const unsubscribe of unsubscribers) {
                unsubscribe()
            }
        })
        effect(() => {
            if (this.environment.coreState().state === "ready") {
                untracked(() => void this.reload().catch(() => undefined))
            }
        })
    }

    async reload(): Promise<void> {
        const { jobs } = valueOrThrow(await this.bridge.request("analysis.list", {}))
        this.jobList.set(jobs)
    }

    async enqueue(folder: FolderRef, target: AnalysisTarget, force = false): Promise<EnqueueResult> {
        const result = valueOrThrow(await this.bridge.request("analysis.enqueue", { ...folder, target, force }))
        if (result.status === "queued" || result.status === "alreadyQueued") {
            this.applyJob(result.job, false)
        }
        return result
    }

    /** What a batch would queue, with its estimate; queues nothing. */
    async previewBatch(folder: FolderRef, selection: BatchSelection): Promise<BatchResult> {
        return valueOrThrow(await this.bridge.request("analysis.enqueueBatch", { ...folder, selection, dryRun: true }))
    }

    async startBatch(folder: FolderRef, selection: BatchSelection, label: string): Promise<BatchResult> {
        const result = valueOrThrow(await this.bridge.request("analysis.enqueueBatch", { ...folder, selection, dryRun: false }))
        const { batchId } = result
        if (batchId) {
            this.batchLabels.update(labels => ({ ...labels, [batchId]: label }))
        }
        for (const job of result.jobs) {
            this.applyJob(job, false)
        }
        return result
    }

    async cancelBatch(batchId: string): Promise<void> {
        valueOrThrow(await this.bridge.request("analysis.cancelBatch", { batchId }))
    }

    /** How the batch was described when this window started it, e.g. "last 20 commits of main". */
    batchLabelOf(batchId: string): string | null {
        return this.batchLabels()[batchId] ?? null
    }

    async cancel(jobId: string): Promise<void> {
        valueOrThrow(await this.bridge.request("analysis.cancel", { jobId }))
    }

    async clearFinished(): Promise<void> {
        valueOrThrow(await this.bridge.request("analysis.clearFinished", {}))
        await this.reload()
    }

    async readLog(jobId: string): Promise<string> {
        return valueOrThrow(await this.bridge.request("analysis.readLog", { jobId })).log
    }

    private applyJob(job: AnalysisJob, isOutcome: boolean) {
        const isKnown = this.jobList().some(candidate => candidate.id === job.id)
        this.jobList.update(jobs => (isKnown ? jobs.map(candidate => (candidate.id === job.id ? job : candidate)) : [...jobs, job]))
        if (isOutcome) {
            this.finishedJobs.next(job)
        }
    }

    private updateJob(jobId: string, change: (job: AnalysisJob) => AnalysisJob) {
        this.jobList.update(jobs => jobs.map(job => (job.id === jobId ? change(job) : job)))
    }

    private get bridge(): DesktopBridge {
        return this.environment.requireBridge()
    }
}
