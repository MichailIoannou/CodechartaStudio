import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    inject,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import type { BatchResult } from "../../../../model/coreApi/BatchResult"
import type { BatchSelection } from "../../../../model/coreApi/BatchSelection"
import type { GitLocalBranch } from "../../../../model/coreApi/GitLocalBranch"
import type { PreflightProblem } from "../../../../model/coreApi/PreflightProblem"
import { counted, shortSha } from "../../../../util/wording"
import { GitRepositoryService } from "../../../gitHistory/facade"
import { ProjectsFacade } from "../../../projects/facade"
import { AnalysisJobsService } from "../../services/analysisJobs.service"
import { BatchAnalysisDialogService, BatchDialogRequest } from "../../services/batchAnalysisDialog.service"
import { SnapshotsDialogService } from "../../services/snapshotsDialog.service"
import { batchLabel, batchSummary, estimateText, leftOutText, MAX_BATCH_COMMITS } from "../../util/batchWording"
import { PreflightProblemsComponent } from "../preflightProblems/preflightProblems.component"

type BatchMode = "lastCommits" | "tags"

type PreviewState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; result: BatchResult } | { kind: "failed"; message: string }

const DEFAULT_COUNT = 20
const PREVIEW_DELAY_MS = 300

@Component({
    selector: "cc-batch-analysis-dialog",
    templateUrl: "./batchAnalysisDialog.component.html",
    imports: [PreflightProblemsComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchAnalysisDialogComponent implements AfterViewInit {
    private readonly dialogService = inject(BatchAnalysisDialogService)
    private readonly snapshotsDialog = inject(SnapshotsDialogService)
    private readonly jobs = inject(AnalysisJobsService)
    private readonly gitRepository = inject(GitRepositoryService)
    private readonly projects = inject(ProjectsFacade)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private previewTimer: ReturnType<typeof setTimeout> | undefined
    private latestTicket = 0

    readonly maxCommits = MAX_BATCH_COMMITS
    readonly request = computed<BatchDialogRequest>(
        () => this.dialogService.current() ?? { folder: { projectId: "", folderId: "" }, folderLabel: "", tipSha: null }
    )
    readonly mode = signal<BatchMode>("lastCommits")
    readonly count = signal(DEFAULT_COUNT)
    readonly firstParentOnly = signal(true)
    readonly chosenBranch = signal<string | null>(null)
    readonly isStarting = signal(false)
    readonly startProblems = signal<PreflightProblem[] | null>(null)
    readonly preview = signal<PreviewState>({ kind: "idle" })

    readonly branches = computed(() => this.branchesOfFolder())
    readonly branch = computed(() => this.chosenBranchOrCurrent())
    readonly tipSha = computed(() => this.request().tipSha ?? this.branch()?.commit ?? this.headCommit())
    readonly shortTip = computed(() => {
        const tip = this.tipSha()
        return tip ? shortSha(tip) : ""
    })
    readonly countError = computed(() => this.countErrorOf(this.count()))
    readonly selection = computed(() => this.selectionOfInputs())
    readonly result = computed(() => {
        const preview = this.preview()
        return preview.kind === "ready" ? preview.result : null
    })
    readonly previewFailure = computed(() => {
        const preview = this.preview()
        return preview.kind === "failed" ? preview.message : null
    })
    readonly problems = computed(() => this.startProblems() ?? this.previewProblems())
    readonly isBlocked = computed(() => (this.problems() ?? []).some(problem => problem.severity === "error"))
    readonly summary = computed(() => {
        const result = this.result()
        const selection = this.selection()
        return result && selection && !this.isBlocked() ? batchSummary(result, selection) : null
    })
    readonly estimate = computed(() => {
        const result = this.result()
        return result && result.toAnalyse.length > 0 ? estimateText(result.estimatedDurationMs) : null
    })
    readonly leftOut = computed(() => leftOutText(this.result()?.leftOut ?? 0))
    readonly isNothingToAnalyse = computed(() => this.summary() !== null && this.result()?.toAnalyse.length === 0)
    readonly canStart = computed(() => (this.result()?.toAnalyse.length ?? 0) > 0 && !this.isBlocked() && !this.isStarting())
    readonly startLabel = computed(() => {
        const result = this.result()
        return result && result.toAnalyse.length > 0 ? `Analyse ${counted(result.toAnalyse.length, "commit")}` : "Analyse"
    })

    constructor() {
        effect(() => {
            const selection = this.selection()
            untracked(() => this.schedulePreview(selection))
        })
        inject(DestroyRef).onDestroy(() => clearTimeout(this.previewTimer))
    }

    ngAfterViewInit() {
        const dialog = this.dialog().nativeElement
        dialog.addEventListener("close", () => this.dialogService.hide())
        dialog.showModal()
        void this.gitRepository.refreshFolders([this.request().folder])
    }

    close() {
        this.dialog().nativeElement.close()
    }

    setCount(event: Event) {
        this.count.set((event.target as HTMLInputElement).valueAsNumber)
    }

    async start() {
        const selection = this.selection()
        if (!selection) {
            return
        }
        this.isStarting.set(true)
        try {
            const result = await this.jobs.startBatch(this.request().folder, selection, batchLabel(selection, this.branchNameOf(selection)))
            this.finishStart(result)
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        } finally {
            this.isStarting.set(false)
        }
    }

    private finishStart(result: BatchResult) {
        if (!result.batchId) {
            this.startProblems.set(result.problems)
            return
        }
        this.close()
        this.snapshotsDialog.hide()
        this.dialogService.announceStarted(result.batchId)
    }

    private schedulePreview(selection: BatchSelection | null) {
        clearTimeout(this.previewTimer)
        this.startProblems.set(null)
        const ticket = ++this.latestTicket
        if (!selection) {
            this.preview.set({ kind: "idle" })
            return
        }
        this.preview.set({ kind: "loading" })
        this.previewTimer = setTimeout(() => void this.loadPreview(selection, ticket), PREVIEW_DELAY_MS)
    }

    private async loadPreview(selection: BatchSelection, ticket: number) {
        try {
            const result = await this.jobs.previewBatch(this.request().folder, selection)
            this.applyPreview(ticket, { kind: "ready", result })
        } catch (error) {
            this.applyPreview(ticket, { kind: "failed", message: (error as Error).message })
        }
    }

    private applyPreview(ticket: number, state: PreviewState) {
        if (ticket === this.latestTicket) {
            this.preview.set(state)
        }
    }

    private previewProblems(): PreflightProblem[] | null {
        const problems = this.result()?.problems ?? []
        return problems.length > 0 ? problems : null
    }

    private selectionOfInputs(): BatchSelection | null {
        if (this.mode() === "tags") {
            return { kind: "tags" }
        }
        const tipSha = this.tipSha()
        if (this.countError() || !tipSha) {
            return null
        }
        return { kind: "lastCommits", tipSha, count: this.count(), firstParentOnly: this.firstParentOnly() }
    }

    private countErrorOf(count: number): string | null {
        if (this.mode() !== "lastCommits" || (Number.isInteger(count) && count >= 1 && count <= MAX_BATCH_COMMITS)) {
            return null
        }
        return count > MAX_BATCH_COMMITS
            ? `At most ${MAX_BATCH_COMMITS} commits per batch.`
            : `Enter a number from 1 to ${MAX_BATCH_COMMITS}.`
    }

    /** The History knows the branches of the working folder only; another folder counts back from its HEAD. */
    private branchesOfFolder(): GitLocalBranch[] {
        const refs = this.gitRepository.refs()
        const active = this.gitRepository.activeRepository()
        const isWorkingFolder = active?.projectId === this.request().folder.projectId && active.folderId === this.request().folder.folderId
        return isWorkingFolder && refs.kind === "ready" && !this.request().tipSha ? refs.value.localBranches : []
    }

    private chosenBranchOrCurrent(): GitLocalBranch | null {
        const branches = this.branches()
        return branches.find(branch => branch.refName === this.chosenBranch()) ?? branches.find(branch => branch.isCurrent) ?? null
    }

    private headCommit(): string | null {
        return this.gitRepository.headCommitOf(this.request().folder)
    }

    private branchNameOf(selection: BatchSelection): string | null {
        return selection.kind === "lastCommits" && selection.tipSha === this.branch()?.commit ? (this.branch()?.name ?? null) : null
    }
}
