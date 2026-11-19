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
import { ProjectsFacade } from "../../../projects/facade"
import type { ComparePrefill, ResolvedComparison, ResolvedSide } from "../../model/compare.model"
import { CompareService } from "../../services/compare.service"
import {
    errorSentence,
    parseRange,
    refName,
    resolveOutcome,
    sideCaption,
    sideStatusText,
    useNearestRefusal
} from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"

const BUSY_PHASES: ReadonlySet<string> = new Set(["resolving", "loading"])
const FINISHED_PHASES: ReadonlySet<string> = new Set(["active", "noDifferences"])

interface PreparationRow {
    caption: string
    shortCommit: string
    label: string | null
    tone: "exact" | "nearest" | "missing"
    status: string
}

interface Preparation {
    rows: PreparationRow[]
    profilesDiffer: boolean
    sizeVerdict: ResolvedComparison["preflight"]["sizeVerdict"]
    hasMissingSide: boolean
    useNearestRefusal: string | null
}

@Component({
    selector: "cc-compare-dialog",
    templateUrl: "./compareDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareDialogComponent implements OnInit, AfterViewInit {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly projects = inject(ProjectsFacade)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly baseInput = viewChild.required<ElementRef<HTMLInputElement>>("baseInput")
    private readonly headInput = viewChild.required<ElementRef<HTMLInputElement>>("headInput")
    private readonly hasStartedHere = signal(false)

    readonly prefill = input.required<ComparePrefill>()
    readonly folderId = signal("")
    readonly base = signal("")
    readonly head = signal("")

    readonly gitFolders = computed(() => (this.projects.activeProject()?.folders ?? []).filter(folder => folder.kind === "git"))
    readonly phase = computed(() => this.store.state().phase)
    readonly isBusy = computed(() => BUSY_PHASES.has(this.phase()))
    readonly isLoading = computed(() => this.phase() === "loading")
    readonly canCompare = computed(() => Boolean(this.base().trim() && this.head().trim() && this.folderId()) && !this.isBusy())
    readonly outcome = computed(() => {
        const { phase, resolved } = this.store.state()
        return phase === "stopped" && resolved ? resolveOutcome(resolved) : null
    })
    readonly errorText = computed(() => {
        const { phase, error } = this.store.state()
        return phase === "failed" && error ? errorSentence(error) : null
    })
    readonly canRetry = computed(() => this.store.state().error?.kind === "coreUnavailable")
    readonly preparation = computed(() => {
        const { phase, resolved } = this.store.state()
        return phase === "needsDecision" && resolved ? preparationOf(resolved) : null
    })

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
    }

    ngAfterViewInit(): void {
        const dialog = this.dialog().nativeElement
        dialog.addEventListener("close", () => this.handleClosed())
        dialog.showModal()
        const focused = this.base() && !this.head() ? this.headInput() : this.baseInput()
        focused.nativeElement.focus()
    }

    chooseFolder(folderId: string): void {
        this.folderId.set(folderId)
    }

    setBase(text: string): void {
        if (!this.fillBothFromRange(text)) {
            this.base.set(text)
        }
    }

    setHead(text: string): void {
        if (!this.fillBothFromRange(text)) {
            this.head.set(text)
        }
    }

    swapInputs(): void {
        const base = this.base()
        this.base.set(this.head())
        this.head.set(base)
    }

    async compare(): Promise<void> {
        const folder = this.gitFolders().find(candidate => candidate.id === this.folderId())
        const project = this.projects.activeProject()
        if (!(this.canCompare() && folder && project)) {
            return
        }
        this.hasStartedHere.set(true)
        await this.service.compareInputs(
            { ref: { projectId: project.id, folderId: folder.id }, label: folder.label },
            this.base(),
            this.head()
        )
    }

    async continueWithShownSnapshots(): Promise<void> {
        this.hasStartedHere.set(true)
        await this.service.continueWithShownSnapshots()
    }

    close(): void {
        this.dialog().nativeElement.close()
    }

    private fillBothFromRange(text: string): boolean {
        const range = parseRange(text)
        if (range) {
            this.base.set(range.base)
            this.head.set(range.head)
        }
        return range !== null
    }

    private handleClosed(): void {
        if (!FINISHED_PHASES.has(this.phase())) {
            this.service.cancel()
        }
        this.store.closeDialog()
    }
}

function preparationOf(resolved: ResolvedComparison): Preparation {
    const { base, head, preflight } = resolved
    return {
        rows: [rowOf("BASE", base), rowOf("HEAD", head)],
        profilesDiffer: preflight.profilesDiffer,
        sizeVerdict: preflight.sizeVerdict,
        hasMissingSide: [base, head].some(side => side.status.status === "missing"),
        useNearestRefusal: useNearestRefusal(resolved)
    }
}

function rowOf(caption: string, side: ResolvedSide): PreparationRow {
    const { status } = side
    const tone = status.status === "exact" ? "exact" : status.nearest ? "nearest" : "missing"
    return { caption, shortCommit: side.requested.shortCommit, label: sideCaption(side.requested), tone, status: sideStatusText(side) }
}
