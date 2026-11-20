import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { BaseMode } from "../../../model/coreApi/BaseMode"
import type { ChangedFilesParams } from "../../../model/coreApi/ChangedFilesParams"
import type { ChangedFilesResult } from "../../../model/coreApi/ChangedFilesResult"
import type { ComparedCommit } from "../../../model/coreApi/ComparedCommit"
import type { CompareIntent } from "../../../model/coreApi/CompareIntent"
import type { EnqueueResult } from "../../../model/coreApi/EnqueueResult"
import type { FetchChangeRequestHeadParams } from "../../../model/coreApi/FetchChangeRequestHeadParams"
import type { FetchedHead } from "../../../model/coreApi/FetchedHead"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { HostingOverride } from "../../../model/coreApi/HostingOverride"
import type { HostingProvider } from "../../../model/coreApi/HostingProvider"
import type { HostingStatus } from "../../../model/coreApi/HostingStatus"
import type { ResolvedComparison } from "../../../model/coreApi/ResolvedComparison"
import type { ResolvedSide } from "../../../model/coreApi/ResolvedSide"
import type { SideInput } from "../../../model/coreApi/SideInput"
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
    FetchChangeRequestHeadParams,
    FetchedHead,
    FolderRef,
    HostingOverride,
    HostingProvider,
    HostingStatus,
    ResolvedComparison,
    ResolvedSide,
    SideInput,
    SnapshotRelation,
    SnapshotSummary
}

type ComparePhase =
    | "idle"
    | "resolving"
    | "stopped"
    | "headNotLocal"
    | "fetchingHead"
    | "needsDecision"
    | "analysing"
    | "loading"
    | "active"
    | "noDifferences"
    | "failed"

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

/** What the core said about a folder's hosting: still asking, no answer it could give, or its answer. */
export type HostingCheck = { kind: "checking" } | { kind: "unsupported" } | { kind: "known"; status: HostingStatus }

/** A folder whose remote names a hosted repository of a known provider. */
export interface KnownHosting {
    provider: HostingProvider
    host: string
    repository: string | null
    remote: string
}

/** A pull or merge request being compared: what the intent needs, and where it lives on the hosting site. */
export interface ComparedChangeRequest {
    folder: FolderRef
    provider: HostingProvider
    number: number
    remote: string
    baseRefName: string
    /** On the hosting site; null when the host or repository is unknown. */
    url: string | null
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
    /** Set while a pull or merge request is compared, from the moment it was asked for. */
    changeRequest: ComparedChangeRequest | null
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
    /** The head's folder when it is another folder than `folder`. */
    headFolder?: FolderRef
}

export const IDLE_COMPARISON: CompareState = {
    phase: "idle",
    resolved: null,
    base: null,
    head: null,
    error: null,
    analyses: [],
    changedFiles: null,
    changeRequest: null
}
