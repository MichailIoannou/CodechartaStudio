import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { BaseMode } from "../../../model/coreApi/BaseMode"
import type { ChangedFilesParams } from "../../../model/coreApi/ChangedFilesParams"
import type { ChangedFilesResult } from "../../../model/coreApi/ChangedFilesResult"
import type { ComparedCommit } from "../../../model/coreApi/ComparedCommit"
import type { CompareIntent } from "../../../model/coreApi/CompareIntent"
import type { EnqueueResult } from "../../../model/coreApi/EnqueueResult"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { ResolvedComparison } from "../../../model/coreApi/ResolvedComparison"
import type { ResolvedSide } from "../../../model/coreApi/ResolvedSide"
import type { SnapshotRelation } from "../../../model/coreApi/SnapshotRelation"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"

export type {
    AnalysisJob,
    BaseMode,
    ChangedFilesParams,
    ChangedFilesResult,
    ComparedCommit,
    CompareIntent,
    EnqueueResult,
    FolderRef,
    ResolvedComparison,
    ResolvedSide,
    SnapshotRelation,
    SnapshotSummary
}

type ComparePhase = "idle" | "resolving" | "stopped" | "needsDecision" | "analysing" | "loading" | "active" | "noDifferences" | "failed"

type CompareErrorKind = "refNotFound" | "analysisCancelled" | "loadFailed" | "rootMismatch" | "coreUnavailable" | "coreError"

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
    /** Commits the asked commit has that the shown snapshot lacks, and the other way round; 0 for its own snapshot. */
    behind: number
    ahead: number
    checksum: string
}

/** The analysis of one missing side, started by "Analyse missing". */
export interface SideAnalysis {
    side: "base" | "head"
    commit: string
    shortCommit: string
    /** Null when nothing had to be queued: the commit was analysed meanwhile, or the analysis was refused. */
    jobId: string | null
    /** Why the analysis failed or was refused. */
    failure: string | null
}

/** The files git changed between the two commits: asked for once the comparison shows, never awaited. */
export type ChangedFilesState = "loading" | ChangedFilesResult | null

export interface CompareState {
    phase: ComparePhase
    resolved: ResolvedComparison | null
    base: LoadedSide | null
    head: LoadedSide | null
    error: CompareError | null
    /** The analyses of the missing sides, while they run and after one failed. */
    analyses: SideAnalysis[]
    changedFiles: ChangedFilesState
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

export const IDLE_COMPARISON: CompareState = {
    phase: "idle",
    resolved: null,
    base: null,
    head: null,
    error: null,
    analyses: [],
    changedFiles: null
}
