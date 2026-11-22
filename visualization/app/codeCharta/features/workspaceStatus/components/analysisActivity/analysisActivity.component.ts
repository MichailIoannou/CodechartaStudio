import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core"
import type { AnalysisJob } from "../../../../model/coreApi/AnalysisJob"
import { durationText, ProjectsFacade } from "../../../projects/facade"
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
    readonly rows = computed(() => this.jobs().map(job => this.rowOf(job)))
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

    clearFinished() {
        void this.jobsService.clearFinished().catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
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
