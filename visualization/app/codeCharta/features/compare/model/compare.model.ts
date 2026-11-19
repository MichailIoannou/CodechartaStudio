import type { BaseMode } from "../../../model/coreApi/BaseMode"
import type { ComparedCommit } from "../../../model/coreApi/ComparedCommit"
import type { CompareIntent } from "../../../model/coreApi/CompareIntent"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { ResolvedComparison } from "../../../model/coreApi/ResolvedComparison"
import type { ResolvedSide } from "../../../model/coreApi/ResolvedSide"
import type { SnapshotRelation } from "../../../model/coreApi/SnapshotRelation"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"

export type { BaseMode, ComparedCommit, CompareIntent, FolderRef, ResolvedComparison, ResolvedSide, SnapshotSummary }

type ComparePhase = "idle" | "resolving" | "stopped" | "needsDecision" | "loading" | "active" | "noDifferences" | "failed"

type CompareErrorKind = "refNotFound" | "loadFailed" | "rootMismatch" | "coreUnavailable" | "coreError"

export interface CompareError {
    kind: CompareErrorKind
    message: string
    /** What the user typed and the folder it was looked up in, for `refNotFound`. */
    input?: string
    folderLabel?: string
}

export interface LoadedSide {
    requested: ComparedCommit
    snapshot: SnapshotSummary
    /** How the shown snapshot relates to the requested commit when it is the nearest one, else null. */
    relation: SnapshotRelation | null
    staleBy: number
    checksum: string
}

export interface CompareState {
    phase: ComparePhase
    resolved: ResolvedComparison | null
    base: LoadedSide | null
    head: LoadedSide | null
    error: CompareError | null
}

/** The checksums of the two maps now in the store; `base` is null when its content equals the head's and only the head was kept. */
export interface PairLoad {
    base: string | null
    head: string | null
}

export interface ComparePrefill {
    folder?: FolderRef
    base?: string
    head?: string
}

export const IDLE_COMPARISON: CompareState = { phase: "idle", resolved: null, base: null, head: null, error: null }
