import { TestBed } from "@angular/core/testing"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { settle, setUpProjects } from "../../projects/projectsTestBed.mocks"
import { aJob, COMMIT_SHA } from "../snapshots.mocks"
import { SnapshotViewService } from "./snapshotView.service"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" }), aFolder("f-web", { label: "billing-web" })])
const API = aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "1111111" })
const FOLDER = { projectId: "p-billing", folderId: "f-api" }
const COMMIT = { kind: "commit" as const, sha: COMMIT_SHA }
const JAVA_MISSING = { code: "JAVA_NOT_FOUND" as const, severity: "error" as const, message: "Java was not found.", hint: null }

async function setUp() {
    const bed = await setUpProjects({ projects: [BILLING], snapshots: [API], activeProjectId: "p-billing" })
    const view = TestBed.inject(SnapshotViewService)
    return { ...bed, view }
}

function loadedSnapshotIds(loadProjectSnapshots: jest.Mock): string[] {
    return loadProjectSnapshots.mock.calls.flatMap(([toLoad]) => toLoad.map(entry => entry.origin.snapshotId))
}

describe("SnapshotViewService", () => {
    it("should load a snapshot and show it on the map", async () => {
        // Arrange
        const { view, loadFilesUseCase, router } = await setUp()

        // Act
        await view.open(API.ref)

        // Assert
        expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-api"])
        expect(router.navigateByUrl).toHaveBeenCalled()
    })

    it("should show the awaited analysis when it finishes in the working folder", async () => {
        // Arrange
        const { view, bridge, loadFilesUseCase, toastService } = await setUp()
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })

        // Act
        bridge.completeJob("job-0000000000000001")
        await settle()

        // Assert
        expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual([`${COMMIT_SHA}-01234567`])
        expect(toastService.show).toHaveBeenCalledWith("Showing the analysis of a1b2c3d", "success")
    })

    it("should only announce an analysis that finishes in another folder or was not asked for last", async () => {
        // Arrange
        const { view, bridge, loadFilesUseCase, toastService } = await setUp()
        await view.analyse({ folder: { ...FOLDER, folderId: "f-web" }, target: { kind: "workingTree" }, surface: "dialog" })

        // Act
        bridge.completeJob("job-0000000000000001")
        await settle()

        // Assert
        expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
        expect(toastService.show).toHaveBeenCalledWith("Analysis of the working tree finished", "success")
    })

    it("should toast a failed analysis with its message", async () => {
        // Arrange
        const { view, bridge, toastService } = await setUp()
        await view.retry(aJob("job-old", { state: "failed" }))

        // Act
        bridge.failJob("job-0000000000000001", { code: "JAVA_TOO_OLD", message: "Java 21 is too old.", hint: null })
        await settle()

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("Analysis of a1b2c3d failed: Java 21 is too old.", "error")
    })

    it("should say when an analysis is already queued", async () => {
        // Arrange
        const { view, toastService } = await setUp()
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })

        // Act
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("This analysis is already queued.", "info")
    })

    it("should open an already analysed snapshot", async () => {
        // Arrange
        const { view, bridge, loadFilesUseCase, toastService } = await setUp()
        bridge.respondWith("analysis.enqueue", { status: "alreadyAnalysed", snapshotId: "s-api" })

        // Act
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog", force: false })

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("Already analysed", "info")
        expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-api"])
    })

    it("should keep the preflight problems of a refused analysis for the surface that started it", async () => {
        // Arrange
        const { view, bridge } = await setUp()
        bridge.respondWith("analysis.enqueue", { status: "rejected", problems: [JAVA_MISSING] })

        // Act
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "status" })
        const rejected = view.rejectedRun()
        view.dismissProblems()

        // Assert
        expect(rejected).toEqual({ surface: "status", problems: [JAVA_MISSING] })
        expect(view.rejectedRun()).toBeNull()
    })

    it("should toast a request the core refuses", async () => {
        // Arrange
        const { view, bridge, toastService } = await setUp()
        bridge.failWith("analysis.enqueue", { code: "NOT_FOUND", message: "No such folder.", details: {} })
        bridge.failWith("projects.setActive", { code: "IO", message: "store gone", details: {} })

        // Act
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })
        await view.open(API.ref)

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("No such folder.", "error")
        expect(toastService.show).toHaveBeenCalledWith("store gone", "error")
    })
})
