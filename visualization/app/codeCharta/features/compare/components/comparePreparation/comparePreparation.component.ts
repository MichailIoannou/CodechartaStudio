import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    Injector,
    inject,
    output,
    viewChild
} from "@angular/core"
import type { AnalysisJob, ResolvedComparison, ResolvedSide, SideAnalysis } from "../../model/compare.model"
import { ANALYSIS_GATEWAY } from "../../ports/compareGateways"
import { CompareService } from "../../services/compare.service"
import { analysisFailureText, sideCaption, sideStatusText, useNearestRefusal } from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"

interface PreparationRow {
    caption: string
    shortCommit: string
    label: string | null
    tone: "exact" | "nearest" | "missing"
    status: string
    failure: string | null
}

interface AnalysisRow {
    caption: string
    shortCommit: string
    isRunning: boolean
    percent: number | null
}

interface Decision {
    rows: PreparationRow[]
    profilesDiffer: boolean
    sizeVerdict: ResolvedComparison["preflight"]["sizeVerdict"]
    hasMissingSide: boolean
    useNearestRefusal: string | null
}

/** Design C5: the sides' analyses, the size and profile checks, and the analyses of missing sides while they run. */
@Component({
    selector: "cc-compare-preparation",
    templateUrl: "./comparePreparation.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComparePreparationComponent {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly jobs = inject(ANALYSIS_GATEWAY).jobs
    private readonly injector = inject(Injector)
    private readonly analyseButton = viewChild<ElementRef<HTMLButtonElement>>("analyseButton")

    /** The user chose to go on: the dialog closes once the comparison shows. */
    readonly goingOn = output<void>()

    readonly decision = computed(() => {
        const { phase, resolved, analyses } = this.store.state()
        return phase === "needsDecision" && resolved ? decisionOf(resolved, analyses) : null
    })
    readonly analysisRows = computed(() => {
        const { phase, analyses } = this.store.state()
        return phase === "analysing" ? analyses.map(analysis => analysisRowOf(analysis, this.jobs())) : null
    })

    constructor() {
        afterNextRender(() => this.analyseButton()?.nativeElement.focus(), { injector: this.injector })
    }

    analyseMissing(): void {
        this.goingOn.emit()
        void this.service.analyseMissing()
    }

    continueWithShownSnapshots(): void {
        this.goingOn.emit()
        void this.service.continueWithShownSnapshots()
    }

    cancelAnalyses(): void {
        void this.service.cancelAnalyses()
    }
}

function decisionOf(resolved: ResolvedComparison, analyses: readonly SideAnalysis[]): Decision {
    const { base, head, preflight } = resolved
    return {
        rows: [rowOf("BASE", base, analyses), rowOf("HEAD", head, analyses)],
        profilesDiffer: preflight.profilesDiffer,
        sizeVerdict: preflight.sizeVerdict,
        hasMissingSide: [base, head].some(side => side.status.status === "missing"),
        useNearestRefusal: useNearestRefusal(resolved)
    }
}

function rowOf(caption: string, side: ResolvedSide, analyses: readonly SideAnalysis[]): PreparationRow {
    const { status } = side
    const tone = status.status === "exact" ? "exact" : status.nearest ? "nearest" : "missing"
    const failed = analyses.find(analysis => analysis.commit === side.requested.commit && analysis.failure !== null)
    return {
        caption,
        shortCommit: side.requested.shortCommit,
        label: sideCaption(side.requested),
        tone,
        status: sideStatusText(side),
        failure: failed ? analysisFailureText(failed) : null
    }
}

function analysisRowOf(analysis: SideAnalysis, jobs: readonly AnalysisJob[]): AnalysisRow {
    const job = jobs.find(candidate => candidate.id === analysis.jobId)
    const progress = job?.progress
    return {
        caption: analysis.side.toUpperCase(),
        shortCommit: analysis.shortCommit,
        isRunning: job?.state === "running",
        percent: progress?.mode === "determinate" ? progress.percent : null
    }
}
