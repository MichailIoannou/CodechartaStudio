import type { ErrorCode } from "../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { FolderRole } from "../../model/coreApi/FolderRole"
import type { NewFolder } from "../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../model/coreApi/PickedFolder"
import type { Project } from "../../model/coreApi/Project"
import type { ProjectView } from "../../model/coreApi/ProjectView"
import type { SnapshotSummary } from "../../model/coreApi/SnapshotSummary"
import type { UpdateProjectParams } from "../../model/coreApi/UpdateProjectParams"
import type { BridgeMethod, CoreState, DesktopBridge } from "./desktopBridge"

type FakeAnswerKey =
    | BridgeMethod
    | "pickFolder"
    | "pickFile"
    | "chooseToolExecutable"
    | "chooseStoreRoot"
    | "reveal"
    | "readSnapshotMap"
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
        createdIds: 0
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
        "projects.readSourceFile": () => succeed(null),
        "projects.revealFolder": () => succeed(null),
        "snapshots.list": listSnapshots,
        "snapshots.delete": deleteSnapshot,
        "snapshots.recordMapFacts": recordMapFacts
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
        protocolVersion: seed.protocolVersion ?? FALLBACK_PROTOCOL_VERSION,
        request: ((method: BridgeMethod, params: unknown, options?: unknown) =>
            recordAndAnswer(
                "request",
                method,
                () => answerFromBackend(method, params),
                method,
                params,
                options
            )) as DesktopBridge["request"],
        cancel: operationId => {
            record("cancel", operationId)
            return Promise.resolve()
        },
        subscribe: subscribe as DesktopBridge["subscribe"],
        pickFolder: options => pick("pickFolder", options),
        pickFile: options => pick("pickFile", options),
        chooseToolExecutable: (tool, options) =>
            recordAndAnswer("chooseToolExecutable", "chooseToolExecutable", () => succeed(null), tool, options),
        chooseStoreRoot: options => recordAndAnswer("chooseStoreRoot", "chooseStoreRoot", () => succeed(null), options),
        reveal: target => recordAndAnswer("reveal", "reveal", () => succeed(null), target),
        readSnapshotMap: target => recordAndAnswer("readSnapshotMap", "readSnapshotMap", () => missing("readSnapshotMap"), target),
        setWindowBackground: color => recordAndAnswer("setWindowBackground", "setWindowBackground", () => succeed(null), color),
        setColorScheme: scheme => recordAndAnswer("setColorScheme", "setColorScheme", () => succeed(null), scheme),
        restartCore: () => recordAndAnswer("restartCore", "restartCore", () => succeed(null))
    } as FakeDesktopBridge
}
