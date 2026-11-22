import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { BatchSelection } from "../../../model/coreApi/BatchSelection"
import type { CompareIntent } from "../../../model/coreApi/CompareIntent"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { FolderRole } from "../../../model/coreApi/FolderRole"
import type { GitAbortableOperation } from "../../../model/coreApi/GitAbortableOperation"
import type { GitCommitDetails } from "../../../model/coreApi/GitCommitDetails"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitDiff } from "../../../model/coreApi/GitDiff"
import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { GitLogParams } from "../../../model/coreApi/GitLogParams"
import type { GitPullMode } from "../../../model/coreApi/GitPullMode"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import type { GitRepositoryInfo } from "../../../model/coreApi/GitRepositoryInfo"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { GitWorkingTreeEntry } from "../../../model/coreApi/GitWorkingTreeEntry"
import type { HostingOverride } from "../../../model/coreApi/HostingOverride"
import type { JobError } from "../../../model/coreApi/JobError"
import type { JobProgress } from "../../../model/coreApi/JobProgress"
import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../../model/coreApi/PickedImportFile"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectView } from "../../../model/coreApi/ProjectView"
import type { PromptKind } from "../../../model/coreApi/PromptKind"
import type { PrunePolicy } from "../../../model/coreApi/PrunePolicy"
import type { ResolvedCommit } from "../../../model/coreApi/ResolvedCommit"
import type { SideInput } from "../../../model/coreApi/SideInput"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { UpdateProjectParams } from "../../../model/coreApi/UpdateProjectParams"
import type { BridgeMethod, CoreState, WindowState } from "../desktopBridge"

export type FakeAnswerKey =
    | BridgeMethod
    | "pickFolder"
    | "pickFile"
    | "chooseToolExecutable"
    | "chooseStoreRoot"
    | "openDroppedFile"
    | "reveal"
    | "setWindowBackground"
    | "setColorScheme"
    | "restartCore"
    | "windowState"
    | "controlWindow"
    | "setUseAppTitleBar"
    | "reopenWindow"
    | "setTitleBarColors"

export type FakeGitMethod =
    | "git.repositoryInfo"
    | "git.status"
    | "git.branches"
    | "git.refsFingerprint"
    | "git.log"
    | "git.commitDetails"
    | "git.resolveCommit"
    | "git.measureDistances"
    | "git.fetch"
    | "git.switch"
    | "git.branchCreate"
    | "git.branchRename"
    | "git.branchDelete"
    | "git.setUpstream"
    | "git.workingTree"
    | "git.diffFile"
    | "git.stage"
    | "git.unstage"
    | "git.discard"
    | "git.commit"
    | "git.isAncestor"
    | "git.pull"
    | "git.push"
    | "git.abortOperation"

/**
 * A write that does not answer at once: it reports its progress and asks its prompts under the caller's operation id,
 * then waits — for every prompt to be answered (it then answers as usual), a prompt to be cancelled
 * (`AUTHENTICATION_CANCELLED`) or the operation to be cancelled (`CANCELLED`).
 */
export interface FakeSlowOperation {
    progress?: { message: string; done: number | null; total: number | null }
    prompts?: { kind: PromptKind; message: string }[]
}

/** What the fake answers for one folder; a method without a value fails with `NOT_A_REPOSITORY`. */
export interface FakeGitRepository {
    info?: GitRepositoryInfo
    status?: GitStatus
    refs?: GitRefs
    /** Children before parents; `git.log` pages them 500 at a time. */
    commits?: GitCommitSummary[]
    /** By SHA; a listed commit without details answers its summary with no files. */
    details?: Record<string, GitCommitDetails>
    failures?: Partial<Record<FakeGitMethod, ErrorPayload>>
    /** Local branch names git refuses to delete without force. */
    unmergedBranches?: string[]
    /** What `git.fetch` reports as updated. */
    fetchedRefs?: number
    slow?: Partial<Record<FakeGitMethod, FakeSlowOperation>>
    /** The working-tree listing; once seeded, the status counts follow it. */
    changes?: GitWorkingTreeEntry[]
    areChangesTruncated?: boolean
    /** By `<kind>:<path>`; a listed row without one answers an empty diff. */
    diffs?: Record<string, GitDiff>
    /** What `git.pull` answers for a mode instead of pulling. */
    pullRefusals?: Partial<Record<GitPullMode, ErrorPayload>>
    /** The paths a merge or rebase pull stops on; the merge or rebase then stays in progress. Without them every mode moves the branch onto its upstream. */
    pullConflicts?: string[]
}

export interface FakeDesktopSeed {
    protocolVersion?: number
    coreState?: CoreState
    windowState?: Partial<WindowState>
    responses?: Partial<Record<FakeAnswerKey, unknown>>
    failures?: Partial<Record<FakeAnswerKey, ErrorPayload>>
    projects?: Project[]
    snapshots?: SnapshotSummary[]
    activeProjectId?: string | null
    pickedFolders?: PickedFolder[]
    pickedImportFile?: PickedImportFile
    snapshotMaps?: Record<string, number[]>
    /** By `<folderId>/<relativePath>`: what `projects.readSourceFile` reads; every other file is not found. */
    sourceFiles?: Record<string, string>
    /** By folder id. */
    git?: Record<string, FakeGitRepository>
    /** Shorthands for `git` with only a status or only commits. */
    gitStatuses?: Record<string, GitStatus>
    gitLogs?: Record<string, GitCommitSummary[]>
    commits?: Record<string, ResolvedCommit[]>
    analysisJobs?: AnalysisJob[]
    snapshotLogs?: Record<string, string>
    failedJobLogs?: Record<string, string>
    /** By `<folderId>/<sha or "workingTree">`; answered until an analysis of that target finishes. */
    resolutions?: Record<string, SnapshotResolution>
    now?: string
}

export interface FakeRequestParams extends Partial<UpdateProjectParams> {
    folderId?: string
    snapshotId?: string
    folders?: NewFolder[]
    folder?: NewFolder
    label?: string
    role?: FolderRole
    pickToken?: string
    view?: ProjectView
    checksum?: string
    importToken?: string
    target?: FolderRef | AnalysisTarget | string | null
    candidates?: string[]
    force?: boolean
    jobId?: string
    bindToCommit?: string | null
    toFolderId?: string
    hash?: string
    offset?: number
    length?: number
    repo?: FolderRef
    relativePath?: string
    sha?: string
    revision?: string
    scope?: GitLogParams["scope"]
    filter?: GitLogParams["filter"]
    cursor?: string | null
    intent?: CompareIntent
    shownCommit?: string | null
    promptId?: string
    name?: string
    startPoint?: string
    checkout?: boolean
    refName?: string
    newName?: string
    upstreamRefName?: string | null
    path?: string
    kind?: GitEntryKind
    paths?: string[]
    entries?: { path: string; kind: GitEntryKind; change: GitFileChange }[]
    subject?: string
    body?: string
    amend?: boolean
    ancestor?: string
    descendant?: string
    selection?: BatchSelection
    dryRun?: boolean
    batchId?: string
    policy?: PrunePolicy
    snapshotIds?: string[]
    hosting?: HostingOverride
    mode?: GitPullMode
    branchRefName?: string
    remote?: string
    setUpstream?: boolean
    forceWithLeaseExpected?: string | null
    operation?: GitAbortableOperation
}

export type FakeGitTarget =
    | { kind: "local"; refName: string; force?: boolean }
    | { kind: "trackRemote"; remoteRefName: string; localName: string }
    | { kind: "remote"; remoteRefName: string }

interface FakeHeldOperation {
    method: BridgeMethod
    params: unknown
    promptIds: Set<string>
    finish: (answer: FakeAnswer) => void
}

export type FakeAnswer = { ok: true; value: unknown } | { ok: false; error: ErrorPayload }

type FakeHandler = (params: FakeRequestParams) => FakeAnswer

export type FakeBackend = Partial<Record<FakeAnswerKey, FakeHandler>>

interface FakeStore {
    projects: Project[]
    activeProjectId: string | null
    foldersToPick: PickedFolder[]
    pickedFolders: Map<string, PickedFolder>
    snapshots: SnapshotSummary[]
    snapshotMaps: Record<string, number[]>
    sourceFiles: Record<string, string>
    commits: Record<string, ResolvedCommit[]>
    importFileToPick: PickedImportFile | null
    pickedImportFiles: Map<string, PickedImportFile>
    importedContent: Map<string, FolderRef & { snapshotId: string }>
    git: Record<string, FakeGitRepository>
    heldOperations: Map<string, FakeHeldOperation>
    jobs: AnalysisJob[]
    snapshotLogs: Record<string, string>
    failedJobLogs: Record<string, string>
    resolutions: Record<string, SnapshotResolution>
}

interface FakeProjectsApi {
    withProject(params: FakeRequestParams, change: (project: Project) => FakeAnswer | null): FakeAnswer
    withCounts(project: Project): Project
    createProject(params: FakeRequestParams): FakeAnswer
}

interface FakeFoldersApi {
    attachFolder(project: Project, folder: NewFolder): FakeAnswer | null
}

interface FakeSnapshotsApi {
    snapshotsOf(projectId: string, folderId?: string): SnapshotSummary[]
    findSnapshot(params: FakeRequestParams): SnapshotSummary | undefined
    commitOf(folderId: string, hash: string): ResolvedCommit | null
}

export type FakeGitChange = (repository: FakeGitRepository, params: FakeRequestParams) => FakeAnswer | null

interface FakeGitApi {
    answer(method: FakeGitMethod, read: (repository: FakeGitRepository, params: FakeRequestParams) => unknown): FakeHandler
    write(method: FakeGitMethod, change: FakeGitChange): FakeHandler
    announceChange(params: FakeRequestParams): void
    countChanges(repository: FakeGitRepository): void
    workingTreeOf(repository: FakeGitRepository): unknown
    reachableCommits(commits: GitCommitSummary[], tips: string[]): GitCommitSummary[]
}

export interface FakeComparedSide {
    requested: {
        folder: FolderRef
        kind: string
        commit: string | null
        shortCommit: string | null
        snapshotId: string | null
        label: { kind: string; name: string }
    }
    status: { status: string; snapshot?: SnapshotSummary; nearest?: { snapshot: SnapshotSummary } | null }
}

interface FakeCompareSidesApi {
    repositoryOf(folderId: string): FakeGitRepository | undefined
    commitsOf(folderId: string): GitCommitSummary[]
    commitAtRevision(folderId: string, revision: string): string
    reachedFrom(folderId: string, sha: string): Set<string>
    comparedSide(folder: FolderRef, revision: string): FakeComparedSide
    revisionOfTyped(folderId: string, name: string): string | null
    sideOfInput(side: SideInput): FakeComparedSide | null
    preflightOf(sides: FakeComparedSide[]): unknown
}

interface FakeOperationsApi {
    holdIfSlow(method: BridgeMethod, params: unknown, operationId: string | undefined): Promise<FakeAnswer> | null
    cancel(operationId: string): void
}

/** Ways for a test to drive the fake from outside, offered on the fake bridge itself. */
export interface FakeBridgeControls {
    startJob(jobId: string): void
    reportProgress(jobId: string, progress: JobProgress): void
    completeJob(jobId: string, snapshot?: SnapshotSummary): void
    failJob(jobId: string, error: JobError, log?: string): void
    setResolution(folder: FolderRef, target: AnalysisTarget, resolution: SnapshotResolution): void
}

interface FakeResolutionsApi {
    forget(folderId: string, target: AnalysisTarget): void
}

/** What every backend group of the fake bridge shares; each group fills in the API other groups call. */
export interface FakeBridgeKit {
    seed: FakeDesktopSeed
    store: FakeStore
    now: string
    succeed(value: unknown): FakeAnswer
    refuse(code: ErrorCode, message: string): FakeAnswer
    nextId(prefix: string): string
    emit(event: string, payload: unknown): void
    answer(method: FakeAnswerKey, params: unknown): FakeAnswer
    projects: FakeProjectsApi
    folders: FakeFoldersApi
    snapshots: FakeSnapshotsApi
    git: FakeGitApi
    compareSides: FakeCompareSidesApi
    operations?: FakeOperationsApi
    resolutions: FakeResolutionsApi
    controls: Partial<FakeBridgeControls>
}

/**
 * Rebuilt from its source text by the Playwright stand-in like the fake bridge itself: a group may use only its
 * kit, never imports or outer helpers.
 */
export type FakeBackendGroup = (kit: FakeBridgeKit) => FakeBackend
