import type { AnalysisJob } from "../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../model/coreApi/AnalysisTarget"
import type { CompareIntent } from "../../model/coreApi/CompareIntent"
import type { ErrorCode } from "../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { FolderRef } from "../../model/coreApi/FolderRef"
import type { FolderRole } from "../../model/coreApi/FolderRole"
import type { GitCommitDetails } from "../../model/coreApi/GitCommitDetails"
import type { GitCommitSummary } from "../../model/coreApi/GitCommitSummary"
import type { GitDiff } from "../../model/coreApi/GitDiff"
import type { GitEntryKind } from "../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../model/coreApi/GitFileChange"
import type { GitLogParams } from "../../model/coreApi/GitLogParams"
import type { GitRefs } from "../../model/coreApi/GitRefs"
import type { GitRepositoryInfo } from "../../model/coreApi/GitRepositoryInfo"
import type { GitStatus } from "../../model/coreApi/GitStatus"
import type { GitWorkingTreeEntry } from "../../model/coreApi/GitWorkingTreeEntry"
import type { JobError } from "../../model/coreApi/JobError"
import type { JobProgress } from "../../model/coreApi/JobProgress"
import type { NewFolder } from "../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../model/coreApi/PickedImportFile"
import type { Project } from "../../model/coreApi/Project"
import type { ProjectView } from "../../model/coreApi/ProjectView"
import type { PromptKind } from "../../model/coreApi/PromptKind"
import type { ResolvedCommit } from "../../model/coreApi/ResolvedCommit"
import type { SnapshotResolution } from "../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../model/coreApi/SnapshotSummary"
import type { UpdateProjectParams } from "../../model/coreApi/UpdateProjectParams"
import type { BridgeMethod, CoreState, DesktopBridge } from "./desktopBridge"

type FakeAnswerKey =
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

type FakeGitMethod =
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

/**
 * A write that does not answer at once: it reports its progress and asks its prompts under the caller's operation id,
 * then waits — for every prompt to be answered (it then answers as usual), a prompt to be cancelled
 * (`AUTHENTICATION_CANCELLED`) or the operation to be cancelled (`CANCELLED`).
 */
interface FakeSlowOperation {
    progress?: { message: string; done: number | null; total: number | null }
    prompts?: { kind: PromptKind; message: string }[]
}

/** What the fake answers for one folder; a method without a value fails with `NOT_A_REPOSITORY`. */
interface FakeGitRepository {
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
}

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

interface FakeCall {
    name: keyof DesktopBridge
    args: unknown[]
}

export interface FakeDesktopBridge extends DesktopBridge {
    readonly calls: FakeCall[]
    emit(event: string, payload: unknown): void
    respondWith(key: FakeAnswerKey, value: unknown): void
    failWith(key: FakeAnswerKey, error: ErrorPayload): void
    startJob(jobId: string): void
    reportProgress(jobId: string, progress: JobProgress): void
    completeJob(jobId: string, snapshot?: SnapshotSummary): void
    failJob(jobId: string, error: JobError, log?: string): void
    setResolution(folder: FolderRef, target: AnalysisTarget, resolution: SnapshotResolution): void
}

interface FakeRequestParams extends Partial<UpdateProjectParams> {
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
}

type FakeGitTarget =
    | { kind: "local"; refName: string; force?: boolean }
    | { kind: "trackRemote"; remoteRefName: string; localName: string }
    | { kind: "remote"; remoteRefName: string }

interface FakeHeldOperation {
    method: BridgeMethod
    params: unknown
    promptIds: Set<string>
    finish: (answer: FakeAnswer) => void
}

type FakeAnswer = { ok: true; value: unknown } | { ok: false; error: ErrorPayload }

/*
 * Rebuilt from this function's source text by the Playwright stand-in: keep the body free of imports and outer helpers.
 * The ignore keeps coverage counters out of that text.
 */
/* istanbul ignore next */
export function createFakeDesktopBridge(seed: FakeDesktopSeed = {}): FakeDesktopBridge {
    const FALLBACK_PROTOCOL_VERSION = 1
    const CORE_STATE_EVENT = "shell.coreState"
    const FALLBACK_NOW = "2026-01-01T00:00:00Z"
    const now = seed.now ?? FALLBACK_NOW
    const responses = { ...seed.responses }
    const failures = { ...seed.failures }
    const handlersByEvent = new Map<string, Set<(payload: unknown) => void>>()
    const calls: FakeCall[] = []
    let coreState: CoreState = seed.coreState ?? { state: "ready", message: null }
    const store = {
        projects: JSON.parse(JSON.stringify(seed.projects ?? [])) as Project[],
        snapshots: JSON.parse(JSON.stringify(seed.snapshots ?? [])) as SnapshotSummary[],
        activeProjectId: seed.activeProjectId ?? null,
        foldersToPick: [...(seed.pickedFolders ?? [])],
        pickedFolders: new Map<string, PickedFolder>(),
        importFileToPick: seed.pickedImportFile ?? null,
        pickedImportFiles: new Map<string, PickedImportFile>(),
        importedContent: new Map<string, FolderRef & { snapshotId: string }>(),
        snapshotMaps: { ...seed.snapshotMaps },
        sourceFiles: { ...seed.sourceFiles },
        git: JSON.parse(JSON.stringify(seed.git ?? {})) as Record<string, FakeGitRepository>,
        commits: { ...seed.commits },
        jobs: JSON.parse(JSON.stringify(seed.analysisJobs ?? [])) as AnalysisJob[],
        snapshotLogs: { ...seed.snapshotLogs },
        failedJobLogs: { ...seed.failedJobLogs },
        resolutions: JSON.parse(JSON.stringify(seed.resolutions ?? {})) as Record<string, SnapshotResolution>,
        heldOperations: new Map<string, FakeHeldOperation>(),
        createdIds: 0
    }
    for (const [folderId, status] of Object.entries(seed.gitStatuses ?? {})) {
        store.git[folderId] = { ...store.git[folderId], status }
    }
    for (const [folderId, commits] of Object.entries(seed.gitLogs ?? {})) {
        store.git[folderId] = { ...store.git[folderId], commits }
    }
    for (const repository of Object.values(store.git).filter(candidate => candidate.changes)) {
        countChanges(repository)
    }

    const succeed = (value: unknown): FakeAnswer => ({ ok: true, value })
    const refuse = (code: ErrorCode, message: string): FakeAnswer => ({ ok: false, error: { code, message, details: {} } })
    const missing = (key: string) => refuse("NOT_FOUND", `The fake desktop bridge has no answer for ${key}.`)

    function answerFor(key: FakeAnswerKey, fallback: () => unknown) {
        if (failures[key]) {
            return { ok: false as const, error: failures[key] }
        }
        return key in responses ? succeed(responses[key]) : fallback()
    }

    function record(name: keyof DesktopBridge, ...args: unknown[]) {
        calls.push({ name, args })
    }

    function recordAndAnswer(name: keyof DesktopBridge, key: FakeAnswerKey, fallback: () => unknown, ...args: unknown[]) {
        record(name, ...args)
        return Promise.resolve(answerFor(key, fallback))
    }

    function pick(name: "pickFolder" | "pickFile", options: unknown) {
        record(name, options)
        return Promise.resolve(name in responses ? responses[name] : null)
    }

    function nextId(prefix: string) {
        store.createdIds += 1
        return `${prefix}-${String(store.createdIds).padStart(16, "0")}`
    }

    function snapshotsOf(projectId: string, folderId?: string) {
        return store.snapshots.filter(
            snapshot => snapshot.ref.projectId === projectId && (folderId === undefined || snapshot.ref.folderId === folderId)
        )
    }

    function withCounts(project: Project): Project {
        const folders = project.folders.map(folder => ({ ...folder, snapshotCount: snapshotsOf(project.id, folder.id).length }))
        return JSON.parse(JSON.stringify({ ...project, folders }))
    }

    function summaryOf(project: Project) {
        return {
            id: project.id,
            name: project.name,
            updatedAt: project.updatedAt,
            folders: project.folders.map(({ id, label, role, kind, status }) => ({ id, label, role, kind, status })),
            folderCount: project.folders.length,
            missingFolderCount: project.folders.filter(folder => folder.status === "missing").length,
            snapshotCount: snapshotsOf(project.id).length,
            problem: null
        }
    }

    function withProject(params: FakeRequestParams, change: (project: Project) => FakeAnswer | null) {
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        if (!project) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no project ${String(params.projectId)}.`)
        }
        const refusal = change(project)
        project.updatedAt = now
        return refusal ?? succeed(withCounts(project))
    }

    function withFolder(params: FakeRequestParams, change: (project: Project, folderIndex: number) => FakeAnswer | null) {
        return withProject(params, project => {
            const folderIndex = project.folders.findIndex(folder => folder.id === params.folderId)
            return folderIndex === -1
                ? refuse("NOT_FOUND", `The project has no folder ${String(params.folderId)}.`)
                : change(project, folderIndex)
        })
    }

    function makePrimary(project: Project, folderIndex: number) {
        for (const folder of project.folders) {
            folder.role = folder.role === "primary" ? "helper" : folder.role
        }
        project.folders[folderIndex].role = "primary"
    }

    function hasLabel(project: Project, label: string, exceptFolderId?: string) {
        return project.folders.some(folder => folder.id !== exceptFolderId && folder.label.toLowerCase() === label.toLowerCase())
    }

    function refusalToAttach(project: Project, folder: NewFolder) {
        const picked = store.pickedFolders.get(folder.pickToken)
        if (!picked) {
            return refuse("TOKEN_EXPIRED", "Pick the folder again.")
        }
        if (project.folders.some(existing => existing.path === picked.path)) {
            return refuse("DUPLICATE_FOLDER", "The folder is already in the project.")
        }
        return hasLabel(project, folder.label) ? refuse("DUPLICATE_LABEL", "Another folder has this label.") : null
    }

    function attachFolder(project: Project, folder: NewFolder) {
        const refusal = refusalToAttach(project, folder)
        if (refusal) {
            return refusal
        }
        const { path, kind, git } = store.pickedFolders.get(folder.pickToken) as PickedFolder
        store.pickedFolders.delete(folder.pickToken)
        const id = nextId("f")
        const { label, role } = folder
        project.folders.push({ id, path, label, role, kind, git, addedAt: now, status: "ok", relationships: [], snapshotCount: 0 })
        if (project.folders.length === 1 || role === "primary") {
            makePrimary(project, project.folders.length - 1)
        }
        project.view.workingFolderId = project.view.workingFolderId ?? id
        return null
    }

    function createProject(params: FakeRequestParams) {
        const project: Project = {
            id: nextId("p"),
            name: params.name ?? "",
            description: params.description || null,
            createdAt: now,
            updatedAt: now,
            folders: [],
            analysisProfile: { exclude: [], without: [], parallel: true },
            view: { workingFolderId: null, shownSnapshotIdByFolder: {} }
        }
        for (const folder of params.folders ?? []) {
            const refusal = attachFolder(project, folder)
            if (refusal) {
                return refusal
            }
        }
        store.projects.push(project)
        return succeed(withCounts(project))
    }

    function updateProject(params: FakeRequestParams) {
        return withProject(params, project => {
            project.name = params.name ?? project.name
            project.description = params.description === undefined ? project.description : params.description || null
            project.analysisProfile = params.analysisProfile ?? project.analysisProfile
            return null
        })
    }

    function deleteProject(params: FakeRequestParams) {
        const answer = withProject(params, () => null)
        store.projects = store.projects.filter(project => project.id !== params.projectId)
        store.snapshots = store.snapshots.filter(snapshot => snapshot.ref.projectId !== params.projectId)
        store.activeProjectId = store.activeProjectId === params.projectId ? null : store.activeProjectId
        return answer.ok ? succeed(null) : answer
    }

    function updateFolder(params: FakeRequestParams) {
        return withFolder(params, (project, folderIndex) => {
            const folder = project.folders[folderIndex]
            if (params.label !== undefined && hasLabel(project, params.label, folder.id)) {
                return refuse("DUPLICATE_LABEL", "Another folder has this label.")
            }
            if (folder.role === "primary" && params.role !== undefined && params.role !== "primary") {
                return refuse("BAD_REQUEST", "A project keeps one primary folder.")
            }
            folder.label = params.label ?? folder.label
            if (params.role === "primary") {
                makePrimary(project, folderIndex)
            }
            folder.role = params.role ?? folder.role
            return null
        })
    }

    function removeFolder(params: FakeRequestParams) {
        return withFolder(params, (project, folderIndex) => {
            const removed = project.folders.splice(folderIndex, 1)[0]
            store.snapshots = store.snapshots.filter(
                snapshot => snapshot.ref.projectId !== project.id || snapshot.ref.folderId !== removed.id
            )
            delete project.view.shownSnapshotIdByFolder[removed.id]
            if (removed.role === "primary" && project.folders.length > 0) {
                makePrimary(project, 0)
            }
            const primary = project.folders.find(folder => folder.role === "primary")
            project.view.workingFolderId =
                project.view.workingFolderId === removed.id ? (primary?.id ?? null) : project.view.workingFolderId
            return null
        })
    }

    function relinkFolder(params: FakeRequestParams) {
        return withFolder(params, (project, folderIndex) => {
            const picked = store.pickedFolders.get(params.pickToken ?? "")
            if (!picked) {
                return refuse("TOKEN_EXPIRED", "Pick the folder again.")
            }
            store.pickedFolders.delete(picked.pickToken)
            Object.assign(project.folders[folderIndex], { path: picked.path, kind: picked.kind, git: picked.git, status: "ok" })
            return null
        })
    }

    function setActive(params: FakeRequestParams) {
        const isKnown = params.projectId === null || store.projects.some(project => project.id === params.projectId)
        store.activeProjectId = isKnown ? (params.projectId ?? null) : store.activeProjectId
        return isKnown ? succeed(null) : refuse("NOT_FOUND", `The fake desktop bridge has no project ${String(params.projectId)}.`)
    }

    function setView(params: FakeRequestParams) {
        const answer = withProject(params, project => {
            project.view = JSON.parse(JSON.stringify(params.view))
            return null
        })
        return answer.ok ? succeed(null) : answer
    }

    function pickProjectFolder() {
        const picked = store.foldersToPick.shift()
        if (picked) {
            store.pickedFolders.set(picked.pickToken, picked)
        }
        return succeed(picked ?? null)
    }

    function listSnapshots(params: FakeRequestParams) {
        const snapshots = snapshotsOf(params.projectId ?? "", params.folderId)
        snapshots.sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        return succeed({ snapshots: JSON.parse(JSON.stringify(snapshots)) })
    }

    function findSnapshot(params: FakeRequestParams) {
        return store.snapshots.find(
            snapshot =>
                snapshot.ref.projectId === params.projectId &&
                snapshot.ref.folderId === params.folderId &&
                snapshot.ref.snapshotId === params.snapshotId
        )
    }

    function deleteSnapshot(params: FakeRequestParams) {
        const snapshot = findSnapshot(params)
        if (!snapshot) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no snapshot ${String(params.snapshotId)}.`)
        }
        store.snapshots = store.snapshots.filter(candidate => candidate !== snapshot)
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        if (project?.view.shownSnapshotIdByFolder[snapshot.ref.folderId] === snapshot.ref.snapshotId) {
            delete project.view.shownSnapshotIdByFolder[snapshot.ref.folderId]
        }
        return succeed(null)
    }

    function recordMapFacts(params: FakeRequestParams) {
        const snapshot = findSnapshot(params)
        if (snapshot) {
            snapshot.checksum = params.checksum ?? null
        }
        return snapshot ? succeed(null) : refuse("NOT_FOUND", `The fake desktop bridge has no snapshot ${String(params.snapshotId)}.`)
    }

    function pickImportFile() {
        const picked = store.importFileToPick
        if (picked) {
            const { pickToken, path, suggestedName, kind, git } = picked.containingFolder
            store.pickedImportFiles.set(picked.importToken, picked)
            store.pickedFolders.set(pickToken, { pickToken, path, suggestedLabel: suggestedName, kind, git })
        }
        return succeed(picked ? JSON.parse(JSON.stringify(picked)) : null)
    }

    function commitOf(folderId: string, hash: string): ResolvedCommit | null {
        return (store.commits[folderId] ?? []).find(candidate => candidate.commit.startsWith(hash)) ?? null
    }

    function bindableCommit(file: PickedImportFile, folderId: string, bindToCommit: string): ResolvedCommit | null {
        return file.hintCommit?.commit === bindToCommit ? file.hintCommit : commitOf(folderId, bindToCommit)
    }

    function importedSnapshot(file: PickedImportFile, ref: FolderRef, commit: ResolvedCommit | null): SnapshotSummary {
        return {
            ref: { ...ref, snapshotId: nextId("imported") },
            source: "imported",
            createdAt: now,
            commit: commit?.commit ?? null,
            shortCommit: commit?.shortCommit ?? null,
            subject: commit?.subject ?? null,
            commitDate: null,
            dirty: false,
            originalFileName: file.fileName,
            fileModifiedAt: file.fileModifiedAt,
            mapBytes: file.sizeBytes,
            checksum: null,
            profileHash: null,
            target: null,
            finishedAt: null,
            durationMs: null,
            notInMap: []
        }
    }

    function importInto(file: PickedImportFile, ref: FolderRef, bindToCommit?: string | null) {
        const commit = bindToCommit ? bindableCommit(file, ref.folderId, bindToCommit) : null
        if (bindToCommit && !commit) {
            return refuse("NOT_A_COMMIT", `The folder has no commit ${bindToCommit}.`)
        }
        const contentKey = `${ref.projectId}/${file.fileName}/${file.sizeBytes}`
        const earlierImport = store.importedContent.get(contentKey) ?? file.duplicateOf
        const existing = earlierImport?.projectId === ref.projectId ? findSnapshot(earlierImport) : undefined
        store.pickedImportFiles.delete(file.importToken)
        const snapshot = existing ?? importedSnapshot(file, ref, commit)
        if (!existing) {
            store.snapshots.push(snapshot)
            store.importedContent.set(contentKey, snapshot.ref)
        }
        return succeed({ snapshot: JSON.parse(JSON.stringify(snapshot)), wasAlreadyImported: Boolean(existing) })
    }

    function openInto(file: PickedImportFile, ref: FolderRef, bindToCommit: string | null | undefined, createdProject: boolean) {
        const project = store.projects.find(candidate => candidate.id === ref.projectId)
        if (!project?.folders.some(folder => folder.id === ref.folderId)) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no folder ${String(ref.folderId)}.`)
        }
        const imported = importInto(file, ref, bindToCommit)
        return imported.ok ? succeed({ project: withCounts(project), ...(imported.value as object), createdProject }) : imported
    }

    function existingTargetOf(file: PickedImportFile): FolderRef | null {
        if (file.existingTarget) {
            return { projectId: file.existingTarget.projectId, folderId: file.existingTarget.folderId }
        }
        const project = store.projects.find(candidate => candidate.folders.some(folder => folder.path === file.containingFolder.path))
        const folder = project?.folders.find(candidate => candidate.path === file.containingFolder.path)
        return project && folder ? { projectId: project.id, folderId: folder.id } : null
    }

    function openIntoNewProject(file: PickedImportFile, bindToCommit?: string | null) {
        const { pickToken, suggestedName } = file.containingFolder
        const created = createProject({ name: suggestedName, folders: [{ pickToken, label: suggestedName, role: "primary" }] })
        if (!created.ok) {
            return created
        }
        const project = created.value as Project
        const opened = openInto(file, { projectId: project.id, folderId: project.folders[0].id }, bindToCommit, true)
        store.projects = opened.ok ? store.projects : store.projects.filter(candidate => candidate.id !== project.id)
        return opened
    }

    function openFile(params: FakeRequestParams) {
        const file = store.pickedImportFiles.get(params.importToken ?? "")
        if (!file) {
            return refuse("TOKEN_EXPIRED", "Pick the file again.")
        }
        const target = (params.target as FolderRef | null | undefined) ?? existingTargetOf(file)
        return target ? openInto(file, target, params.bindToCommit, false) : openIntoNewProject(file, params.bindToCommit)
    }

    function importSnapshot(params: FakeRequestParams) {
        const file = store.pickedImportFiles.get(params.importToken ?? "")
        if (!file) {
            return refuse("TOKEN_EXPIRED", "Pick the file again.")
        }
        const target = { projectId: params.projectId ?? "", folderId: params.folderId ?? "" }
        const opened = openInto(file, target, params.bindToCommit, false)
        return opened.ok ? succeed((opened.value as { snapshot: SnapshotSummary }).snapshot) : opened
    }

    function resolveCommit(params: FakeRequestParams) {
        return succeed({ commit: commitOf(params.folderId ?? "", params.hash ?? "") })
    }

    function moveSnapshot(params: FakeRequestParams) {
        const snapshot = findSnapshot(params)
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        const toFolderId = params.toFolderId ?? ""
        if (!(snapshot && project?.folders.some(folder => folder.id === toFolderId))) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no snapshot ${String(params.snapshotId)} or folder ${toFolderId}.`)
        }
        const commit = params.bindToCommit ? commitOf(toFolderId, params.bindToCommit) : null
        if (params.bindToCommit && !commit) {
            return refuse("NOT_A_COMMIT", `The folder has no commit ${params.bindToCommit}.`)
        }
        const fromFolderId = snapshot.ref.folderId
        const wasShown = project.view.shownSnapshotIdByFolder[fromFolderId] === snapshot.ref.snapshotId
        Object.assign(snapshot, {
            ref: { ...snapshot.ref, folderId: toFolderId, snapshotId: nextId("imported") },
            commit: commit?.commit ?? null,
            shortCommit: commit?.shortCommit ?? null,
            subject: commit?.subject ?? null
        })
        if (wasShown) {
            delete project.view.shownSnapshotIdByFolder[fromFolderId]
            project.view.shownSnapshotIdByFolder[toFolderId] = snapshot.ref.snapshotId
        }
        return succeed(JSON.parse(JSON.stringify(snapshot)))
    }

    function readMapChunk(params: FakeRequestParams) {
        const snapshotId = params.snapshotId ?? ""
        if (!Object.hasOwn(store.snapshotMaps, snapshotId)) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no map for ${snapshotId}.`)
        }
        const map = store.snapshotMaps[snapshotId]
        const offset = params.offset ?? 0
        return succeed({ bytes: new Uint8Array(map.slice(offset, offset + (params.length ?? 0))), offset, totalBytes: map.length })
    }

    function readSourceFile(params: FakeRequestParams) {
        const key = `${params.folderId}/${params.relativePath}`
        return succeed(Object.hasOwn(store.sourceFiles, key) ? { bytes: new TextEncoder().encode(store.sourceFiles[key]) } : null)
    }

    function storeUsage(params: FakeRequestParams) {
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        const folders = (project?.folders ?? []).map(folder => {
            const snapshots = snapshotsOf(project?.id ?? "", folder.id)
            const bytes = snapshots.reduce((total, snapshot) => total + snapshot.mapBytes, 0)
            return { folderId: folder.id, snapshotCount: snapshots.length, bytes }
        })
        return succeed({ totalBytes: folders.reduce((total, folder) => total + folder.bytes, 0), folders })
    }

    function gitAnswer(method: FakeGitMethod, read: (repository: FakeGitRepository, params: FakeRequestParams) => unknown) {
        return (params: FakeRequestParams): FakeAnswer => {
            const folderId = params.repo?.folderId ?? ""
            const repository = Object.hasOwn(store.git, folderId) ? store.git[folderId] : undefined
            const failure = repository?.failures?.[method]
            if (failure) {
                return { ok: false, error: failure }
            }
            const value = repository ? read(repository, params) : undefined
            if (value && typeof value === "object" && "code" in value) {
                return { ok: false, error: value as ErrorPayload }
            }
            return value === undefined
                ? refuse("NOT_A_REPOSITORY", `The fake desktop bridge has no repository for ${folderId}.`)
                : succeed(JSON.parse(JSON.stringify(value)))
        }
    }

    function reachableCommits(commits: GitCommitSummary[], tips: string[]) {
        const parentsBySha = new Map(commits.map(commit => [commit.sha, commit.parents]))
        const reached = new Set<string>()
        const waiting = [...tips]
        while (waiting.length > 0) {
            const sha = waiting.pop() as string
            if (!reached.has(sha) && parentsBySha.has(sha)) {
                reached.add(sha)
                waiting.push(...(parentsBySha.get(sha) ?? []))
            }
        }
        return commits.filter(commit => reached.has(commit.sha))
    }

    function scopedCommits(repository: FakeGitRepository, scope: FakeRequestParams["scope"]) {
        const commits = repository.commits ?? []
        if (!scope || scope.kind !== "refs") {
            return commits
        }
        const refs = repository.refs
        const tips = [...(refs?.localBranches ?? []), ...(refs?.remoteBranches ?? []), ...(refs?.tags ?? [])]
            .filter(ref => scope.refNames.includes(ref.refName))
            .map(ref => ref.commit)
        return reachableCommits(commits, tips)
    }

    function matchesLogFilter(repository: FakeGitRepository, commit: GitCommitSummary, filter: FakeRequestParams["filter"]) {
        const contains = (text: string, part: string | null | undefined) => !part || text.toLowerCase().includes(part.toLowerCase())
        const files = repository.details?.[commit.sha]?.files ?? []
        const isPathMatched = !filter?.path || files.some(file => file.path === filter.path || file.path.startsWith(`${filter.path}/`))
        return (
            contains(`${commit.subject} ${commit.sha}`, filter?.text) &&
            contains(`${commit.authorName} ${commit.authorEmail}`, filter?.author) &&
            isPathMatched
        )
    }

    function gitLogPage(repository: FakeGitRepository, params: FakeRequestParams) {
        if (!repository.commits) {
            return undefined
        }
        const pageSize = 500
        const offset = params.cursor ? Number(params.cursor.replace("page-", "")) : 0
        if (Number.isNaN(offset)) {
            return { code: "LOG_SESSION_EXPIRED", message: "The fake desktop bridge has no such log session.", details: {} }
        }
        const filter = params.filter
        const isFiltered = Boolean(filter?.text || filter?.author || filter?.path)
        const matching = scopedCommits(repository, params.scope).filter(commit => matchesLogFilter(repository, commit, filter))
        const commits = matching.slice(offset, offset + pageSize)
        const nextCursor = offset + pageSize < matching.length ? `page-${offset + pageSize}` : null
        return { commits, nextCursor, isGraphAvailable: !isFiltered }
    }

    function gitCommitDetails(repository: FakeGitRepository, params: FakeRequestParams) {
        const sha = params.sha ?? ""
        const summary = repository.commits?.find(commit => commit.sha === sha)
        if (repository.details?.[sha]) {
            return repository.details[sha]
        }
        if (!summary) {
            return { code: "UNKNOWN_REVISION", message: `The fake desktop bridge has no commit ${sha}.`, details: {} }
        }
        const noChanges = { files: [], areFilesTruncated: false, totals: { filesChanged: 0, insertions: 0, deletions: 0 } }
        const committer = { committerName: summary.authorName, committerEmail: summary.authorEmail }
        return { ...summary, ...committer, ...noChanges, message: summary.subject, comparedToParent: summary.parents[0] ?? null }
    }

    function gitDistances(repository: FakeGitRepository, params: FakeRequestParams) {
        const commits = repository.commits ?? []
        const known = new Set(commits.map(commit => commit.sha))
        const target = String(params.target ?? "")
        const reachedFromTarget = new Set(reachableCommits(commits, [target]).map(commit => commit.sha))
        const distances = (params.candidates ?? [])
            .filter(candidate => known.has(candidate))
            .map(candidate => {
                const reachedFromCandidate = new Set(reachableCommits(commits, [candidate]).map(commit => commit.sha))
                const onlyInTarget = [...reachedFromTarget].filter(sha => !reachedFromCandidate.has(sha)).length
                const onlyInCandidate = [...reachedFromCandidate].filter(sha => !reachedFromTarget.has(sha)).length
                return { sha: candidate, onlyInCandidate, onlyInTarget }
            })
        return { distances }
    }

    function gitWrite(method: FakeGitMethod, change: (repository: FakeGitRepository, params: FakeRequestParams) => FakeAnswer | null) {
        const read = gitAnswer(method, (repository, params) => {
            if (!repository.refs || !repository.status) {
                return undefined
            }
            const refusal = change(repository, params)
            if (refusal && "error" in refusal) {
                return refusal.error
            }
            repository.refs.fingerprint = `${repository.refs.fingerprint}+`
            return { status: repository.status, refs: repository.refs, message: null }
        })
        return (params: FakeRequestParams): FakeAnswer => {
            const answer = read(params)
            announceChange(params)
            return answer
        }
    }

    function announceChange(params: FakeRequestParams) {
        const repository = store.git[params.repo?.folderId ?? ""]
        if (params.repo && repository?.refs) {
            const parts = ["status", "refs", "workingTree"]
            const change = { repo: params.repo, repositoryId: repository.info?.repositoryId ?? "", parts }
            const fingerprint = repository.refs.fingerprint
            Promise.resolve().then(() => emit("repository.changed", { ...change, fingerprint }))
        }
    }

    function localBranchOf(repository: FakeGitRepository, refName: string) {
        return repository.refs?.localBranches.find(branch => branch.refName === refName)
    }

    function upstreamOf(remote: { refName: string; name: string }) {
        return { refName: remote.refName, name: remote.name, ahead: 0, behind: 0, isGone: false }
    }

    function checkOut(repository: FakeGitRepository, refName: string) {
        const refs = repository.refs
        const status = repository.status
        const branch = localBranchOf(repository, refName)
        if (!refs || !status || !branch) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no branch ${refName}.`)
        }
        for (const candidate of refs.localBranches) {
            candidate.isCurrent = candidate.refName === refName
        }
        refs.head = { kind: "branch", name: branch.name, commit: branch.commit }
        Object.assign(status, { head: refs.head, upstream: branch.upstream })
        return null
    }

    function addLocalBranch(repository: FakeGitRepository, name: string, commit: string) {
        const refs = repository.refs
        if (!refs) {
            return refuse("NOT_A_REPOSITORY", "The fake desktop bridge has no refs.")
        }
        if (refs.localBranches.some(branch => branch.name === name)) {
            return refuse("BRANCH_EXISTS", "A branch with that name already exists.")
        }
        const subject = repository.commits?.find(candidate => candidate.sha === commit)?.subject ?? ""
        refs.localBranches.push({
            refName: `refs/heads/${name}`,
            name,
            commit,
            isCurrent: false,
            upstream: null,
            checkedOutInOtherWorktree: null,
            lastCommit: { subject, committedAt: 0 }
        })
        return null
    }

    function switchBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const target = params.target as unknown as FakeGitTarget
        if (target.kind === "local") {
            return checkOut(repository, target.refName)
        }
        if (target.kind === "remote") {
            return refuse("BAD_REQUEST", "The fake desktop bridge cannot switch to that.")
        }
        const remote = repository.refs?.remoteBranches.find(branch => branch.refName === target.remoteRefName)
        if (!remote) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no branch ${target.remoteRefName}.`)
        }
        const refusal = addLocalBranch(repository, target.localName, remote.commit)
        const created = localBranchOf(repository, `refs/heads/${target.localName}`)
        if (refusal || !created) {
            return refusal
        }
        created.upstream = upstreamOf(remote)
        return checkOut(repository, created.refName)
    }

    function createBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const name = params.name ?? ""
        const refusal = addLocalBranch(repository, name, params.startPoint ?? "")
        return refusal ?? (params.checkout ? checkOut(repository, `refs/heads/${name}`) : null)
    }

    function renameBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const branch = localBranchOf(repository, params.refName ?? "")
        const newName = params.newName ?? ""
        if (!branch) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no branch ${params.refName}.`)
        }
        if (repository.refs?.localBranches.some(candidate => candidate.name === newName)) {
            return refuse("BRANCH_EXISTS", "A branch with that name already exists.")
        }
        Object.assign(branch, { name: newName, refName: `refs/heads/${newName}` })
        return branch.isCurrent ? checkOut(repository, branch.refName) : null
    }

    function deleteBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const target = params.target as unknown as FakeGitTarget
        const refs = repository.refs
        if (!refs || target.kind === "trackRemote") {
            return refuse("BAD_REQUEST", "The fake desktop bridge cannot delete that.")
        }
        if (target.kind === "remote") {
            refs.remoteBranches = refs.remoteBranches.filter(branch => branch.refName !== target.remoteRefName)
            return null
        }
        const branch = localBranchOf(repository, target.refName)
        if (branch && !target.force && repository.unmergedBranches?.includes(branch.name)) {
            return refuse("BRANCH_NOT_FULLY_MERGED", "The branch has commits that no other branch contains.")
        }
        refs.localBranches = refs.localBranches.filter(candidate => candidate.refName !== target.refName)
        return null
    }

    function setUpstream(repository: FakeGitRepository, params: FakeRequestParams) {
        const branch = localBranchOf(repository, params.refName ?? "")
        const remote = repository.refs?.remoteBranches.find(candidate => candidate.refName === params.upstreamRefName)
        if (!branch) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no branch ${params.refName}.`)
        }
        branch.upstream = remote ? upstreamOf(remote) : null
        if (branch.isCurrent && repository.status) {
            repository.status.upstream = branch.upstream
        }
        return null
    }

    function fetchAll(params: FakeRequestParams): FakeAnswer {
        const answer = gitWrite("git.fetch", () => null)(params)
        const repository = store.git[params.repo?.folderId ?? ""]
        return answer.ok ? succeed({ updatedRefs: repository?.fetchedRefs ?? 0, refs: repository?.refs }) : answer
    }

    function workingTreeOf(repository: FakeGitRepository) {
        const entries = repository.changes ?? []
        return { status: repository.status, entries, areEntriesTruncated: repository.areChangesTruncated ?? false }
    }

    function countChanges(repository: FakeGitRepository) {
        const entries = repository.changes ?? []
        const countOf = (kind: GitEntryKind) => entries.filter(entry => entry.kind === kind).length
        if (repository.status) {
            const counts = { staged: countOf("staged"), unstaged: countOf("unstaged"), untracked: countOf("untracked") }
            repository.status.counts = { ...counts, conflicted: countOf("conflicted") }
        }
    }

    function workingTreeWrite(
        method: FakeGitMethod,
        change: (repository: FakeGitRepository, params: FakeRequestParams) => FakeAnswer | null
    ) {
        const read = gitAnswer(method, (repository, params) => {
            if (!repository.status) {
                return undefined
            }
            const refusal = change(repository, params)
            if (refusal && "error" in refusal) {
                return refusal.error
            }
            countChanges(repository)
            return workingTreeOf(repository)
        })
        return (params: FakeRequestParams): FakeAnswer => {
            const answer = read(params)
            announceChange(params)
            return answer
        }
    }

    function listedEntry(repository: FakeGitRepository, path: string, kinds: GitEntryKind[]) {
        return (repository.changes ?? []).find(entry => entry.path === path && kinds.includes(entry.kind))
    }

    function moveEntry(repository: FakeGitRepository, entry: GitWorkingTreeEntry, kind: GitEntryKind, change: GitFileChange) {
        const others = (repository.changes ?? []).filter(candidate => candidate !== entry)
        const isMerged = others.some(candidate => candidate.path === entry.path && candidate.kind === kind)
        repository.changes = isMerged ? others : [...others, { ...entry, kind, change, conflict: null }]
    }

    function stageChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const target = params.target as unknown as { kind: "paths"; paths: string[] } | { kind: "all" }
        const stageable: GitEntryKind[] = ["unstaged", "untracked", "conflicted"]
        const paths =
            target.kind === "all"
                ? (repository.changes ?? []).filter(entry => stageable.includes(entry.kind)).map(entry => entry.path)
                : target.paths
        const entries = paths.map(path => listedEntry(repository, path, stageable))
        if (entries.some(entry => !entry)) {
            return refuse("CHANGED_SINCE_LISTED", "The working tree changed since it was listed.")
        }
        for (const entry of entries as GitWorkingTreeEntry[]) {
            moveEntry(repository, entry, "staged", entry.kind === "untracked" ? "added" : entry.change)
        }
        return null
    }

    function unstageChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const entries = (params.paths ?? []).map(path => listedEntry(repository, path, ["staged"]))
        if (entries.some(entry => !entry)) {
            return refuse("CHANGED_SINCE_LISTED", "The working tree changed since it was listed.")
        }
        for (const entry of entries as GitWorkingTreeEntry[]) {
            moveEntry(repository, entry, entry.change === "added" ? "untracked" : "unstaged", entry.change)
        }
        return null
    }

    function discardChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const rows = params.entries ?? []
        if (rows.some(row => row.kind === "conflicted")) {
            return refuse("NOT_ALLOWED", "A conflicted file cannot be discarded.")
        }
        const listed = rows.map(row =>
            (repository.changes ?? []).find(entry => entry.path === row.path && entry.kind === row.kind && entry.change === row.change)
        )
        if (listed.some(entry => !entry)) {
            return refuse("CHANGED_SINCE_LISTED", "The working tree changed since it was listed.")
        }
        repository.changes = (repository.changes ?? []).filter(entry => !listed.includes(entry))
        return null
    }

    function diffOf(repository: FakeGitRepository, params: FakeRequestParams) {
        const kind = params.kind ?? "unstaged"
        const path = params.path ?? ""
        if (!listedEntry(repository, path, [kind])) {
            return { code: "NOT_FOUND", message: `The fake desktop bridge lists no ${kind} ${path}.`, details: {} }
        }
        return repository.diffs?.[`${kind}:${path}`] ?? { path, text: "", isBinary: false, isTruncated: false }
    }

    function commitChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const changes = repository.changes ?? []
        const status = repository.status
        const refs = repository.refs
        const isMerging = status?.operationInProgress === "merge"
        if (changes.some(entry => entry.kind === "conflicted")) {
            return refuse("CONFLICTS", "Committing is not possible because you have unmerged files.")
        }
        if (!params.amend && !isMerging && !changes.some(entry => entry.kind === "staged")) {
            return refuse("NOTHING_TO_COMMIT", "nothing added to commit")
        }
        const head = status?.head.commit ?? null
        const replaced = params.amend ? repository.commits?.find(commit => commit.sha === head) : undefined
        const sha = nextId("commit").replace(/\D/g, "").padStart(40, "c")
        const parents = replaced ? replaced.parents : head ? [head] : []
        const authored = { authorName: "Mia Chen", authorEmail: "mia@example.com", authoredAt: 0, committedAt: 0 }
        const commit = { sha, parents, subject: params.subject ?? "", ...authored }
        repository.commits = [commit, ...(repository.commits ?? []).filter(candidate => candidate !== replaced)]
        repository.changes = changes.filter(entry => entry.kind !== "staged")
        countChanges(repository)
        if (status && refs) {
            status.head = { ...status.head, commit: sha }
            refs.head = status.head
            for (const branch of refs.localBranches.filter(candidate => candidate.isCurrent)) {
                branch.commit = sha
            }
        }
        return null
    }

    function isAncestor(repository: FakeGitRepository, params: FakeRequestParams) {
        const reached = reachableCommits(repository.commits ?? [], [params.descendant ?? ""])
        return reached.some(commit => commit.sha === params.ancestor)
    }

    function slowOperationOf(method: BridgeMethod, params: unknown) {
        const folderId = (params as FakeRequestParams | undefined)?.repo?.folderId ?? ""
        return Object.hasOwn(store.git, folderId) ? store.git[folderId].slow?.[method as FakeGitMethod] : undefined
    }

    function folderLabelOf(folderId: string) {
        const folders = store.projects.flatMap(project => project.folders)
        return folders.find(folder => folder.id === folderId)?.label ?? null
    }

    function holdOperation(method: BridgeMethod, params: FakeRequestParams, operationId: string, slow: FakeSlowOperation) {
        return new Promise<FakeAnswer>(resolve => {
            const repositoryLabel = folderLabelOf(params.repo?.folderId ?? "")
            const prompts = (slow.prompts ?? []).map(prompt => ({
                promptId: nextId("prompt"),
                requestId: operationId,
                repositoryLabel,
                ...prompt
            }))
            const promptIds = new Set(prompts.map(prompt => prompt.promptId))
            store.heldOperations.set(operationId, { method, params, promptIds, finish: resolve })
            Promise.resolve().then(() => {
                if (slow.progress) {
                    emit("core.progress", { requestId: operationId, ...slow.progress })
                }
                for (const prompt of prompts) {
                    emit("prompt.requested", prompt)
                }
            })
        })
    }

    function releaseOperation(operationId: string, answer: FakeAnswer) {
        const held = store.heldOperations.get(operationId)
        if (!held) {
            return
        }
        store.heldOperations.delete(operationId)
        for (const promptId of held.promptIds) {
            emit("prompt.closed", { promptId })
        }
        held.finish(answer)
    }

    function heldOperationOfPrompt(promptId: string) {
        return [...store.heldOperations.entries()].find(([, held]) => held.promptIds.has(promptId))
    }

    function answerPrompt(params: FakeRequestParams) {
        const promptId = params.promptId ?? ""
        const found = heldOperationOfPrompt(promptId)
        if (!found) {
            return refuse("NOT_FOUND", "The prompt is closed.")
        }
        const [operationId, held] = found
        held.promptIds.delete(promptId)
        emit("prompt.closed", { promptId })
        if (held.promptIds.size === 0) {
            releaseOperation(operationId, answerFromBackend(held.method, held.params))
        }
        return succeed(null)
    }

    function cancelPrompt(params: FakeRequestParams) {
        const found = heldOperationOfPrompt(params.promptId ?? "")
        if (!found) {
            return refuse("NOT_FOUND", "The prompt is closed.")
        }
        releaseOperation(found[0], refuse("AUTHENTICATION_CANCELLED", "The sign-in was cancelled."))
        return succeed(null)
    }

    function findJob(jobId: string) {
        return store.jobs.find(job => job.id === jobId)
    }

    function isPending(job: AnalysisJob) {
        return job.state === "queued" || job.state === "running"
    }

    function targetKeyOf(target: AnalysisTarget) {
        return target.kind === "commit" ? target.sha : "workingTree"
    }

    function announceJob(event: string, job: AnalysisJob) {
        emit(event, { job: JSON.parse(JSON.stringify(job)) })
    }

    function enqueueAnalysis(params: FakeRequestParams) {
        const target = params.target as AnalysisTarget
        const key = `${params.projectId}/${params.folderId}/${targetKeyOf(target)}`
        const queued = store.jobs.find(job => isPending(job) && `${job.projectId}/${job.folderId}/${targetKeyOf(job.target)}` === key)
        if (queued) {
            return succeed({ status: "alreadyQueued", job: JSON.parse(JSON.stringify(queued)) })
        }
        const job: AnalysisJob = {
            id: nextId("job"),
            batchId: null,
            projectId: params.projectId ?? "",
            folderId: params.folderId ?? "",
            target,
            profileHash: "0123456789abcdef",
            state: "queued",
            progress: { mode: "indeterminate" },
            queuedAt: now,
            startedAt: null,
            finishedAt: null,
            snapshotId: null,
            error: null
        }
        store.jobs.push(job)
        announceJob("analysis.queued", job)
        return succeed({ status: "queued", job: JSON.parse(JSON.stringify(job)) })
    }

    function cancelAnalysis(params: FakeRequestParams) {
        const job = findJob(params.jobId ?? "")
        if (!job) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no job ${String(params.jobId)}.`)
        }
        if (isPending(job)) {
            Object.assign(job, { state: "cancelled", finishedAt: now })
            announceJob("analysis.cancelled", job)
        }
        return succeed(null)
    }

    function clearFinishedAnalyses() {
        for (const job of store.jobs.filter(candidate => !isPending(candidate))) {
            delete store.failedJobLogs[job.id]
        }
        store.jobs = store.jobs.filter(isPending)
        return succeed(null)
    }

    function readFailedLog(params: FakeRequestParams) {
        const jobId = params.jobId ?? ""
        const isFailed = findJob(jobId)?.state === "failed"
        return isFailed && Object.hasOwn(store.failedJobLogs, jobId)
            ? succeed({ log: store.failedJobLogs[jobId] })
            : refuse("NOT_FOUND", `There is no failed analysis ${jobId}.`)
    }

    function readSnapshotLog(params: FakeRequestParams) {
        const snapshotId = params.snapshotId ?? ""
        return Object.hasOwn(store.snapshotLogs, snapshotId)
            ? succeed({ log: store.snapshotLogs[snapshotId] })
            : refuse("NOT_FOUND", `The fake desktop bridge has no log for ${snapshotId}.`)
    }

    function analysedSnapshot(job: AnalysisJob): SnapshotSummary {
        const commit = job.target.kind === "commit" ? job.target.sha : null
        return {
            ref: {
                projectId: job.projectId,
                folderId: job.folderId,
                snapshotId: commit ? `${commit}-01234567` : "worktree-20260101T000000000Z-01234567"
            },
            source: "analysed",
            createdAt: now,
            commit,
            shortCommit: commit ? commit.slice(0, 7) : null,
            subject: null,
            commitDate: null,
            dirty: commit === null,
            originalFileName: null,
            fileModifiedAt: null,
            mapBytes: 100,
            checksum: null,
            profileHash: job.profileHash,
            target: job.target.kind,
            finishedAt: now,
            durationMs: 1000,
            notInMap: []
        }
    }

    function resolutionKeyOf(folderId: string, target: AnalysisTarget) {
        return `${folderId}/${targetKeyOf(target)}`
    }

    function setResolution(folder: FolderRef, target: AnalysisTarget, resolution: SnapshotResolution) {
        store.resolutions[resolutionKeyOf(folder.folderId, target)] = JSON.parse(JSON.stringify(resolution))
    }

    function headCommitOf(folderId: string) {
        return store.git[folderId]?.status?.head.commit ?? null
    }

    function snapshotFor(snapshots: SnapshotSummary[], folderId: string, target: AnalysisTarget) {
        const workingTree = target.kind === "workingTree" ? snapshots.find(snapshot => snapshot.target === "workingTree") : undefined
        const sha = target.kind === "commit" ? target.sha : headCommitOf(folderId)
        return workingTree ?? snapshots.find(snapshot => sha !== null && snapshot.commit === sha)
    }

    function resolveForCommit(params: FakeRequestParams) {
        const folderId = params.folderId ?? ""
        const target = params.target as AnalysisTarget
        const scripted = store.resolutions[resolutionKeyOf(folderId, target)]
        if (scripted) {
            return succeed(JSON.parse(JSON.stringify(scripted)))
        }
        const snapshots = snapshotsOf(params.projectId ?? "", folderId).sort((first, second) =>
            second.createdAt.localeCompare(first.createdAt)
        )
        const folder = store.projects.find(project => project.id === params.projectId)?.folders.find(candidate => candidate.id === folderId)
        const match = snapshotFor(snapshots, folderId, target)
        if (snapshots.length === 0) {
            return succeed({ kind: "none", reason: "NO_SNAPSHOTS" })
        }
        if (folder?.kind === "plain") {
            return succeed({ kind: "latest", snapshot: JSON.parse(JSON.stringify(snapshots[0])), reason: "PLAIN_FOLDER" })
        }
        return succeed(
            match
                ? { kind: "exact", snapshot: JSON.parse(JSON.stringify(match)), isCurrentProfile: match.source === "analysed" }
                : { kind: "none", reason: "UNRELATED" }
        )
    }

    function commitAtRevision(folderId: string, revision: string) {
        const repository = Object.hasOwn(store.git, folderId) ? store.git[folderId] : undefined
        if (revision === "HEAD") {
            return repository?.status?.head.commit ?? repository?.refs?.head.commit ?? revision
        }
        const refs = repository?.refs
        const named = [...(refs?.localBranches ?? []), ...(refs?.remoteBranches ?? []), ...(refs?.tags ?? [])].find(
            ref => ref.refName === revision
        )
        return named ? named.commit : revision
    }

    function labelOfRevision(revision: string, sha: string) {
        const prefixes = [
            ["refs/heads/", "branch"],
            ["refs/remotes/", "branch"],
            ["refs/tags/", "tag"]
        ]
        const prefix = prefixes.find(([start]) => revision.startsWith(start))
        return prefix ? { kind: prefix[1], name: revision.slice(prefix[0].length) } : { kind: "commit", name: sha.slice(0, 7) }
    }

    function commitsOf(folderId: string) {
        return Object.hasOwn(store.git, folderId) ? (store.git[folderId].commits ?? []) : []
    }

    function reachedFrom(folderId: string, sha: string) {
        return new Set(reachableCommits(commitsOf(folderId), [sha]).map(commit => commit.sha))
    }

    function nearestOf(folder: FolderRef, sha: string) {
        const reached = reachedFrom(folder.folderId, sha)
        const snapshots = snapshotsOf(folder.projectId, folder.folderId)
        const ancestor = commitsOf(folder.folderId).find(
            commit => commit.sha !== sha && reached.has(commit.sha) && snapshots.some(candidate => candidate.commit === commit.sha)
        )
        if (!ancestor) {
            return null
        }
        const snapshot = snapshots.find(candidate => candidate.commit === ancestor.sha)
        const fromAncestor = reachedFrom(folder.folderId, ancestor.sha)
        const behind = [...reached].filter(reachedSha => !fromAncestor.has(reachedSha)).length
        return { snapshot: JSON.parse(JSON.stringify(snapshot)), relation: "ancestor", staleBy: behind, behind, ahead: 0 }
    }

    function comparedSide(folder: FolderRef, revision: string) {
        const sha = commitAtRevision(folder.folderId, revision)
        const snapshot = snapshotsOf(folder.projectId, folder.folderId).find(candidate => candidate.commit === sha)
        const requested = { folder, commit: sha, shortCommit: sha.slice(0, 7), label: labelOfRevision(revision, sha) }
        const status = snapshot
            ? { status: "exact", snapshot: JSON.parse(JSON.stringify(snapshot)) }
            : { status: "missing", nearest: nearestOf(folder, sha) }
        return { requested, status }
    }

    function comparedFolder(intent: CompareIntent): FolderRef {
        return intent.kind === "explicit" ? intent.base.folder : intent.folder
    }

    function revisionOfTyped(folderId: string, name: string) {
        const refs = Object.hasOwn(store.git, folderId) ? store.git[folderId].refs : undefined
        if (name === "HEAD" || name.startsWith("refs/") || /^[0-9a-f]{40}$/.test(name)) {
            return name
        }
        const named = [...(refs?.tags ?? []), ...(refs?.localBranches ?? []), ...(refs?.remoteBranches ?? [])].find(
            ref => ref.name === name
        )
        const byPrefix = commitsOf(folderId).filter(commit => /^[0-9a-f]{4,}$/i.test(name) && commit.sha.startsWith(name.toLowerCase()))
        return named?.refName ?? (byPrefix.length === 1 ? byPrefix[0].sha : null)
    }

    function branchTarget(folderId: string, branch: string, target: string | null) {
        const repository = Object.hasOwn(store.git, folderId) ? store.git[folderId] : undefined
        const current = repository?.refs?.localBranches.find(candidate => candidate.isCurrent)
        if (target) {
            return target
        }
        return current && current.refName !== branch ? current.refName : "refs/heads/main"
    }

    function comparedRevisions(intent: CompareIntent, shownCommit: string | null) {
        const folder = comparedFolder(intent)
        const commits = commitsOf(folder.folderId)
        const positionOf = (revision: string) => commits.findIndex(commit => commit.sha === commitAtRevision(folder.folderId, revision))
        switch (intent.kind) {
            case "commits":
                return positionOf(intent.b) > positionOf(intent.a) ? [intent.b, intent.a] : [intent.a, intent.b]
            case "withParent": {
                const parent = commits[positionOf(intent.commit)]?.parents[0]
                return parent ? [parent, intent.commit] : null
            }
            case "withCurrent":
                return [intent.commit, shownCommit ?? "HEAD"]
            case "branch":
                return [branchTarget(folder.folderId, intent.branch, intent.target), intent.branch]
            case "explicit":
                return [revisionOfTyped(folder.folderId, intent.base.rev.name), revisionOfTyped(folder.folderId, intent.head.rev.name)]
            default:
                return null
        }
    }

    function mergeBaseOf(folderId: string, tip: string, head: string) {
        const fromTip = reachedFrom(folderId, commitAtRevision(folderId, tip))
        const fromHead = reachedFrom(folderId, commitAtRevision(folderId, head))
        return commitsOf(folderId).find(commit => fromHead.has(commit.sha) && fromTip.has(commit.sha))?.sha ?? null
    }

    function usesMergeBase(intent: CompareIntent, base: string) {
        const isNamedRef = base.startsWith("refs/")
        return (intent.kind === "branch" || intent.kind === "explicit") && intent.baseMode === "mergeBase" && isNamedRef
    }

    function sizeVerdictOf(bytes: number) {
        const megabyte = 1024 * 1024
        if (bytes > 60 * megabyte) {
            return "block"
        }
        return bytes > 15 * megabyte ? "warn" : "ok"
    }

    function resolveComparison(params: FakeRequestParams) {
        const intent = params.intent as CompareIntent
        const folder = comparedFolder(intent)
        const revisions = comparedRevisions(intent, params.shownCommit ?? null)
        if (!revisions) {
            return refuse("UNKNOWN_REVISION", "The commit has no parent to compare with.")
        }
        if (revisions.some(revision => revision === null)) {
            return refuse("UNKNOWN_REVISION", "The revision is not in the repository.")
        }
        const [baseRevision, headRevision] = revisions as string[]
        const mergeBase = usesMergeBase(intent, baseRevision) ? mergeBaseOf(folder.folderId, baseRevision, headRevision) : null
        const isTipTheMergeBase = mergeBase === commitAtRevision(folder.folderId, baseRevision)
        const base = comparedSide(folder, mergeBase && !isTipTheMergeBase ? mergeBase : baseRevision)
        const head = comparedSide(folder, headRevision)
        const shown = [base, head].map(side =>
            side.status.status === "exact" ? (side.status.snapshot as SnapshotSummary) : (side.status.nearest?.snapshot ?? null)
        )
        const checksums = shown.map(snapshot => snapshot?.checksum ?? null)
        const combinedBytes = shown.reduce((total, snapshot) => total + (snapshot?.mapBytes ?? 0), 0)
        const isSameCommit = base.requested.commit === head.requested.commit
        return succeed({
            status: { kind: isSameCommit ? "sameCommit" : "ready" },
            origin: intent.kind === "branch" || (intent.kind === "explicit" && baseRevision.startsWith("refs/")) ? "branches" : "commits",
            baseMode: mergeBase ? "mergeBase" : "tip",
            base,
            head,
            baseTip: mergeBase ? comparedSide(folder, baseRevision).requested : null,
            preflight: {
                identicalChecksums: checksums[0] !== null && checksums[0] === checksums[1],
                profilesDiffer: false,
                combinedBytes,
                sizeVerdict: sizeVerdictOf(combinedBytes)
            }
        })
    }

    function startJob(jobId: string) {
        const job = findJob(jobId)
        if (job) {
            Object.assign(job, { state: "running", startedAt: now })
            announceJob("analysis.started", job)
        }
    }

    function reportProgress(jobId: string, progress: JobProgress) {
        const job = findJob(jobId)
        if (job) {
            job.progress = progress
            emit("analysis.progress", { jobId, progress })
        }
    }

    function completeJob(jobId: string, snapshot?: SnapshotSummary) {
        const job = findJob(jobId)
        if (!job) {
            return
        }
        const summary: SnapshotSummary = JSON.parse(JSON.stringify(snapshot ?? analysedSnapshot(job)))
        store.snapshots.push(summary)
        delete store.resolutions[resolutionKeyOf(job.folderId, job.target)]
        Object.assign(job, { state: "done", finishedAt: now, snapshotId: summary.ref.snapshotId })
        announceJob("analysis.finished", job)
        emit("snapshots.changed", { projectId: job.projectId, folderId: job.folderId })
    }

    function failJob(jobId: string, error: JobError, log?: string) {
        const job = findJob(jobId)
        if (job) {
            Object.assign(job, { state: "failed", finishedAt: now, error })
            store.failedJobLogs[jobId] = log ?? error.message
            announceJob("analysis.failed", job)
        }
    }

    const backend: Partial<Record<FakeAnswerKey, (params: FakeRequestParams) => FakeAnswer>> = {
        "store.status": () => succeed({ problem: null }),
        "projects.list": () => succeed({ projects: store.projects.map(summaryOf) }),
        "projects.get": params => withProject(params, () => null),
        "projects.create": createProject,
        "projects.update": updateProject,
        "projects.delete": deleteProject,
        "projects.addFolder": params => withProject(params, project => attachFolder(project, params.folder as NewFolder)),
        "projects.updateFolder": updateFolder,
        "projects.removeFolder": removeFolder,
        "projects.relinkFolder": relinkFolder,
        "projects.refreshFolder": params => withFolder(params, () => null),
        "projects.getActive": () => succeed({ activeProjectId: store.activeProjectId }),
        "projects.setActive": setActive,
        "projects.setView": setView,
        "projects.pickFolder": pickProjectFolder,
        "projects.readSourceFile": readSourceFile,
        "projects.revealFolder": () => succeed(null),
        "projects.resolveCommit": resolveCommit,
        "snapshots.list": listSnapshots,
        "snapshots.delete": deleteSnapshot,
        "snapshots.recordMapFacts": recordMapFacts,
        "snapshots.pickImportFile": pickImportFile,
        "snapshots.openFile": openFile,
        "snapshots.import": importSnapshot,
        "snapshots.move": moveSnapshot,
        "snapshots.readMapChunk": readMapChunk,
        "snapshots.usage": storeUsage,
        "git.repositoryInfo": gitAnswer("git.repositoryInfo", repository => repository.info),
        "git.status": gitAnswer("git.status", repository => repository.status),
        "git.branches": gitAnswer("git.branches", repository => repository.refs),
        "git.refsFingerprint": gitAnswer("git.refsFingerprint", repository => repository.refs?.fingerprint),
        "git.log": gitAnswer("git.log", gitLogPage),
        "snapshots.readLog": readSnapshotLog,
        "snapshots.resolveForCommit": resolveForCommit,
        "compare.resolve": resolveComparison,
        "analysis.preflight": () => succeed({ ok: true, problems: [] }),
        "analysis.enqueue": enqueueAnalysis,
        "analysis.cancel": cancelAnalysis,
        "analysis.list": () => succeed({ jobs: JSON.parse(JSON.stringify(store.jobs)) }),
        "analysis.clearFinished": clearFinishedAnalyses,
        "analysis.readLog": readFailedLog,
        "git.commitDetails": gitAnswer("git.commitDetails", gitCommitDetails),
        "git.measureDistances": gitAnswer("git.measureDistances", gitDistances),
        "git.resolveCommit": gitAnswer("git.resolveCommit", (repository, params) => {
            const found = repository.commits?.find(commit => commit.sha === params.revision)
            return found ?? { code: "UNKNOWN_REVISION", message: `The fake desktop bridge has no commit ${params.revision}.`, details: {} }
        }),
        "git.fetch": fetchAll,
        "git.switch": gitWrite("git.switch", switchBranch),
        "git.branchCreate": gitWrite("git.branchCreate", createBranch),
        "git.branchRename": gitWrite("git.branchRename", renameBranch),
        "git.branchDelete": gitWrite("git.branchDelete", deleteBranch),
        "git.setUpstream": gitWrite("git.setUpstream", setUpstream),
        "git.workingTree": gitAnswer("git.workingTree", repository => (repository.status ? workingTreeOf(repository) : undefined)),
        "git.diffFile": gitAnswer("git.diffFile", diffOf),
        "git.stage": workingTreeWrite("git.stage", stageChanges),
        "git.unstage": workingTreeWrite("git.unstage", unstageChanges),
        "git.discard": workingTreeWrite("git.discard", discardChanges),
        "git.commit": gitWrite("git.commit", commitChanges),
        "git.isAncestor": gitAnswer("git.isAncestor", isAncestor),
        "prompt.answer": answerPrompt,
        "prompt.cancel": cancelPrompt
    }

    function answerFromBackend(method: BridgeMethod, params: unknown) {
        const handler = backend[method]
        return handler ? handler((params ?? {}) as FakeRequestParams) : missing(method)
    }

    function handlersOf(event: string) {
        const handlers = handlersByEvent.get(event) ?? new Set<(payload: unknown) => void>()
        handlersByEvent.set(event, handlers)
        return handlers
    }

    function emit(event: string, payload: unknown) {
        if (event === CORE_STATE_EVENT) {
            coreState = payload as CoreState
        }
        for (const handler of [...handlersOf(event)]) {
            handler(payload)
        }
    }

    function subscribe(event: string, handler: (payload: unknown) => void) {
        record("subscribe", event)
        handlersOf(event).add(handler)
        if (event === CORE_STATE_EVENT) {
            const stateToReplay = coreState
            Promise.resolve().then(() => handlersOf(event).has(handler) && handler(stateToReplay))
        }
        return () => handlersOf(event).delete(handler)
    }

    return {
        calls,
        emit,
        respondWith: (key, value) => {
            delete failures[key]
            responses[key] = value
        },
        failWith: (key, error) => {
            failures[key] = error
        },
        startJob,
        reportProgress,
        completeJob,
        failJob,
        setResolution,
        protocolVersion: seed.protocolVersion ?? FALLBACK_PROTOCOL_VERSION,
        request: ((method: BridgeMethod, params: unknown, options?: { operationId?: string }) => {
            const slow = slowOperationOf(method, params)
            if (slow && options?.operationId) {
                record("request", method, params, options)
                return holdOperation(method, params as FakeRequestParams, options.operationId, slow)
            }
            return recordAndAnswer("request", method, () => answerFromBackend(method, params), method, params, options)
        }) as DesktopBridge["request"],
        cancel: operationId => {
            record("cancel", operationId)
            releaseOperation(operationId, refuse("CANCELLED", "The operation was cancelled."))
            return Promise.resolve()
        },
        subscribe: subscribe as DesktopBridge["subscribe"],
        pickFolder: options => pick("pickFolder", options),
        pickFile: options => pick("pickFile", options),
        chooseToolExecutable: (tool, options) =>
            recordAndAnswer("chooseToolExecutable", "chooseToolExecutable", () => succeed(null), tool, options),
        chooseStoreRoot: options => recordAndAnswer("chooseStoreRoot", "chooseStoreRoot", () => succeed(null), options),
        openDroppedFile: file => recordAndAnswer("openDroppedFile", "openDroppedFile", pickImportFile, file),
        reveal: target => recordAndAnswer("reveal", "reveal", () => succeed(null), target),
        setWindowBackground: color => recordAndAnswer("setWindowBackground", "setWindowBackground", () => succeed(null), color),
        setColorScheme: scheme => recordAndAnswer("setColorScheme", "setColorScheme", () => succeed(null), scheme),
        restartCore: () => recordAndAnswer("restartCore", "restartCore", () => succeed(null))
    } as FakeDesktopBridge
}
