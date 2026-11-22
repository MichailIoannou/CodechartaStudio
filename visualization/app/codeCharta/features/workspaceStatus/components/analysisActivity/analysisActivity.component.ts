import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core"
import type { AnalysisJob } from "../../../../model/coreApi/AnalysisJob"
import { counted, durationText, ProjectsFacade } from "../../../projects/facade"
import {
    AnalysisJobsService,
    isPendingJob,
    jobDurationMs,
    PreflightProblemsComponent,
    progressPercent,
    SnapshotViewService,
    targetLabel
} from "../../../snapshots/facade"

interface ActivityRow {
    job: AnalysisJob
    label: string
    isCommit: boolean
    otherFolderLabel: string | null
    percent: number | null
    duration: string | null
}

interface BatchGroup {
    batchId: string
    sentence: string
    isPending: boolean
    isExpanded: boolean
    rows: ActivityRow[]
    runningRows: ActivityRow[]
}

/** One line of the activity: a job on its own, or a batch with its jobs. */
interface ActivityEntry {
    key: string
    row: ActivityRow | null
    group: BatchGroup | null
}

@Component({
    selector: "cc-analysis-activity",
    templateUrl: "./analysisActivity.component.html",
    imports: [NgTemplateOutlet, PreflightProblemsComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalysisActivityComponent {
    private readonly projects = inject(ProjectsFacade)
    private readonly jobsService = inject(AnalysisJobsService)
    private readonly view = inject(SnapshotViewService)

    readonly jobs = input.required<AnalysisJob[]>()
    readonly logRequested = output<AnalysisJob>()

    readonly problems = computed(() => {
        const rejected = this.view.rejectedRun()
        return rejected?.surface === "status" ? rejected.problems : null
    })
    readonly expandedBatches = signal<ReadonlySet<string>>(new Set())
    readonly entries = computed(() => this.entriesOf(this.jobs().map(job => this.rowOf(job))))
    readonly hasFinished = computed(() => this.jobs().some(job => !isPendingJob(job)))

    cancel(job: AnalysisJob) {
        void this.jobsService.cancel(job.id).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    open(job: AnalysisJob) {
        if (job.snapshotId) {
            void this.view.open({ projectId: job.projectId, folderId: job.folderId, snapshotId: job.snapshotId })
        }
    }

    retry(job: AnalysisJob) {
        void this.view.retry(job)
    }

    cancelBatch(batchId: string) {
        void this.jobsService.cancelBatch(batchId).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    toggleBatch(batchId: string) {
        this.expandedBatches.update(expanded => {
            const next = new Set(expanded)
            if (!next.delete(batchId)) {
                next.add(batchId)
            }
            return next
        })
    }

    clearFinished() {
        void this.jobsService.clearFinished().catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    /** Jobs in queue order; the jobs of a batch gather at the place of its first job. */
    private entriesOf(rows: ActivityRow[]): ActivityEntry[] {
        const rowsByBatch = new Map<string, ActivityRow[]>()
        const entries: ActivityEntry[] = []
        for (const row of rows) {
            const { batchId } = row.job
            if (!batchId) {
                entries.push({ key: row.job.id, row, group: null })
            } else if (rowsByBatch.has(batchId)) {
                rowsByBatch.get(batchId)?.push(row)
            } else {
                rowsByBatch.set(batchId, [row])
                entries.push({ key: batchId, row: null, group: null })
            }
        }
        return entries.map(entry => (entry.row ? entry : { ...entry, group: this.groupOf(entry.key, rowsByBatch.get(entry.key) ?? []) }))
    }

    private groupOf(batchId: string, rows: ActivityRow[]): BatchGroup {
        const label = this.jobsService.batchLabelOf(batchId) ?? counted(rows.length, "commit")
        const doneCount = rows.filter(row => row.job.state === "done").length
        return {
            batchId,
            sentence: `Batch: ${label} (${doneCount} of ${rows.length} done)`,
            isPending: rows.some(row => isPendingJob(row.job)),
            isExpanded: this.expandedBatches().has(batchId),
            rows,
            runningRows: rows.filter(row => row.job.state === "running")
        }
    }

    private rowOf(job: AnalysisJob): ActivityRow {
        const folderLabel = this.projects.activeProject()?.folders.find(folder => folder.id === job.folderId)?.label ?? ""
        const durationMs = jobDurationMs(job)
        return {
            job,
            label: targetLabel(job.target),
            isCommit: job.target.kind === "commit",
            otherFolderLabel: job.folderId === this.projects.workingFolder()?.id ? null : folderLabel,
            percent: progressPercent(job.progress),
            duration: durationMs === null ? null : durationText(durationMs)
        }
    }
}
