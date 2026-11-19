import { InjectionToken } from "@angular/core"
import type { CompareIntent, FolderRef, ResolvedComparison, SnapshotSummary } from "../model/compare.model"

/** The checksums of the two maps now in the store; `base` is null when its content equals the head's and only the head was kept. */
export interface PairLoad {
    base: string | null
    head: string | null
}

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

export const SNAPSHOT_GATEWAY = new InjectionToken<SnapshotGateway>("SNAPSHOT_GATEWAY")

export const CORE_GATEWAY = new InjectionToken<CoreGateway>("CORE_GATEWAY")
