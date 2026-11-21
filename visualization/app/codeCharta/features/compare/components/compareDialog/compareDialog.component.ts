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
import { RefPickerComponent, RefRange, RefResolution } from "../../../gitHistory/facade"
import { ProjectsFacade } from "../../../projects/facade"
import type { BaseMode, ComparePrefill } from "../../model/compare.model"
import { BaseModeRepo } from "../../repos/baseMode.repo"
import type { RecentComparison } from "../../repos/recentComparisons.repo"
import { ChangeRequestService } from "../../services/changeRequest.service"
import { changeRequestLabel } from "../../services/changeRequestText"
import { CompareService } from "../../services/compare.service"
import { CompareFolderChoice } from "../../services/compareFolderChoice"
import { errorSentence, refName, resolveOutcome } from "../../services/comparisonText"
import { snapshotInputOf } from "../../services/snapshotSides"
import type { TypedSides } from "../../services/typedSides"
import { CompareStore } from "../../stores/compare.store"
import { CompareFolderRowComponent } from "../compareFolderRow/compareFolderRow.component"
import { CompareListsComponent } from "../compareLists/compareLists.component"
import { ComparePreparationComponent } from "../comparePreparation/comparePreparation.component"

const BUSY_PHASES: ReadonlySet<string> = new Set(["resolving", "loading"])
const PREPARATION_PHASES: ReadonlySet<string> = new Set(["needsDecision", "analysing"])
const FINISHED_PHASES: ReadonlySet<string> = new Set(["active", "noDifferences"])
const NAMED_REF_KINDS: ReadonlySet<string> = new Set(["branch", "remoteBranch", "tag"])
const FETCH_PHASES: ReadonlySet<string> = new Set(["headNotLocal", "fetchingHead"])

@Component({
    selector: "cc-compare-dialog",
    templateUrl: "./compareDialog.component.html",
    imports: [RefPickerComponent, ComparePreparationComponent, CompareFolderRowComponent, CompareListsComponent],
    providers: [CompareFolderChoice],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareDialogComponent implements OnInit, AfterViewInit {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly projects = inject(ProjectsFacade)
    private readonly baseModeRepo = inject(BaseModeRepo)
    private readonly changeRequests = inject(ChangeRequestService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly basePicker = viewChild<RefPickerComponent>("basePicker")
    private readonly headPicker = viewChild<RefPickerComponent>("headPicker")
    readonly folders = inject(CompareFolderChoice)
    readonly hasStartedHere = signal(false)

    readonly prefill = input.required<ComparePrefill>()
    readonly openDesktopTools = output<void>()
    readonly base = signal("")
    readonly head = signal("")
    readonly baseResolution = signal<RefResolution | null>(null)
    readonly headResolution = signal<RefResolution | null>(null)
    readonly baseMode = signal<BaseMode>("mergeBase")

    readonly showsBaseMode = computed(() => NAMED_REF_KINDS.has(this.baseResolution()?.kind ?? ""))
    readonly phase = computed(() => this.store.state().phase)
    readonly isBusy = computed(() => BUSY_PHASES.has(this.phase()))
    readonly isLoading = computed(() => this.phase() === "loading")
    readonly isPreparing = computed(() => PREPARATION_PHASES.has(this.phase()))
    readonly canCompare = computed(
        () => Boolean(this.base().trim() && this.head().trim() && this.folders.folderId()) && !this.isBusy() && this.phase() !== "analysing"
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
            for (const folder of [this.folders.repo(), this.folders.headRepo()]) {
                if (folder) {
                    untracked(() => void this.projects.refreshFolderSnapshots(folder).catch(() => undefined))
                }
            }
        })
    }

    ngOnInit(): void {
        const { folder, base, head, headFolder } = this.prefill()
        const resolved = this.store.state().resolved
        this.folders.prefill(folder?.folderId, headFolder?.folderId)
        this.base.set(base ?? (resolved ? refName(resolved.base.requested) : ""))
        this.head.set(head ?? (resolved ? refName(resolved.head.requested) : ""))
        this.baseMode.set(this.baseModeRepo.read(this.projects.activeProject()?.id ?? ""))
    }

    ngAfterViewInit(): void {
        const dialog = this.dialog().nativeElement
        dialog.addEventListener("close", () => this.handleClosed())
        dialog.showModal()
        const focused = this.base() && !this.head() ? this.headPicker() : this.basePicker()
        focused?.focus()
    }

    fillBoth(range: RefRange): void {
        this.base.set(range.base)
        this.head.set(range.head)
        this.chooseBaseMode(range.isMergeBase ? "mergeBase" : "tip")
    }

    useRecent(recent: RecentComparison): void {
        this.folders.folderId.set(recent.folderId)
        this.folders.chooseAcross(recent.headFolderId)
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
        const folder = this.folders.folder()
        const repo = this.folders.repo()
        if (!(this.canCompare() && folder && repo)) {
            return
        }
        this.hasStartedHere.set(true)
        const unresolved = [this.base(), this.head()].filter((_, index) => [this.baseResolution(), this.headResolution()][index] === null)
        const headFolder = this.folders.headFolder()
        const headRepo = this.folders.headRepo()
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

    private handleClosed(): void {
        void this.changeRequests.cancelFetch()
        if (!FINISHED_PHASES.has(this.phase())) {
            this.service.cancel()
        }
        this.store.closeDialog()
    }
}
