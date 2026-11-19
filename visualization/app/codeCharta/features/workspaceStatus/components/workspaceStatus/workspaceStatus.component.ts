import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    HostListener,
    inject,
    input,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import type { AnalysisJob } from "../../../../model/coreApi/AnalysisJob"
import type { FolderRef } from "../../../../model/coreApi/FolderRef"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import { DesktopEnvironment } from "../../../../util/desktop/desktopEnvironment.service"
import { shortSha } from "../../../../util/wording"
import { DesktopToolsService } from "../../../desktopTools/facade"
import { GitOperationService, GitRepositoryService, isGitStatus } from "../../../gitHistory/facade"
import { changesSentence, ProjectsFacade, shortDate } from "../../../projects/facade"
import {
    AnalysisJobsService,
    AnalysisLogDialogComponent,
    isPendingJob,
    SnapshotCatalogService,
    SnapshotsDialogService,
    SnapshotViewService,
    targetName
} from "../../../snapshots/facade"
import { gitActivityOf, RecentOutcome, stalenessOf, uncommittedTitle, workspaceTrigger } from "../../util/workspaceTrigger"
import { AnalysisActivityComponent } from "../analysisActivity/analysisActivity.component"

const FINISHED_TINT_MS = 1500
const MENU_ITEM_SELECTOR = "[data-menu-item]:not([disabled])"
const OFFLINE_STATES: ReadonlySet<string> = new Set(["restarting", "unavailable"])

@Component({
    selector: "cc-workspace-status",
    templateUrl: "./workspaceStatus.component.html",
    imports: [AnalysisActivityComponent, AnalysisLogDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "min-w-0" }
})
export class WorkspaceStatusComponent {
    private readonly projects = inject(ProjectsFacade)
    private readonly gitRepository = inject(GitRepositoryService)
    private readonly gitOperations = inject(GitOperationService)
    private readonly jobsService = inject(AnalysisJobsService)
    private readonly catalog = inject(SnapshotCatalogService)
    private readonly view = inject(SnapshotViewService)
    private readonly snapshotsDialog = inject(SnapshotsDialogService)
    private readonly environment = inject(DesktopEnvironment)
    private readonly desktopTools = inject(DesktopToolsService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>("trigger")
    private readonly menu = viewChild<ElementRef<HTMLElement>>("menu")
    private readonly logDialog = viewChild.required(AnalysisLogDialogComponent)
    private finishedTimer: ReturnType<typeof setTimeout> | undefined

    /** During a project comparison only the activity icon and the progress fill stay, in front of the comparison chip. */
    readonly iconOnly = input(false)
    readonly isOpen = signal(false)
    readonly outcome = signal<RecentOutcome>("none")
    readonly shortDate = shortDate
    readonly uncommittedTitle = uncommittedTitle

    readonly folder = this.projects.workingFolder
    readonly gitStatus = computed(() => {
        const ref = this.workingRef()
        return ref ? this.gitRepository.statusOf(ref) : undefined
    })
    readonly projectJobs = computed(() => this.jobsService.jobs().filter(job => job.projectId === this.projects.activeProject()?.id))
    readonly activeJob = computed(() => {
        const pending = this.projectJobs().filter(isPendingJob)
        return pending.find(job => job.state === "running") ?? pending[0] ?? null
    })
    readonly shown = computed(() => {
        const shown = this.projects.shownSnapshot()
        return shown?.ref.folderId === this.folder()?.id ? shown : null
    })
    readonly hasSnapshots = computed(() => this.catalog.snapshots(this.folder()?.id ?? "").length > 0)
    readonly gitActivity = computed(() => gitActivityOf(this.gitOperations.running(), this.workingRef()))
    readonly isCoreOffline = computed(() => OFFLINE_STATES.has(this.environment.coreState().state))
    readonly triggerView = computed(() => {
        const folder = this.folder()
        return folder ? this.triggerOf(folder) : null
    })
    readonly gitDetails = computed(() => {
        const status = this.gitStatus()
        return isGitStatus(status) ? { status, changes: changesSentence(status) } : null
    })
    readonly gitProblem = computed(() => {
        const status = this.gitStatus()
        return status !== undefined && !isGitStatus(status) ? status.problem : null
    })
    readonly hasStatusProblems = computed(() => this.view.rejectedRun()?.surface === "status")
    readonly target = this.view.target
    readonly staleness = computed(() => stalenessOf(this.view.resolution(), this.view.noticeText().badge, this.wantedPhrase()))
    readonly askedFor = computed(() => this.askedForOfTarget())
    readonly analyseLabel = computed(() => this.analyseLabelOfTarget())

    constructor() {
        effect(() => {
            const ref = this.workingRef()
            if (ref && this.folder()?.kind === "git") {
                untracked(() => void this.gitRepository.refreshFolders([ref]))
            }
        })
        this.jobsService.outcomes$.pipe(takeUntilDestroyed()).subscribe(job => this.showOutcome(job))
        inject(DestroyRef).onDestroy(() => clearTimeout(this.finishedTimer))
    }

    toggle() {
        if (this.isOpen()) {
            this.close()
        } else {
            this.open()
        }
    }

    openWithKeyboard(event: Event) {
        event.preventDefault()
        if (!this.isOpen()) {
            this.open()
        }
        setTimeout(() => this.menuItems()[0]?.focus())
    }

    analyseTarget() {
        void this.view.analyseTarget("status")
    }

    showCurrentCheckout() {
        this.close()
        this.view.showCurrentCheckout()
    }

    openSnapshots() {
        this.close()
        this.snapshotsDialog.show()
    }

    showOverview() {
        this.close()
        this.projects.showOverview()
    }

    restartCore() {
        void this.desktopTools.restartCore()
    }

    showLog(job: AnalysisJob) {
        const folderLabel = this.projects.activeProject()?.folders.find(folder => folder.id === job.folderId)?.label ?? ""
        void this.logDialog().open({ kind: "job", job, folderLabel })
    }

    progressLabel(job: AnalysisJob): string {
        return `Analysis of ${targetName(job.target)}`
    }

    handleMenuKey(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            this.close()
            this.trigger().nativeElement.focus()
        }
    }

    @HostListener("document:click", ["$event"])
    closeWhenClickedOutside(event: MouseEvent) {
        if (this.isOpen() && !this.hostElement.nativeElement.contains(event.target as Node)) {
            this.close()
        }
    }

    private open() {
        this.isOpen.set(true)
        if (this.outcome() === "failed") {
            this.outcome.set("none")
        }
        const ref = this.workingRef()
        if (ref && this.folder()?.kind === "git") {
            void this.gitRepository.refreshFolders([ref])
        }
    }

    private close() {
        this.isOpen.set(false)
    }

    private showOutcome(job: AnalysisJob) {
        if (job.projectId !== this.projects.activeProject()?.id) {
            return
        }
        clearTimeout(this.finishedTimer)
        if (job.state === "failed") {
            this.outcome.set(this.isOpen() ? "none" : "failed")
            return
        }
        this.outcome.set("finished")
        this.finishedTimer = setTimeout(() => this.outcome.set("none"), FINISHED_TINT_MS)
    }

    private triggerOf(folder: ProjectFolder) {
        const status = this.gitStatus()
        return workspaceTrigger({
            folder,
            gitStatus: isGitStatus(status) ? status : status?.problem,
            shown: this.shown(),
            hasSnapshots: this.hasSnapshots(),
            activeJob: this.activeJob(),
            outcome: this.outcome(),
            isCoreOffline: this.isCoreOffline(),
            staleness: this.staleness(),
            gitActivity: this.gitActivity()
        })
    }

    /** What the user asked for while the map shows something else: a commit, or the current checkout at HEAD. */
    private askedForOfTarget(): { sha: string | null; isCurrentCheckout: boolean } | null {
        const target = this.target()
        const resolution = this.view.resolution()
        if (!target || target.kind === "snapshot" || !resolution || resolution.kind === "exact") {
            return null
        }
        const head = this.view.headCommit()
        return target.kind === "commit"
            ? { sha: shortSha(target.sha), isCurrentCheckout: false }
            : { sha: head ? shortSha(head) : null, isCurrentCheckout: true }
    }

    private analyseLabelOfTarget(): string | null {
        const target = this.target()
        const resolution = this.view.resolution()
        const job = this.view.targetJob()
        if (!target || target.kind === "snapshot" || !resolution || resolution.kind === "exact" || (job && isPendingJob(job))) {
            return null
        }
        if (target.kind === "commit") {
            return `Analyse ${shortSha(target.sha)}`
        }
        return resolution.kind === "latest" ? "Analyse now" : "Analyse current checkout"
    }

    private wantedPhrase(): string {
        const target = this.target()
        return target?.kind === "commit" ? shortSha(target.sha) : "the current checkout"
    }

    private workingRef(): FolderRef | null {
        const project = this.projects.activeProject()
        const folder = this.folder()
        return project && folder ? { projectId: project.id, folderId: folder.id } : null
    }

    private menuItems(): HTMLElement[] {
        return Array.from(this.menu()?.nativeElement.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [])
    }
}
