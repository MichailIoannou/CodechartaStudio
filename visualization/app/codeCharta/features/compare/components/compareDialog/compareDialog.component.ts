import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    effect,
    inject,
    input,
    OnInit,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import { relativeTime } from "../../../../util/wording"
import { RefPickerComponent, RefRange, RefResolution } from "../../../gitHistory/facade"
import { ProjectsFacade } from "../../../projects/facade"
import type { BaseMode, ComparePrefill, FolderRef } from "../../model/compare.model"
import { BaseModeRepo } from "../../repos/baseMode.repo"
import { RecentComparison, RecentComparisonsRepo } from "../../repos/recentComparisons.repo"
import { CompareService } from "../../services/compare.service"
import { errorSentence, rangeOf, refName, resolveOutcome } from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"
import { ComparePreparationComponent } from "../comparePreparation/comparePreparation.component"

const BUSY_PHASES: ReadonlySet<string> = new Set(["resolving", "loading"])
const PREPARATION_PHASES: ReadonlySet<string> = new Set(["needsDecision", "analysing"])
const FINISHED_PHASES: ReadonlySet<string> = new Set(["active", "noDifferences"])
const MILLISECONDS_PER_SECOND = 1000
const NAMED_REF_KINDS: ReadonlySet<string> = new Set(["branch", "remoteBranch", "tag"])

interface RecentRow {
    recent: RecentComparison
    range: string
    folderLabel: string | null
    age: string
    comparedAtTitle: string
}

@Component({
    selector: "cc-compare-dialog",
    templateUrl: "./compareDialog.component.html",
    imports: [RefPickerComponent, ComparePreparationComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareDialogComponent implements OnInit, AfterViewInit {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly projects = inject(ProjectsFacade)
    private readonly baseModeRepo = inject(BaseModeRepo)
    private readonly recentComparisonsRepo = inject(RecentComparisonsRepo)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly basePicker = viewChild<RefPickerComponent>("basePicker")
    private readonly headPicker = viewChild<RefPickerComponent>("headPicker")
    readonly hasStartedHere = signal(false)

    readonly prefill = input.required<ComparePrefill>()
    readonly folderId = signal("")
    readonly base = signal("")
    readonly head = signal("")
    readonly baseResolution = signal<RefResolution | null>(null)
    readonly headResolution = signal<RefResolution | null>(null)
    readonly baseMode = signal<BaseMode>("mergeBase")
    readonly recentComparisons = signal<RecentRow[]>([])

    readonly gitFolders = computed(() => (this.projects.activeProject()?.folders ?? []).filter(folder => folder.kind === "git"))
    readonly folder = computed(() => this.gitFolders().find(candidate => candidate.id === this.folderId()) ?? null)
    readonly repo = computed<FolderRef | null>(
        () => {
            const projectId = this.projects.activeProject()?.id
            const folderId = this.folder()?.id
            return projectId && folderId ? { projectId, folderId } : null
        },
        { equal: (first, second) => first?.projectId === second?.projectId && first?.folderId === second?.folderId }
    )
    readonly defaultBranch = computed(() => this.folder()?.git?.defaultBranch ?? null)
    readonly showsBaseMode = computed(() => NAMED_REF_KINDS.has(this.baseResolution()?.kind ?? ""))
    readonly phase = computed(() => this.store.state().phase)
    readonly isBusy = computed(() => BUSY_PHASES.has(this.phase()))
    readonly isLoading = computed(() => this.phase() === "loading")
    readonly isPreparing = computed(() => PREPARATION_PHASES.has(this.phase()))
    readonly canCompare = computed(
        () => Boolean(this.base().trim() && this.head().trim() && this.folderId()) && !this.isBusy() && this.phase() !== "analysing"
    )
    readonly outcome = computed(() => {
        const { phase, resolved } = this.store.state()
        return phase === "stopped" && resolved ? resolveOutcome(resolved) : null
    })
    readonly errorText = computed(() => {
        const { phase, error } = this.store.state()
        return phase === "failed" && error ? errorSentence(error) : null
    })
    readonly canRetry = computed(() => this.store.state().error?.kind === "coreUnavailable")

    constructor() {
        effect(() => {
            if (this.hasStartedHere() && FINISHED_PHASES.has(this.phase())) {
                untracked(() => this.close())
            }
        })
    }

    ngOnInit(): void {
        const { folder, base, head } = this.prefill()
        const resolved = this.store.state().resolved
        const working = this.projects.workingFolder()
        const folders = this.gitFolders()
        const preferred = folder?.folderId ?? (working?.kind === "git" ? working.id : folders[0]?.id)
        this.folderId.set(preferred ?? "")
        this.base.set(base ?? (resolved ? refName(resolved.base.requested) : ""))
        this.head.set(head ?? (resolved ? refName(resolved.head.requested) : ""))
        const projectId = this.projects.activeProject()?.id ?? ""
        this.baseMode.set(this.baseModeRepo.read(projectId))
        this.recentComparisons.set(this.recentRowsOf(this.recentComparisonsRepo.read(projectId)))
    }

    ngAfterViewInit(): void {
        const dialog = this.dialog().nativeElement
        dialog.addEventListener("close", () => this.handleClosed())
        dialog.showModal()
        const focused = this.base() && !this.head() ? this.headPicker() : this.basePicker()
        focused?.focus()
    }

    chooseFolder(folderId: string): void {
        this.folderId.set(folderId)
    }

    fillBoth(range: RefRange): void {
        this.base.set(range.base)
        this.head.set(range.head)
        this.chooseBaseMode(range.isMergeBase ? "mergeBase" : "tip")
    }

    useRecent(recent: RecentComparison): void {
        this.folderId.set(recent.folderId)
        this.base.set(recent.base)
        this.head.set(recent.head)
        this.chooseBaseMode(recent.baseMode)
    }

    chooseBaseMode(baseMode: BaseMode): void {
        this.baseMode.set(baseMode)
        this.baseModeRepo.write(this.projects.activeProject()?.id ?? "", baseMode)
    }

    swapInputs(): void {
        const base = this.base()
        this.base.set(this.head())
        this.head.set(base)
    }

    async compare(): Promise<void> {
        const folder = this.folder()
        const repo = this.repo()
        if (!(this.canCompare() && folder && repo)) {
            return
        }
        this.hasStartedHere.set(true)
        const unresolved = [this.base(), this.head()].filter((_, index) => [this.baseResolution(), this.headResolution()][index] === null)
        await this.service.compareSides(
            { ref: repo, label: folder.label },
            { base: this.base(), head: this.head(), baseMode: this.showsBaseMode() ? this.baseMode() : "tip", unresolved }
        )
    }

    async continueAfterOutcome(): Promise<void> {
        this.hasStartedHere.set(true)
        await this.service.continueWithShownSnapshots()
    }

    close(): void {
        this.dialog().nativeElement.close()
    }

    private recentRowsOf(recents: RecentComparison[]): RecentRow[] {
        const folders = this.gitFolders()
        const isLabelled = folders.length > 1
        return recents
            .filter(recent => folders.some(folder => folder.id === recent.folderId))
            .map(recent => ({
                recent,
                range: rangeOf(recent.base, recent.head, recent.baseMode),
                folderLabel: isLabelled ? (folders.find(folder => folder.id === recent.folderId)?.label ?? null) : null,
                age: relativeTime(recent.comparedAt / MILLISECONDS_PER_SECOND, Date.now()),
                comparedAtTitle: new Date(recent.comparedAt).toLocaleString()
            }))
    }

    private handleClosed(): void {
        if (!FINISHED_PHASES.has(this.phase())) {
            this.service.cancel()
        }
        this.store.closeDialog()
    }
}
