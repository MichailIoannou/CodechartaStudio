import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { FolderRole } from "../../../model/coreApi/FolderRole"
import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../../model/coreApi/PickedImportFile"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectView } from "../../../model/coreApi/ProjectView"
import type { ResolvedCommit } from "../../../model/coreApi/ResolvedCommit"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { UpdateProjectParams } from "../../../model/coreApi/UpdateProjectParams"
import type { BridgeMethod, CoreState } from "../desktopBridge"

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

export interface FakeDesktopSeed {
    protocolVersion?: number
    coreState?: CoreState
    responses?: Partial<Record<FakeAnswerKey, unknown>>
    failures?: Partial<Record<FakeAnswerKey, ErrorPayload>>
    projects?: Project[]
    snapshots?: SnapshotSummary[]
    activeProjectId?: string | null
    pickedFolders?: PickedFolder[]
    pickedImportFile?: PickedImportFile
    snapshotMaps?: Record<string, number[]>
    commits?: Record<string, ResolvedCommit[]>
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
    target?: FolderRef | null
    bindToCommit?: string | null
    toFolderId?: string
    hash?: string
    offset?: number
    length?: number
}

export type FakeAnswer = { ok: true; value: unknown } | { ok: false; error: ErrorPayload }

export type FakeHandler = (params: FakeRequestParams) => FakeAnswer

export type FakeBackend = Partial<Record<FakeAnswerKey, FakeHandler>>

export interface FakeStore {
    projects: Project[]
    activeProjectId: string | null
    foldersToPick: PickedFolder[]
    pickedFolders: Map<string, PickedFolder>
    snapshots: SnapshotSummary[]
    snapshotMaps: Record<string, number[]>
    commits: Record<string, ResolvedCommit[]>
    importFileToPick: PickedImportFile | null
    pickedImportFiles: Map<string, PickedImportFile>
    importedContent: Map<string, FolderRef & { snapshotId: string }>
}

export interface FakeProjectsApi {
    withProject(params: FakeRequestParams, change: (project: Project) => FakeAnswer | null): FakeAnswer
    withCounts(project: Project): Project
    createProject(params: FakeRequestParams): FakeAnswer
}

export interface FakeFoldersApi {
    attachFolder(project: Project, folder: NewFolder): FakeAnswer | null
}

export interface FakeSnapshotsApi {
    snapshotsOf(projectId: string, folderId?: string): SnapshotSummary[]
    findSnapshot(params: FakeRequestParams): SnapshotSummary | undefined
    commitOf(folderId: string, hash: string): ResolvedCommit | null
}

/** What every backend group of the fake bridge shares; each group fills in the API other groups call. */
export interface FakeBridgeKit {
    seed: FakeDesktopSeed
    store: FakeStore
    now: string
    succeed(value: unknown): FakeAnswer
    refuse(code: ErrorCode, message: string): FakeAnswer
    nextId(prefix: string): string
    projects: FakeProjectsApi
    folders: FakeFoldersApi
    snapshots: FakeSnapshotsApi
}

/**
 * Rebuilt from its source text by the Playwright stand-in like the fake bridge itself: a group may use only its
 * kit, never imports or outer helpers.
 */
export type FakeBackendGroup = (kit: FakeBridgeKit) => FakeBackend
