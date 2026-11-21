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
    output,
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
import { ChangeRequestService } from "../../services/changeRequest.service"
import { changeRequestLabel, segmentLabelOf } from "../../services/changeRequestText"
import { CompareService } from "../../services/compare.service"
import { errorSentence, rangeOf, refName, resolveOutcome } from "../../services/comparisonText"
import { HostingCheckService } from "../../services/hostingCheck.service"
import { snapshotInputOf, snapshotOptionsOf } from "../../services/snapshotSides"
import type { TypedSides } from "../../services/typedSides"
import { CompareStore } from "../../stores/compare.store"
import { ChangeRequestListComponent } from "../changeRequestList/changeRequestList.component"
import { ComparePreparationComponent } from "../comparePreparation/comparePreparation.component"

const BUSY_PHASES: ReadonlySet<string> = new Set(["resolving", "loading"])
const PREPARATION_PHASES: ReadonlySet<string> = new Set(["needsDecision", "analysing"])
const FINISHED_PHASES: ReadonlySet<string> = new Set(["active", "noDifferences"])
const MILLISECONDS_PER_SECOND = 1000
const NAMED_REF_KINDS: ReadonlySet<string> = new Set(["branch", "remoteBranch", "tag"])
const FETCH_PHASES: ReadonlySet<string> = new Set(["headNotLocal", "fetchingHead"])

type ListSegment = "changeRequests" | "recent"

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
    imports: [RefPickerComponent, ComparePreparationComponent, ChangeRequestListComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareDialogComponent implements OnInit, AfterViewInit {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly projects = inject(ProjectsFacade)
    private readonly baseModeRepo = inject(BaseModeRepo)
    private readonly recentComparisonsRepo = inject(RecentComparisonsRepo)
    private readonly hostingCheck = inject(HostingCheckService)
    private readonly changeRequests = inject(ChangeRequestService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly basePicker = viewChild<RefPickerComponent>("basePicker")
    private readonly headPicker = viewChild<RefPickerComponent>("headPicker")
    readonly hasStartedHere = signal(false)

    readonly prefill = input.required<ComparePrefill>()
    readonly openDesktopTools = output<void>()
    readonly chosenList = signal<ListSegment>("changeRequests")
    readonly folderId = signal("")
    readonly isAcrossFolders = signal(false)
    readonly chosenHeadFolderId = signal("")
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
    readonly otherGitFolders = computed(() => this.gitFolders().filter(candidate => candidate.id !== this.folderId()))
    readonly headFolder = computed(() => {
        const others = this.otherGitFolders()
        return this.isAcrossFolders() ? (others.find(candidate => candidate.id === this.chosenHeadFolderId()) ?? others[0] ?? null) : null
    })
    readonly headRepo = computed<FolderRef | null>(
        () => {
            const projectId = this.projects.activeProject()?.id
            const folderId = (this.headFolder() ?? this.folder())?.id
            return projectId && folderId ? { projectId, folderId } : null
        },
        { equal: (first, second) => first?.projectId === second?.projectId && first?.folderId === second?.folderId }
    )
    readonly baseSnapshots = computed(() => snapshotOptionsOf(this.projects.snapshotsByFolder()[this.folderId()] ?? []))
    readonly headSnapshots = computed(() => {
        const headFolderId = this.headRepo()?.folderId ?? ""
        return snapshotOptionsOf(this.projects.snapshotsByFolder()[headFolderId] ?? [])
    })
    readonly defaultBranch = computed(() => this.folder()?.git?.defaultBranch ?? null)
    readonly headDefaultBranch = computed(() => (this.headFolder() ?? this.folder())?.git?.defaultBranch ?? null)
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
    readonly pullRequestPanel = computed(() => {
        const repo = this.repo()
        return repo ? this.hostingCheck.panelOf(repo) : ({ kind: "absent" } as const)
    })
    readonly hasChangeRequestSegment = computed(() => this.pullRequestPanel().kind !== "absent")
    readonly changeRequestSegmentLabel = computed(() => {
        const panel = this.pullRequestPanel()
        return segmentLabelOf("hosting" in panel ? panel.hosting.provider : null)
    })
    readonly shownList = computed<ListSegment>(() => (this.hasChangeRequestSegment() ? this.chosenList() : "recent"))
    readonly fetchPrompt = computed(() => {
        const { phase, changeRequest } = this.store.state()
        if (!(FETCH_PHASES.has(phase) && changeRequest)) {
            return null
        }
        const label = changeRequestLabel(changeRequest.provider, changeRequest.number)
        return { label, remote: changeRequest.remote, isFetching: phase === "fetchingHead" }
    })

    constructor() {
        effect(() => {
            if (this.hasStartedHere() && FINISHED_PHASES.has(this.phase())) {
                untracked(() => this.close())
            }
        })
        effect(() => {
            const repo = this.repo()
            if (repo) {
                untracked(() => void this.hostingCheck.check(repo))
            }
        })
        effect(() => {
            for (const folder of [this.repo(), this.headRepo()]) {
                if (folder) {
                    untracked(() => void this.projects.refreshFolderSnapshots(folder).catch(() => undefined))
                }
            }
        })
    }

    ngOnInit(): void {
        const { folder, base, head, headFolder } = this.prefill()
        const resolved = this.store.state().resolved
        const working = this.projects.workingFolder()
        const folders = this.gitFolders()
        const preferred = folder?.folderId ?? (working?.kind === "git" ? working.id : folders[0]?.id)
        this.folderId.set(preferred ?? "")
        this.base.set(base ?? (resolved ? refName(resolved.base.requested) : ""))
        this.head.set(head ?? (resolved ? refName(resolved.head.requested) : ""))
        this.prefillHeadFolder(headFolder?.folderId)
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

    chooseHeadFolder(folderId: string): void {
        this.chosenHeadFolderId.set(folderId)
    }

    setAcrossFolders(isAcrossFolders: boolean): void {
        this.isAcrossFolders.set(isAcrossFolders)
    }

    fillBoth(range: RefRange): void {
        this.base.set(range.base)
        this.head.set(range.head)
        this.chooseBaseMode(range.isMergeBase ? "mergeBase" : "tip")
    }

    useRecent(recent: RecentComparison): void {
        this.folderId.set(recent.folderId)
        this.isAcrossFolders.set(recent.headFolderId !== undefined)
        this.chosenHeadFolderId.set(recent.headFolderId ?? "")
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
        const headFolder = this.headFolder()
        const headRepo = this.headRepo()
        await this.service.compareSides(
            { ref: repo, label: folder.label },
            {
                base: this.base(),
                head: this.head(),
                baseMode: this.showsBaseMode() ? this.baseMode() : "tip",
                unresolved,
                ...(headFolder && headRepo ? { headFolder: { ref: headRepo, label: headFolder.label } } : {}),
                ...this.pickedSnapshots()
            }
        )
    }

    chooseList(list: ListSegment): void {
        this.chosenList.set(list)
    }

    async fetchHead(): Promise<void> {
        this.hasStartedHere.set(true)
        await this.changeRequests.fetchHeadAndCompare()
    }

    async cancelFetch(): Promise<void> {
        await this.changeRequests.cancelFetch()
    }

    async continueAfterOutcome(): Promise<void> {
        this.hasStartedHere.set(true)
        await this.service.continueWithShownSnapshots()
    }

    close(): void {
        this.dialog().nativeElement.close()
    }

    /** Only the sides picked from the "Snapshots" group. */
    private pickedSnapshots(): Pick<TypedSides, "baseSnapshot" | "headSnapshot"> {
        const baseSnapshot = snapshotInputOf(this.baseResolution())
        const headSnapshot = snapshotInputOf(this.headResolution())
        return { ...(baseSnapshot ? { baseSnapshot } : {}), ...(headSnapshot ? { headSnapshot } : {}) }
    }

    /** A comparison across two folders, changed through the chip, keeps its head folder. */
    private prefillHeadFolder(headFolderId: string | undefined): void {
        const isOtherFolder = headFolderId !== undefined && headFolderId !== this.folderId()
        this.isAcrossFolders.set(isOtherFolder)
        this.chosenHeadFolderId.set(isOtherFolder ? headFolderId : "")
    }

    private recentRowsOf(recents: RecentComparison[]): RecentRow[] {
        const folders = this.gitFolders()
        const isLabelled = folders.length > 1
        const labelOf = (folderId: string) => folders.find(folder => folder.id === folderId)?.label ?? null
        const foldersOf = (recent: RecentComparison) =>
            recent.headFolderId ? `${labelOf(recent.folderId)} → ${labelOf(recent.headFolderId)}` : labelOf(recent.folderId)
        return recents
            .filter(recent =>
                [recent.folderId, recent.headFolderId ?? recent.folderId].every(id => folders.some(folder => folder.id === id))
            )
            .map(recent => ({
                recent,
                range: rangeOf(recent.base, recent.head, recent.baseMode),
                folderLabel: isLabelled ? foldersOf(recent) : null,
                age: relativeTime(recent.comparedAt / MILLISECONDS_PER_SECOND, Date.now()),
                comparedAtTitle: new Date(recent.comparedAt).toLocaleString()
            }))
    }

    private handleClosed(): void {
        void this.changeRequests.cancelFetch()
        if (!FINISHED_PHASES.has(this.phase())) {
            this.service.cancel()
        }
        this.store.closeDialog()
    }
}
