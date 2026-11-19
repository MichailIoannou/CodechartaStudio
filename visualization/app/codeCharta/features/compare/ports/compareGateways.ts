import { InjectionToken, inject, Signal } from "@angular/core"
import { AnalysisGatewayAdapter } from "../adapters/analysisGateway.adapter"
import { CoreGatewayAdapter } from "../adapters/coreGateway.adapter"
import { SnapshotGatewayAdapter } from "../adapters/snapshotGateway.adapter"
import type {
    AnalysisJob,
    CompareIntent,
    EnqueueResult,
    FolderRef,
    PairLoad,
    ResolvedComparison,
    SnapshotSummary
} from "../model/compare.model"

export interface SnapshotGateway {
    /** Replaces the loaded maps with the two snapshots in one step. */
    loadPair(base: SnapshotSummary, head: SnapshotSummary): Promise<PairLoad>
    /** Replaces the loaded maps with the head alone; the checksum of the loaded map, or null when it could not be read. */
    loadAlone(head: SnapshotSummary): Promise<string | null>
    /** The commit of the snapshot on the map, for "compare with current". */
    shownCommit(): string | null
    /** Keeps what the map shows until the comparison loads: no resolution of the snapshot view may replace it meanwhile. */
    holdMap(): void
}

export interface AnalysisGateway {
    /** The core's analysis queue, kept current by its events. */
    readonly jobs: Signal<readonly AnalysisJob[]>
    enqueue(folder: FolderRef, commit: string): Promise<EnqueueResult>
    cancel(jobId: string): Promise<void>
}

export interface CoreGateway {
    resolve(intent: CompareIntent, shownCommit: string | null): Promise<ResolvedComparison>
}

export const SNAPSHOT_GATEWAY = new InjectionToken<SnapshotGateway>("SNAPSHOT_GATEWAY", {
    providedIn: "root",
    factory: () => inject(SnapshotGatewayAdapter)
})

export const ANALYSIS_GATEWAY = new InjectionToken<AnalysisGateway>("ANALYSIS_GATEWAY", {
    providedIn: "root",
    factory: () => inject(AnalysisGatewayAdapter)
})

export const CORE_GATEWAY = new InjectionToken<CoreGateway>("CORE_GATEWAY", {
    providedIn: "root",
    factory: () => inject(CoreGatewayAdapter)
})
