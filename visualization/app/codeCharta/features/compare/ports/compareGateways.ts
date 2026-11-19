import { InjectionToken, inject } from "@angular/core"
import { CoreGatewayAdapter } from "../adapters/coreGateway.adapter"
import { SnapshotGatewayAdapter } from "../adapters/snapshotGateway.adapter"
import type { CompareIntent, FolderRef, PairLoad, ResolvedComparison, SnapshotSummary } from "../model/compare.model"

export interface SnapshotGateway {
    /** Replaces the loaded maps with the two snapshots in one step. */
    loadPair(base: SnapshotSummary, head: SnapshotSummary): Promise<PairLoad>
    /** Replaces the loaded maps with the head alone; the checksum of the loaded map, or null when it could not be read. */
    loadAlone(head: SnapshotSummary): Promise<string | null>
    /** The commit of the snapshot on the map, for "compare with current". */
    shownCommit(): string | null
}

export interface CoreGateway {
    resolve(intent: CompareIntent, shownCommit: string | null): Promise<ResolvedComparison>
    /** A branch, tag, `HEAD` or commit (prefix) as a revision the core accepts, or null when the folder has no such ref. */
    toRevision(folder: FolderRef, input: string): Promise<string | null>
}

export const SNAPSHOT_GATEWAY = new InjectionToken<SnapshotGateway>("SNAPSHOT_GATEWAY", {
    providedIn: "root",
    factory: () => inject(SnapshotGatewayAdapter)
})

export const CORE_GATEWAY = new InjectionToken<CoreGateway>("CORE_GATEWAY", {
    providedIn: "root",
    factory: () => inject(CoreGatewayAdapter)
})
