import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { NavigationEnd, Router } from "@angular/router"
import { filter, map } from "rxjs"
import { projectRouteLink } from "../../../../routing/projectRoute"
import { viewIdForLink } from "../../../../routing/routePaths"
import { ProjectsFacade } from "../../../projects/facade"
import { AnalysisJobsService } from "../../services/analysisJobs.service"
import { SnapshotViewService } from "../../services/snapshotView.service"
import { AnalysisLogDialogComponent } from "../analysisLogDialog/analysisLogDialog.component"
import { PreflightProblemsComponent } from "../preflightProblems/preflightProblems.component"

const TONE_ICONS = { info: "fa-circle-info", warning: "fa-triangle-exclamation", error: "fa-circle-xmark" } as const

/** The stale notice: a persistent toast, first in the toast stack, shown over the map views only. */
@Component({
    selector: "cc-snapshot-notice",
    templateUrl: "./snapshotNotice.component.html",
    imports: [AnalysisLogDialogComponent, PreflightProblemsComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SnapshotNoticeComponent {
    private readonly view = inject(SnapshotViewService)
    private readonly jobs = inject(AnalysisJobsService)
    private readonly projects = inject(ProjectsFacade)
    private readonly router = inject(Router)
    private readonly logDialog = viewChild.required(AnalysisLogDialogComponent)
    private readonly url = toSignal(
        this.router.events.pipe(
            filter(event => event instanceof NavigationEnd),
            map(event => event.urlAfterRedirects)
        ),
        { initialValue: this.router.url }
    )

    readonly isOverMap = computed(() => isMapView(this.url()))
    readonly problems = computed(() => {
        const rejected = this.view.rejectedRun()
        return rejected?.surface === "notice" ? rejected.problems : null
    })
    readonly notice = computed(() => (this.isOverMap() ? this.view.notice() : null))
    readonly tone = computed(() => (this.problems() ? "error" : (this.notice()?.tone ?? "info")))
    readonly icon = computed(() => TONE_ICONS[this.tone()])
    readonly job = this.view.targetJob

    analyse() {
        void this.view.analyseTarget("notice")
    }

    cancel() {
        const job = this.job()
        if (job) {
            void this.jobs.cancel(job.id).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
        }
    }

    retry() {
        const job = this.job()
        if (job) {
            void this.view.retry(job, "notice")
        }
    }

    showLog() {
        const job = this.job()
        if (job) {
            void this.logDialog().open({ kind: "job", job, folderLabel: this.projects.workingFolder()?.label ?? "" })
        }
    }

    dismiss() {
        this.view.dismissProblems()
        this.view.dismissNotice()
    }
}

function isMapView(url: string): boolean {
    const path = url.split("?")[0]
    return path !== projectRouteLink && viewIdForLink(path) !== "history"
}
