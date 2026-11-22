import { effect, Injectable, inject, untracked } from "@angular/core"
import { Router } from "@angular/router"
import { routeLinks, viewIdForLink } from "../../../routing/routePaths"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { ToastService } from "../../shared/facade"
import type {
    AnalysisJob,
    BaseMode,
    ComparedChangeRequest,
    CompareError,
    CompareIntent,
    FolderRef,
    LoadedSide,
    ResolvedComparison,
    ResolvedSide,
    SideInput
} from "../model/compare.model"
import { IDLE_COMPARISON } from "../model/compare.model"
import { ANALYSIS_GATEWAY, CORE_GATEWAY, SNAPSHOT_GATEWAY } from "../ports/compareGateways"
import { RecentComparisonsRepo } from "../repos/recentComparisons.repo"
import { CompareReadStore } from "../stores/compare.read.store"
import { CompareStore } from "../stores/compare.store"
import { CompareWriteStore } from "../stores/compare.write.store"
import { ChangedFilesService } from "./changedFiles.service"
import { refName, sideName } from "./comparisonText"
import { batchOutcome, folderOfSide, missingSidesOf, pendingJobIds, queuedAnalysis, withFailures } from "./missingSides"
import type { SnapshotSideInput } from "./snapshotSides"

const METRIC_VIEW_TOAST = "Compare runs in the metric view — the domain and dependency views show a single map."
const TREEMAP_TOAST = "Switched to the treemap layout — the radial layouts show a single map."
const SINGLE_MAP_VIEWS: ReadonlySet<string> = new Set(["domain", "dependencies"])

export interface ComparedFolder {
    ref: FolderRef
    label: string
}

export interface TypedSides {
    base: string
    head: string
    baseMode: BaseMode
    /** The sides no picker could name, base first: an unknown revision is blamed on the first of them. */
    unresolved: string[]
    /** The head's folder when it is another folder of the project than the base's. */
    headFolder?: ComparedFolder
    /** Set for a side picked from the "Snapshots" group: that snapshot instead of the typed text. */
    baseSnapshot?: SnapshotSideInput | null
    headSnapshot?: SnapshotSideInput | null
}

/** The snapshot a side would show (its own, else its nearest) and how many commits that is away from it. */
type ShownSide = Omit<LoadedSide, "checksum">

/** Takes two points of a folder's history to the delta view: resolve, load both maps, select base and head. */
@Injectable({ providedIn: "root" })
export class CompareService {
    private readonly store = inject(CompareStore)
    private readonly readStore = inject(CompareReadStore)
    private readonly writeStore = inject(CompareWriteStore)
    private readonly snapshots = inject(SNAPSHOT_GATEWAY)
    private readonly core = inject(CORE_GATEWAY)
    private readonly router = inject(Router)
    private readonly toastService = inject(ToastService)
    private readonly recents = inject(RecentComparisonsRepo)
    private readonly analyses = inject(ANALYSIS_GATEWAY)
    private readonly changedFiles = inject(ChangedFilesService)
    private latestTicket = 0
    private lastIntent: CompareIntent | null = null

    constructor() {
        effect(() => {
            const jobs = this.analyses.jobs()
            if (this.store.state().phase === "analysing") {
                untracked(() => void this.followAnalyses(jobs))
            }
        })
    }

    /** Compares what the user typed or picked; the base stays the base. */
    async compareSides(folder: ComparedFolder, sides: TypedSides): Promise<void> {
        const ticket = this.beginResolving()
        try {
            await this.resolveAndShow(explicitIntent(folder.ref, sides), ticket)
        } catch (error) {
            this.fail(ticket, typedSidesErrorOf(error, folder, sides))
        }
    }

    /** With the pull or merge request the intent names, so a head that is not local can be fetched. */
    async start(intent: CompareIntent, changeRequest: ComparedChangeRequest | null = null): Promise<void> {
        const ticket = this.beginResolving(changeRequest)
        try {
            await this.resolveAndShow(intent, ticket)
        } catch (error) {
            this.failOrAskToFetch(ticket, error)
        }
    }

    /** Goes on with the snapshots the sides would show: past a stop the user accepted, a size warning or nearest analyses. */
    async continueWithShownSnapshots(): Promise<void> {
        const resolved = this.store.state().resolved
        if (resolved) {
            await this.show(resolved, ++this.latestTicket)
        }
    }

    /** "Analyse missing": queues the sides without an analysis; the comparison goes on once they are analysed. */
    async analyseMissing(): Promise<void> {
        const { resolved } = this.store.state()
        if (!resolved) {
            return
        }
        const ticket = ++this.latestTicket
        this.snapshots.holdMap()
        try {
            const queued = await Promise.all(
                missingSidesOf(resolved).map(async analysis =>
                    queuedAnalysis(analysis, await this.analyses.enqueue(folderOfSide(resolved, analysis), analysis.commit))
                )
            )
            if (ticket === this.latestTicket) {
                this.store.update({ phase: "analysing", analyses: queued, error: null })
            }
        } catch (error) {
            this.fail(ticket, compareErrorOf(error))
        }
    }

    /** "Cancel analysis": cancels the whole batch and compares nothing. */
    async cancelAnalyses(): Promise<void> {
        const ticket = ++this.latestTicket
        const pending = pendingJobIds(this.store.state().analyses, this.analyses.jobs())
        this.fail(ticket, { kind: "analysisCancelled", message: "" })
        await Promise.all(pending.map(jobId => this.analyses.cancel(jobId).catch(() => undefined)))
    }

    swap(): void {
        if (!this.store.isActive()) {
            return
        }
        const { base, head } = this.store.state()
        this.writeStore.switchReferenceAndComparison()
        this.store.update({ base: head, head: base })
    }

    /** Leaves the comparison with the head alone on the map. */
    exit(): void {
        const { base, head } = this.store.state()
        const baseFile = base && this.readStore.fileWithChecksum(base.checksum)
        const headFile = head && this.readStore.fileWithChecksum(head.checksum)
        if (this.store.isActive() && baseFile && headFile) {
            this.writeStore.showAlone(headFile, [baseFile.fileMeta.fileName])
        }
        // After the head is shown alone, where the renames no longer reach the map: cleared before, they would rebuild the delta once more.
        this.changedFiles.clear()
        this.latestTicket += 1
        this.store.reset()
    }

    cancel(): void {
        this.latestTicket += 1
        if (!["active", "noDifferences"].includes(this.store.state().phase)) {
            this.store.reset()
        }
    }

    private beginResolving(changeRequest: ComparedChangeRequest | null = null): number {
        this.changedFiles.clear()
        this.store.set({ ...IDLE_COMPARISON, phase: "resolving", changeRequest })
        return ++this.latestTicket
    }

    private failOrAskToFetch(ticket: number, error: unknown): void {
        const isHeadMissing = error instanceof DesktopBridgeError && error.code === "HEAD_NOT_LOCAL"
        if (isHeadMissing && this.store.state().changeRequest && ticket === this.latestTicket) {
            this.store.update({ phase: "headNotLocal" })
            return
        }
        this.fail(ticket, compareErrorOf(error))
    }

    /** Once no analysis of the batch runs: resolves again, so the sides come from the store, and goes on from there. */
    private async followAnalyses(jobs: readonly AnalysisJob[]): Promise<void> {
        const { analyses } = this.store.state()
        const outcome = batchOutcome(analyses, jobs)
        const ticket = this.latestTicket
        if (outcome === "cancelled") {
            this.fail(ticket, { kind: "analysisCancelled", message: "" })
        } else if (outcome === "finished" && this.lastIntent) {
            this.store.update({ phase: "resolving", analyses: withFailures(analyses, jobs) })
            await this.resolveAgain(this.lastIntent, ticket)
        }
    }

    private async resolveAgain(intent: CompareIntent, ticket: number): Promise<void> {
        try {
            await this.resolveAndShow(intent, ticket)
        } catch (error) {
            this.fail(ticket, compareErrorOf(error))
        }
    }

    private async resolveAndShow(intent: CompareIntent, ticket: number): Promise<void> {
        this.lastIntent = intent
        const resolved = await this.core.resolve(intent, this.snapshots.shownCommit())
        if (ticket !== this.latestTicket) {
            return
        }
        if (resolved.status.kind !== "ready") {
            this.store.update({ phase: "stopped", resolved })
            return
        }
        if (needsDecision(resolved)) {
            this.store.update({ phase: "needsDecision", resolved })
            return
        }
        await this.show(resolved, ticket)
    }

    private async show(resolved: ResolvedComparison, ticket: number): Promise<void> {
        const base = shownSideOf(resolved.base)
        const head = shownSideOf(resolved.head)
        if (!(base && head)) {
            this.store.update({ phase: "needsDecision", resolved })
            return
        }
        this.store.update({ phase: "loading", resolved, error: null })
        this.snapshots.holdMap()
        try {
            await (resolved.preflight.identicalChecksums ? this.showHeadAlone(base, head, ticket) : this.showPair(base, head, ticket))
        } catch (error) {
            this.fail(ticket, loadErrorOf(error))
        }
    }

    private async showPair(base: ShownSide, head: ShownSide, ticket: number): Promise<void> {
        const load = await this.snapshots.loadPair(base.snapshot, head.snapshot)
        if (ticket !== this.latestTicket) {
            return
        }
        if (load.head && !load.base) {
            this.finishWithoutDifferences(base, head, load.head, ticket)
            return
        }
        if (!(load.base && load.head)) {
            this.fail(ticket, unreadable(load.base ? head : base))
            return
        }
        this.select({ ...base, checksum: load.base }, { ...head, checksum: load.head }, ticket)
    }

    private select(base: LoadedSide, head: LoadedSide, ticket: number): void {
        const baseFile = this.readStore.fileWithChecksum(base.checksum)
        const headFile = this.readStore.fileWithChecksum(head.checksum)
        if (!(baseFile && headFile)) {
            this.fail(ticket, unreadable(baseFile ? head : base))
            return
        }
        this.writeStore.setDelta(baseFile, headFile)
        if (!this.readStore.isDeltaState() || baseFile.map.name !== headFile.map.name) {
            this.writeStore.showAlone(headFile, [baseFile.fileMeta.fileName])
            this.fail(ticket, { kind: "rootMismatch", message: "" })
            return
        }
        this.showInMetricView()
        this.store.update({ phase: "active", base, head, error: null })
        this.rememberComparison()
        this.loadChangedFiles(ticket)
    }

    private async showHeadAlone(base: ShownSide, head: ShownSide, ticket: number): Promise<void> {
        const checksum = await this.snapshots.loadAlone(head.snapshot)
        if (ticket !== this.latestTicket) {
            return
        }
        if (checksum === null) {
            this.fail(ticket, unreadable(head))
            return
        }
        this.finishWithoutDifferences(base, head, checksum, ticket)
    }

    private finishWithoutDifferences(base: ShownSide, head: ShownSide, checksum: string, ticket: number): void {
        this.showInMetricView()
        this.store.update({ phase: "noDifferences", base: { ...base, checksum }, head: { ...head, checksum }, error: null })
        this.rememberComparison()
        this.loadChangedFiles(ticket)
    }

    private loadChangedFiles(ticket: number): void {
        const { resolved } = this.store.state()
        if (resolved) {
            void this.changedFiles.load(resolved, () => ticket === this.latestTicket)
        }
    }

    /** As the user named the sides: a merge-base comparison by the tip its base came from; a snapshot side has no name to type again. */
    private rememberComparison(): void {
        const { resolved } = this.store.state()
        if (!resolved || resolved.base.requested.kind !== "commit" || resolved.head.requested.kind !== "commit") {
            return
        }
        const base = resolved.baseTip ?? resolved.base.requested
        const headFolderId = resolved.head.requested.folder.folderId
        this.recents.remember(base.folder.projectId, {
            folderId: base.folder.folderId,
            ...(headFolderId === base.folder.folderId ? {} : { headFolderId }),
            base: refName(base),
            head: refName(resolved.head.requested),
            baseMode: resolved.baseMode,
            comparedAt: Date.now()
        })
    }

    private showInMetricView(): void {
        if (SINGLE_MAP_VIEWS.has(viewIdForLink(this.router.url))) {
            this.toastService.show(METRIC_VIEW_TOAST)
        }
        void this.router.navigateByUrl(routeLinks.metrics)
        if (this.readStore.isRadialLayout()) {
            this.writeStore.useTreemapLayout()
            this.toastService.show(TREEMAP_TOAST)
        }
    }

    private fail(ticket: number, error: CompareError): void {
        if (ticket === this.latestTicket) {
            this.store.update({ phase: "failed", error })
        }
    }
}

function needsDecision({ base, head, preflight }: ResolvedComparison): boolean {
    return (
        base.status.status === "missing" || head.status.status === "missing" || preflight.sizeVerdict !== "ok" || preflight.profilesDiffer
    )
}

function shownSideOf({ requested, status }: ResolvedSide): ShownSide | null {
    if (status.status === "exact") {
        return { requested, snapshot: status.snapshot, relation: null, staleBy: 0, behind: 0, ahead: 0 }
    }
    const { nearest } = status
    return nearest ? { requested, ...nearest } : null
}

function unreadable(side: ShownSide): CompareError {
    return { kind: "loadFailed", message: `the analysis of ${side.snapshot.shortCommit ?? sideName(side.requested)} could not be read.` }
}

function loadErrorOf(error: unknown): CompareError {
    const compareError = compareErrorOf(error)
    return compareError.kind === "coreError" ? { kind: "loadFailed", message: compareError.message } : compareError
}

function explicitIntent(folder: FolderRef, sides: TypedSides): CompareIntent {
    const headFolder = sides.headFolder?.ref ?? folder
    return {
        kind: "explicit",
        base: sideInputOf(folder, sides.base, sides.baseSnapshot),
        head: sideInputOf(headFolder, sides.head, sides.headSnapshot),
        baseMode: sides.baseMode
    }
}

function sideInputOf(folder: FolderRef, typed: string, snapshot: SnapshotSideInput | null | undefined): SideInput {
    return { folder, rev: snapshot ?? { kind: "rev", name: typed.trim() } }
}

function typedSidesErrorOf(error: unknown, folder: ComparedFolder, sides: TypedSides): CompareError {
    const isUnknown = error instanceof DesktopBridgeError && (error.code === "UNKNOWN_REVISION" || error.code === "BAD_REQUEST")
    const input = (sides.unresolved[0] ?? sides.base).trim()
    const isTheHead = sides.headFolder !== undefined && input === sides.head.trim() && input !== sides.base.trim()
    const folderLabel = isTheHead ? sides.headFolder.label : folder.label
    return isUnknown ? { kind: "refNotFound", message: "", input, folderLabel } : compareErrorOf(error)
}

function compareErrorOf(error: unknown): CompareError {
    if (error instanceof DesktopBridgeError && error.code === "CORE_UNAVAILABLE") {
        return { kind: "coreUnavailable", message: error.message }
    }
    return { kind: "coreError", message: (error as Error).message }
}
