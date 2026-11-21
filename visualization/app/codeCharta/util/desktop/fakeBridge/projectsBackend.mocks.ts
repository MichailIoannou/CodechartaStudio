import type { Project } from "../../../model/coreApi/Project"
import type { FakeAnswer, FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeProjectsBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, nextId, now } = kit
    Object.assign(store, {
        projects: JSON.parse(JSON.stringify(kit.seed.projects ?? [])),
        activeProjectId: kit.seed.activeProjectId ?? null
    })

    function withCounts(project: Project): Project {
        const folders = project.folders.map(folder => ({
            ...folder,
            snapshotCount: kit.snapshots.snapshotsOf(project.id, folder.id).length
        }))
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
            snapshotCount: kit.snapshots.snapshotsOf(project.id).length,
            problem: null
        }
    }

    function noProject(params: FakeRequestParams) {
        return refuse("NOT_FOUND", `The fake desktop bridge has no project ${String(params.projectId)}.`)
    }

    function withProject(params: FakeRequestParams, change: (project: Project) => FakeAnswer | null) {
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        if (!project) {
            return noProject(params)
        }
        const refusal = change(project)
        project.updatedAt = now
        return refusal ?? succeed(withCounts(project))
    }

    function newProject(params: FakeRequestParams): Project {
        return {
            id: nextId("p"),
            name: params.name ?? "",
            description: params.description || null,
            createdAt: now,
            updatedAt: now,
            folders: [],
            analysisProfile: { exclude: [], without: [], parallel: true },
            view: { workingFolderId: null, shownSnapshotIdByFolder: {} }
        }
    }

    function createProject(params: FakeRequestParams) {
        const project = newProject(params)
        for (const folder of params.folders ?? []) {
            const refusal = kit.folders.attachFolder(project, folder)
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

    function leaveUnchanged() {
        return null
    }

    function getProject(params: FakeRequestParams) {
        return withProject(params, leaveUnchanged)
    }

    function deleteProject(params: FakeRequestParams) {
        const answer = getProject(params)
        store.projects = store.projects.filter(project => project.id !== params.projectId)
        store.snapshots = store.snapshots.filter(snapshot => snapshot.ref.projectId !== params.projectId)
        store.activeProjectId = store.activeProjectId === params.projectId ? null : store.activeProjectId
        return answer.ok ? succeed(null) : answer
    }

    function listProjects() {
        return succeed({ projects: store.projects.map(summaryOf) })
    }

    function getActive() {
        return succeed({ activeProjectId: store.activeProjectId })
    }

    function setActive(params: FakeRequestParams) {
        const isKnown = params.projectId === null || store.projects.some(project => project.id === params.projectId)
        store.activeProjectId = isKnown ? (params.projectId ?? null) : store.activeProjectId
        return isKnown ? succeed(null) : noProject(params)
    }

    function setView(params: FakeRequestParams) {
        const answer = withProject(params, project => {
            project.view = JSON.parse(JSON.stringify(params.view))
            return null
        })
        return answer.ok ? succeed(null) : answer
    }

    function answerNull() {
        return succeed(null)
    }

    function storeStatus() {
        return succeed({ problem: null })
    }

    kit.projects = { withProject, withCounts, createProject }

    return {
        "store.status": storeStatus,
        "projects.list": listProjects,
        "projects.get": getProject,
        "projects.create": createProject,
        "projects.update": updateProject,
        "projects.delete": deleteProject,
        "projects.getActive": getActive,
        "projects.setActive": setActive,
        "projects.setView": setView,
        "projects.readSourceFile": answerNull,
        "projects.revealFolder": answerNull
    }
}
