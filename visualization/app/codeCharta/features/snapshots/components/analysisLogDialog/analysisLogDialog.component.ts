import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from "@angular/core"
import type { AnalysisJob } from "../../../../model/coreApi/AnalysisJob"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { AnalysisJobsService } from "../../services/analysisJobs.service"
import { SnapshotCatalogService } from "../../services/snapshotCatalog.service"
import { snapshotCommitLabel, targetLabel } from "../../util/analysisWording"

const COPIED_FEEDBACK_MS = 2000

/** The log of a failed job, or of the analysis that wrote a snapshot. */
export type AnalysisLogSource =
    | { kind: "job"; job: AnalysisJob; folderLabel: string }
    | { kind: "snapshot"; snapshot: SnapshotSummary; folderLabel: string }

type LogState = { kind: "loading" } | { kind: "loaded"; log: string } | { kind: "unreadable"; message: string }

@Component({
    selector: "cc-analysis-log-dialog",
    templateUrl: "./analysisLogDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalysisLogDialogComponent {
    private readonly jobs = inject(AnalysisJobsService)
    private readonly catalog = inject(SnapshotCatalogService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private copiedTimer: ReturnType<typeof setTimeout> | undefined

    readonly title = signal("")
    readonly state = signal<LogState>({ kind: "loading" })
    readonly isCopied = signal(false)
    readonly log = computed(() => {
        const state = this.state()
        return state.kind === "loaded" ? state.log : null
    })
    readonly failureMessage = computed(() => {
        const state = this.state()
        return state.kind === "unreadable" ? state.message : null
    })

    constructor() {
        inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer))
    }

    async open(source: AnalysisLogSource) {
        this.title.set(`Analysis Log — ${source.folderLabel} ${labelOf(source)}`)
        this.state.set({ kind: "loading" })
        this.isCopied.set(false)
        this.dialog().nativeElement.showModal()
        try {
            this.state.set({ kind: "loaded", log: await this.readLog(source) })
        } catch (error) {
            this.state.set({ kind: "unreadable", message: (error as Error).message })
        }
    }

    close() {
        this.dialog().nativeElement.close()
    }

    async copyLog() {
        const log = this.log()
        if (log === null) {
            return
        }
        await navigator.clipboard.writeText(log)
        this.isCopied.set(true)
        clearTimeout(this.copiedTimer)
        this.copiedTimer = setTimeout(() => this.isCopied.set(false), COPIED_FEEDBACK_MS)
    }

    private readLog(source: AnalysisLogSource): Promise<string> {
        return source.kind === "job" ? this.jobs.readLog(source.job.id) : this.catalog.readLog(source.snapshot.ref)
    }
}

function labelOf(source: AnalysisLogSource): string {
    return source.kind === "job" ? targetLabel(source.job.target) : snapshotCommitLabel(source.snapshot)
}
