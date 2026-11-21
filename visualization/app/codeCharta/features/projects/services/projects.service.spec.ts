import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { LoadFilesUseCase, ProjectSnapshotsLoadResult, ProjectSnapshotToLoad } from "../../../load/load.facade"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { StoreFolderService } from "../../desktopTools/facade"
import { ToastService } from "../../shared/facade"
import { aFolder, aPickedFolder, aProject, aSnapshot } from "../projects.mocks"
import { ProjectFoldersService } from "./projectFolders.service"
import { ProjectsService } from "./projects.service"

const BILLING = aProject(
    "p-billing",
    [aFolder("f-api", { label: "billing-api" }), aFolder("f-web", { label: "billing-web", role: "fork" })],
    {
        name: "billing"
    }
)
const DOTFILES = aProject("p-dots", [aFolder("f-dots", { label: "dotfiles" })], { name: "dotfiles" })
const API_OLD = aSnapshot("p-billing", "f-api", "s-old", { shortCommit: "1111111", createdAt: "2026-11-01T08:00:00Z" })
const API_NEW = aSnapshot("p-billing", "f-api", "s-new", { shortCommit: "2222222", createdAt: "2026-11-02T08:00:00Z" })
const WEB = aSnapshot("p-billing", "f-web", "s-web", { shortCommit: "3333333" })

describe("ProjectsService", () => {
    let bridge: FakeDesktopBridge
    let loadFilesUseCase: { loadProjectSnapshots: jest.Mock; unloadAllFiles: jest.Mock; showSampleFiles: jest.Mock }
    let toastService: { show: jest.Mock }
    let router: { navigateByUrl: jest.Mock }

    function createService(seed: FakeDesktopSeed = {}) {
        bridge = createFakeDesktopBridge({ projects: [BILLING, DOTFILES], snapshots: [API_OLD, API_NEW, WEB], ...seed })
        loadFilesUseCase = {
            loadProjectSnapshots: jest.fn().mockImplementation((toLoad: ProjectSnapshotToLoad[]) => Promise.resolve(loadedAll(toLoad))),
            unloadAllFiles: jest.fn(),
            showSampleFiles: jest.fn()
        }
        toastService = { show: jest.fn() }
        router = { navigateByUrl: jest.fn().mockResolvedValue(true) }
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: LoadFilesUseCase, useValue: loadFilesUseCase },
                { provide: ToastService, useValue: toastService },
                { provide: Router, useValue: router }
            ]
        })
        return TestBed.inject(ProjectsService)
    }

    function projectFolders() {
        return TestBed.inject(ProjectFoldersService)
    }

    function loadedAll(toLoad: ProjectSnapshotToLoad[]): ProjectSnapshotsLoadResult {
        return {
            loaded: toLoad.map(({ origin }) => ({ origin, checksum: "c0ffee", rootName: "billing" })),
            identicalContent: [],
            unreadable: []
        }
    }

    function requestsOf(method: string) {
        return bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])
    }

    function loadedSnapshotIds() {
        return loadFilesUseCase.loadProjectSnapshots.mock.calls.map(([toLoad]) => toLoad.map(entry => entry.origin.snapshotId))
    }

    it("should expose the active project after initialise", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })

        // Act
        await service.initialise()

        // Assert
        expect(service.activeProject()?.name).toBe("billing")
        expect(service.workingFolder()?.label).toBe("billing-api")
        expect(service.projects().map(project => project.name)).toEqual(["billing", "dotfiles"])
        expect(service.snapshotsByFolder()["f-api"].map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-new", "s-old"])
        expect(service.storeProblem()).toBeNull()
    })

    it("should report the store problem", async () => {
        // Arrange
        const service = createService({ responses: { "store.status": { problem: "STORE_LOCKED" } } })

        // Act
        await service.initialise()

        // Assert
        expect(service.storeProblem()).toBe("STORE_LOCKED")
        expect(service.activeProject()).toBeNull()
    })

    it("should show the remembered snapshot of the working folder", async () => {
        // Arrange
        const remembering = { ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-old" } } }
        const service = createService({ projects: [remembering], activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        const toLoad = await service.snapshotsToShow()

        // Assert
        expect(toLoad.map(entry => [entry.displayName, entry.origin])).toEqual([
            ["billing-api@1111111", { projectId: "p-billing", folderId: "f-api", snapshotId: "s-old", folderLabel: "billing-api" }]
        ])
    })

    it("should fall back to the newest snapshot when the remembered one is gone", async () => {
        // Arrange
        const remembering = { ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-deleted" } } }
        const service = createService({ projects: [remembering], activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        const toLoad = await service.snapshotsToShow()

        // Assert
        expect(toLoad.map(entry => entry.origin.snapshotId)).toEqual(["s-new"])
    })

    it("should read the bytes of a snapshot to show through the bridge", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing", snapshotMaps: { "s-new": [31, 139] } })
        await service.initialise()
        const [toLoad] = await service.snapshotsToShow()

        // Act
        const bytes = await toLoad.readBytes()

        // Assert
        expect([...bytes]).toEqual([31, 139])
    })

    it("should toast identical content", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        const kept = { ...API_NEW.ref, folderLabel: "billing-api" }
        const dropped = { ...WEB.ref, folderLabel: "billing-web" }

        // Act
        await service.acceptLoadResult({
            loaded: [{ origin: kept, checksum: "c", rootName: "r" }],
            identicalContent: [{ kept, dropped }],
            unreadable: []
        })

        // Assert
        expect(toastService.show).toHaveBeenCalledWith(
            "billing-api@2222222 and billing-web@3333333 have identical content: no differences",
            "info"
        )
    })

    it("should record the map facts and remember the shown snapshot after a load", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        await service.showWorkingFolder()

        // Assert
        expect(requestsOf("snapshots.recordMapFacts")).toEqual([{ ...API_NEW.ref, checksum: "c0ffee", rootName: "billing" }])
        expect(requestsOf("projects.setView").at(-1)).toEqual({
            projectId: "p-billing",
            view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-new" } }
        })
        expect(service.shownSnapshot()?.ref.snapshotId).toBe("s-new")
    })

    it("should try the next snapshot when one cannot be read", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        loadFilesUseCase.loadProjectSnapshots.mockImplementationOnce((toLoad: ProjectSnapshotToLoad[]) =>
            Promise.resolve({ loaded: [], identicalContent: [], unreadable: toLoad.map(entry => entry.origin) })
        )

        // Act
        await service.showWorkingFolder()

        // Assert
        expect(loadedSnapshotIds()).toEqual([["s-new"], ["s-old"]])
        expect(toastService.show).toHaveBeenCalledWith("The analysis of 'billing-api' could not be read", "error")
        expect(service.shownSnapshot()?.ref.snapshotId).toBe("s-old")
    })

    it("should show the overview when the working folder has no analysis", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots" })
        await service.initialise()

        // Act
        await service.showWorkingFolder()

        // Assert
        expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
        expect(loadFilesUseCase.unloadAllFiles).toHaveBeenCalled()
        expect(router.navigateByUrl).toHaveBeenCalledWith("/project")
    })

    it("should switch to a folder of another project in one step", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots" })
        await service.initialise()

        // Act
        await service.chooseFolder({ projectId: "p-billing", folderId: "f-web" })

        // Assert
        expect(requestsOf("projects.setActive")).toEqual([{ projectId: "p-billing" }])
        expect(service.workingFolder()?.label).toBe("billing-web")
        expect(loadedSnapshotIds()).toEqual([["s-web"]])
        expect(service.isBusy()).toBe(false)
    })

    it("should show a given snapshot in its project and folder on the map", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots" })
        await service.initialise()

        // Act
        await service.showSnapshot(WEB.ref)

        // Assert
        expect(requestsOf("projects.setActive")).toEqual([{ projectId: "p-billing" }])
        expect(service.workingFolder()?.id).toBe("f-web")
        expect(service.shownSnapshot()?.ref).toEqual(WEB.ref)
        expect(router.navigateByUrl).toHaveBeenLastCalledWith("/")
    })

    it("should load a snapshot of the working folder without leaving the current view", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        const isLoaded = await service.loadSnapshot(API_OLD.ref)

        // Assert
        expect(isLoaded).toBe(true)
        expect(service.shownSnapshot()?.ref).toEqual(API_OLD.ref)
        expect(router.navigateByUrl).not.toHaveBeenCalled()
    })

    it("should load several snapshots in one step and show the first", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        const result = await service.loadSnapshots([API_NEW.ref, API_OLD.ref])

        // Assert
        expect(loadedSnapshotIds()).toEqual([["s-new", "s-old"]])
        expect(result.loaded.map(facts => facts.origin.snapshotId)).toEqual(["s-new", "s-old"])
        expect(service.shownSnapshot()?.ref).toEqual(API_NEW.ref)
        expect(requestsOf("snapshots.recordMapFacts")).toHaveLength(2)
        expect(toastService.show).not.toHaveBeenCalled()
    })

    it("should load nothing when a snapshot to load is not in the store", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        const unknown = { ...API_OLD.ref, snapshotId: "s-unknown" }

        // Act
        const result = await service.loadSnapshots([API_NEW.ref, unknown])

        // Assert
        expect(result).toEqual({ loaded: [], identicalContent: [], unreadable: [] })
        expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
    })

    it("should report an unreadable snapshot of several without showing it", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        loadFilesUseCase.loadProjectSnapshots.mockImplementation((toLoad: ProjectSnapshotToLoad[]) =>
            Promise.resolve({ loaded: [], identicalContent: [], unreadable: toLoad.map(({ origin }) => origin) })
        )

        // Act
        await service.loadSnapshots([API_NEW.ref])

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("The analysis of 'billing-api' could not be read", "error")
        expect(service.shownSnapshot()).toBeNull()
    })

    it("should read the folder's snapshots again before loading one it does not know yet", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        const fresh = aSnapshot("p-billing", "f-api", "s-fresh", { shortCommit: "4444444" })
        bridge.respondWith("snapshots.list", { snapshots: [fresh] })

        // Act
        const isLoaded = await service.loadSnapshot(fresh.ref)
        const isOtherFolderLoaded = await service.loadSnapshot(WEB.ref)

        // Assert
        expect(isLoaded).toBe(true)
        expect(isOtherFolderLoaded).toBe(false)
        expect(loadedSnapshotIds()).toEqual([["s-fresh"]])
    })

    it("should show the working folder when the given snapshot is not in the store", async () => {
        // Arrange
        const service = createService()

        // Act
        await service.showSnapshot({ ...WEB.ref, snapshotId: "s-gone" })

        // Assert
        expect(loadedSnapshotIds()).toEqual([["s-web"]])
        expect(service.shownSnapshot()?.ref).toEqual(WEB.ref)
    })

    it("should read the projects of the new store after the store folder changed", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        bridge.respondWith("chooseStoreRoot", { storeRoot: "/elsewhere", isDefaultStoreRoot: false, dataDir: "/data", logsDir: "/logs" })
        bridge.respondWith("projects.getActive", { activeProjectId: null })

        // Act
        await TestBed.inject(StoreFolderService).chooseFolder()
        TestBed.tick()
        await new Promise(resolve => setTimeout(resolve))

        // Assert
        expect(service.activeProject()).toBeNull()
        expect(loadFilesUseCase.unloadAllFiles).toHaveBeenCalled()
        expect(router.navigateByUrl).toHaveBeenLastCalledWith("/project")
    })

    it("should show the working folder of the active project of the new store", async () => {
        // Arrange
        const service = createService()
        bridge.respondWith("chooseStoreRoot", { storeRoot: "/elsewhere", isDefaultStoreRoot: false, dataDir: "/data", logsDir: "/logs" })
        bridge.respondWith("projects.getActive", { activeProjectId: "p-billing" })

        // Act
        await TestBed.inject(StoreFolderService).chooseFolder()
        TestBed.tick()
        await new Promise(resolve => setTimeout(resolve))

        // Assert
        expect(service.activeProject()?.id).toBe("p-billing")
        expect(loadedSnapshotIds()).toEqual([["s-new"]])
    })

    it("should do nothing when the current working folder is chosen", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        await service.chooseFolder({ projectId: "p-billing", folderId: "f-api" })

        // Assert
        expect(requestsOf("projects.setView")).toEqual([])
        expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
    })

    it("should toast and keep the previous folder when switching fails", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        bridge.failWith("projects.setView", { code: "IO", message: "disk full", details: {} })

        // Act
        await service.chooseFolder({ projectId: "p-billing", folderId: "f-web" })

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("Could not open 'billing-web': disk full", "error")
        expect(service.workingFolder()?.label).toBe("billing-api")
    })

    it("should stay silent when the core is offline", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        bridge.failWith("projects.setView", { code: "CORE_UNAVAILABLE", message: "The core is not running.", details: {} })

        // Act
        await service.chooseFolder({ projectId: "p-billing", folderId: "f-web" })

        // Assert
        expect(toastService.show).not.toHaveBeenCalled()
    })

    it("should unload the map and show the overview when the project is closed", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        await service.openProject(null)

        // Assert
        expect(requestsOf("projects.setActive")).toEqual([{ projectId: null }])
        expect(service.activeProject()).toBeNull()
        expect(loadFilesUseCase.unloadAllFiles).toHaveBeenCalled()
        expect(router.navigateByUrl).toHaveBeenCalledWith("/project")
    })

    it("should create a project from picked folders and open it", async () => {
        // Arrange
        const service = createService({ projects: [], snapshots: [], pickedFolders: [aPickedFolder("billing-api")] })
        const picked = await projectFolders().pickFolder("Add folder")

        // Act
        await service.createProject({
            name: " billing ",
            description: "",
            folders: [{ pickToken: picked?.pickToken ?? "", label: "billing-api", role: "primary" }]
        })

        // Assert
        expect(requestsOf("projects.create")[0]).toEqual({
            name: "billing",
            folders: [{ pickToken: picked?.pickToken, label: "billing-api", role: "primary" }]
        })
        expect(service.activeProject()?.name).toBe("billing")
        expect(service.projects()).toHaveLength(1)
    })

    it("should unload the map when the active project is deleted", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        await service.deleteProject("p-billing")

        // Assert
        expect(requestsOf("projects.delete")).toEqual([{ projectId: "p-billing", permanently: false }])
        expect(service.activeProject()).toBeNull()
        expect(loadFilesUseCase.unloadAllFiles).toHaveBeenCalled()
        expect(service.projects().map(project => project.name)).toEqual(["dotfiles"])
    })

    it("should show the new working folder when the working folder is removed", async () => {
        // Arrange
        const onWeb = { ...BILLING, view: { workingFolderId: "f-web", shownSnapshotIdByFolder: {} } }
        const service = createService({ projects: [onWeb], activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        await projectFolders().removeFolder("f-web")

        // Assert
        expect(requestsOf("projects.removeFolder")).toEqual([{ projectId: "p-billing", folderId: "f-web", permanently: false }])
        expect(service.workingFolder()?.label).toBe("billing-api")
        expect(loadedSnapshotIds()).toEqual([["s-new"]])
    })

    it("should update, refresh and relink folders of the active project", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing", pickedFolders: [aPickedFolder("moved")] })
        await service.initialise()
        const picked = await projectFolders().pickFolder("Re-link")

        // Act
        await projectFolders().updateFolder("f-web", { label: "web" })
        await projectFolders().refreshFolder("f-web")
        await projectFolders().relinkFolder("f-web", picked?.pickToken ?? "", true)
        await service.updateProject({ name: "invoices" })

        // Assert
        expect(service.activeProject()?.folders[1]).toEqual(expect.objectContaining({ label: "web", path: "/work/moved" }))
        expect(requestsOf("projects.relinkFolder")[0]).toEqual(expect.objectContaining({ folderId: "f-web", acceptDifferentHistory: true }))
        expect(service.projects()[0].name).toBe("invoices")
    })

    it("should add a picked folder with its suggested label and default role", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots", pickedFolders: [aPickedFolder("dotfiles-work")] })
        await service.initialise()

        // Act
        await projectFolders().addPickedFolder("Add folder")

        // Assert
        expect(requestsOf("projects.pickFolder")).toEqual([{ title: "Add folder" }])
        expect(service.activeProject()?.folders.map(folder => [folder.label, folder.role])).toEqual([
            ["dotfiles", "primary"],
            ["dotfiles-work", "helper"]
        ])
    })

    it("should do nothing when the folder pick is cancelled", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots" })
        await service.initialise()

        // Act
        await projectFolders().addPickedFolder("Add folder")

        // Assert
        expect(requestsOf("projects.addFolder")).toEqual([])
        expect(toastService.show).not.toHaveBeenCalled()
    })

    it("should say so when the picked folder is already part of the project", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots", pickedFolders: [aPickedFolder("f-dots")] })
        await service.initialise()

        // Act
        await projectFolders().addPickedFolder("Add folder")

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("'/work/f-dots' is already part of this project.", "info")
    })

    it("should toast another refusal to add a folder with its message", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots", pickedFolders: [aPickedFolder("dotfiles")] })
        await service.initialise()
        bridge.failWith("projects.addFolder", { code: "DUPLICATE_LABEL", message: "Another folder is called dotfiles.", details: {} })

        // Act
        await projectFolders().addPickedFolder("Add folder")

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("Another folder is called dotfiles.", "error")
    })

    it("should toast a folder picker that fails", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots" })
        await service.initialise()
        bridge.failWith("projects.pickFolder", { code: "BAD_REQUEST", message: "bad title", details: {} })

        // Act
        await projectFolders().addPickedFolder("Add folder")

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("bad title", "error")
    })

    it("should reveal the store folder and toast when it cannot", async () => {
        // Arrange
        createService()
        await projectFolders().revealStoreFolder()
        bridge.failWith("reveal", { code: "IO", message: "no file manager", details: {} })

        // Act
        await projectFolders().revealStoreFolder()

        // Assert
        expect(bridge.calls.filter(call => call.name === "reveal").map(call => call.args[0])).toEqual([
            { kind: "storeRoot" },
            { kind: "storeRoot" }
        ])
        expect(toastService.show).toHaveBeenCalledTimes(1)
    })

    it("should toast a folder that cannot be revealed", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        bridge.failWith("projects.revealFolder", { code: "IO", message: "no file manager", details: {} })

        // Act
        await projectFolders().revealFolder("f-api")

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("no file manager", "error")
    })

    it("should read the store usage of the active project", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        const before = await service.readStoreUsage()
        await service.initialise()

        // Act
        const usage = await service.readStoreUsage()

        // Assert
        expect(before).toBeNull()
        expect(usage?.totalBytes).toBe(3 * API_NEW.mapBytes)
    })

    it("should re-read the snapshots of one folder of the active project and ignore other projects", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        await bridge.request("snapshots.delete", { ...API_OLD.ref, permanently: false })
        await bridge.request("snapshots.delete", { ...WEB.ref, permanently: false })

        // Act
        await service.refreshFolderSnapshots({ projectId: "p-billing", folderId: "f-api" })
        await service.refreshFolderSnapshots({ projectId: "p-dots", folderId: "f-dots" })

        // Assert
        expect(service.snapshotsByFolder()["f-api"].map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-new"])
        expect(service.snapshotsByFolder()["f-web"].map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-web"])
        expect(requestsOf("snapshots.list")).not.toContainEqual({ projectId: "p-dots", folderId: "f-dots" })
    })

    it("should reload the shown snapshot with the default metrics after a reset", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()

        // Act
        await service.reloadAfterReset()

        // Assert
        expect(loadedSnapshotIds()).toEqual([["s-new"]])
        expect(loadFilesUseCase.loadProjectSnapshots.mock.calls[0][1]).toEqual({ discardMetricSelection: true })
    })

    it("should unload the map after a reset when the working folder has nothing to show", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-dots" })
        await service.initialise()

        // Act
        await service.reloadAfterReset()

        // Assert
        expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
        expect(loadFilesUseCase.unloadAllFiles).toHaveBeenCalled()
    })

    it("should go on with the next snapshot when the reset reload cannot read the shown one", async () => {
        // Arrange
        const service = createService({ activeProjectId: "p-billing" })
        await service.initialise()
        loadFilesUseCase.loadProjectSnapshots.mockImplementationOnce((toLoad: ProjectSnapshotToLoad[]) =>
            Promise.resolve({ loaded: [], identicalContent: [], unreadable: toLoad.map(entry => entry.origin) })
        )

        // Act
        await service.reloadAfterReset()

        // Assert
        expect(loadedSnapshotIds()).toEqual([["s-new"], ["s-old"]])
    })

    it("should show the sample maps on the metric view", () => {
        // Arrange
        const service = createService()

        // Act
        service.showSampleFiles()

        // Assert
        expect(loadFilesUseCase.showSampleFiles).toHaveBeenCalled()
        expect(router.navigateByUrl).toHaveBeenCalledWith("/")
    })
})
