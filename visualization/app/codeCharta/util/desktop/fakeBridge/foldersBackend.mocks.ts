import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import type { Project } from "../../../model/coreApi/Project"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeFoldersBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, nextId, now } = kit
    Object.assign(store, { foldersToPick: [...(kit.seed.pickedFolders ?? [])], pickedFolders: new Map<string, PickedFolder>() })

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

    function withFolder(params: FakeRequestParams, change: (project: Project, folderIndex: number) => ReturnType<typeof refuse> | null) {
        return kit.projects.withProject(params, project => {
            const folderIndex = project.folders.findIndex(folder => folder.id === params.folderId)
            return folderIndex === -1
                ? refuse("NOT_FOUND", `The project has no folder ${String(params.folderId)}.`)
                : change(project, folderIndex)
        })
    }

    function addFolder(params: FakeRequestParams) {
        return kit.projects.withProject(params, project => attachFolder(project, params.folder as NewFolder))
    }

    function refusalToUpdate(project: Project, folderIndex: number, params: FakeRequestParams) {
        const folder = project.folders[folderIndex]
        if (params.label !== undefined && hasLabel(project, params.label, folder.id)) {
            return refuse("DUPLICATE_LABEL", "Another folder has this label.")
        }
        const demotesPrimary = folder.role === "primary" && params.role !== undefined && params.role !== "primary"
        return demotesPrimary ? refuse("BAD_REQUEST", "A project keeps one primary folder.") : null
    }

    function updateFolder(params: FakeRequestParams) {
        return withFolder(params, (project, folderIndex) => {
            const refusal = refusalToUpdate(project, folderIndex, params)
            if (refusal) {
                return refusal
            }
            const folder = project.folders[folderIndex]
            folder.label = params.label ?? folder.label
            if (params.role === "primary") {
                makePrimary(project, folderIndex)
            }
            folder.role = params.role ?? folder.role
            folder.hosting = params.hosting ?? folder.hosting
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

    function leaveUnchanged() {
        return null
    }

    function refreshFolder(params: FakeRequestParams) {
        return withFolder(params, leaveUnchanged)
    }

    function pickProjectFolder() {
        const picked = store.foldersToPick.shift()
        if (picked) {
            store.pickedFolders.set(picked.pickToken, picked)
        }
        return succeed(picked ?? null)
    }

    kit.folders = { attachFolder }

    return {
        "projects.addFolder": addFolder,
        "projects.updateFolder": updateFolder,
        "projects.removeFolder": removeFolder,
        "projects.relinkFolder": relinkFolder,
        "projects.refreshFolder": refreshFolder,
        "projects.pickFolder": pickProjectFolder
    }
}
