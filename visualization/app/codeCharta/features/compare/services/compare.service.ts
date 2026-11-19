import { Injectable, inject } from "@angular/core"
import { Router } from "@angular/router"
import { routeLinks, viewIdForLink } from "../../../routing/routePaths"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { ToastService } from "../../shared/facade"
import type { BaseMode, CompareError, CompareIntent, FolderRef, LoadedSide, ResolvedComparison, ResolvedSide } from "../model/compare.model"
import { CORE_GATEWAY, SNAPSHOT_GATEWAY } from "../ports/compareGateways"
import { CompareReadStore } from "../stores/compare.read.store"
import { CompareStore } from "../stores/compare.store"
import { CompareWriteStore } from "../stores/compare.write.store"

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
    private latestTicket = 0

    /** Compares what the user typed or picked; the base stays the base. */
    async compareSides(folder: ComparedFolder, sides: TypedSides): Promise<void> {
        const ticket = this.beginResolving()
        try {
            await this.resolveAndShow(explicitIntent(folder.ref, sides), ticket)
        } catch (error) {
            this.fail(ticket, typedSidesErrorOf(error, folder, sides))
        }
    }

    async start(intent: CompareIntent): Promise<void> {
        const ticket = this.beginResolving()
        try {
            await this.resolveAndShow(intent, ticket)
        } catch (error) {
            this.fail(ticket, compareErrorOf(error))
        }
    }

    /** Goes on with the snapshots the sides would show: past a stop the user accepted, a size warning or nearest analyses. */
    async continueWithShownSnapshots(): Promise<void> {
        const resolved = this.store.state().resolved
        if (resolved) {
            await this.show(resolved, ++this.latestTicket)
        }
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
        this.latestTicket += 1
        this.store.reset()
    }

    cancel(): void {
        this.latestTicket += 1
        if (!["active", "noDifferences"].includes(this.store.state().phase)) {
            this.store.reset()
        }
    }

    private beginResolving(): number {
        this.store.set({ phase: "resolving", resolved: null, base: null, head: null, error: null })
        return ++this.latestTicket
    }

    private async resolveAndShow(intent: CompareIntent, ticket: number): Promise<void> {
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
            this.finishWithoutDifferences(base, head, load.head)
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
        this.finishWithoutDifferences(base, head, checksum)
    }

    private finishWithoutDifferences(base: ShownSide, head: ShownSide, checksum: string): void {
        this.showInMetricView()
        this.store.update({ phase: "noDifferences", base: { ...base, checksum }, head: { ...head, checksum }, error: null })
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
        return { requested, snapshot: status.snapshot, relation: null, staleBy: 0 }
    }
    const { nearest } = status
    return nearest ? { requested, snapshot: nearest.snapshot, relation: nearest.relation, staleBy: nearest.staleBy } : null
}

function unreadable(side: ShownSide): CompareError {
    return { kind: "loadFailed", message: `the analysis of ${side.snapshot.shortCommit ?? side.requested.shortCommit} could not be read.` }
}

function loadErrorOf(error: unknown): CompareError {
    const compareError = compareErrorOf(error)
    return compareError.kind === "coreError" ? { kind: "loadFailed", message: compareError.message } : compareError
}

function explicitIntent(folder: FolderRef, { base, head, baseMode }: TypedSides): CompareIntent {
    const side = (name: string) => ({ folder, rev: { kind: "rev" as const, name: name.trim() } })
    return { kind: "explicit", base: side(base), head: side(head), baseMode }
}

function typedSidesErrorOf(error: unknown, folder: ComparedFolder, sides: TypedSides): CompareError {
    const isUnknown = error instanceof DesktopBridgeError && (error.code === "UNKNOWN_REVISION" || error.code === "BAD_REQUEST")
    const input = (sides.unresolved[0] ?? sides.base).trim()
    return isUnknown ? { kind: "refNotFound", message: "", input, folderLabel: folder.label } : compareErrorOf(error)
}

function compareErrorOf(error: unknown): CompareError {
    if (error instanceof DesktopBridgeError && error.code === "CORE_UNAVAILABLE") {
        return { kind: "coreUnavailable", message: error.message }
    }
    return { kind: "coreError", message: (error as Error).message }
}
