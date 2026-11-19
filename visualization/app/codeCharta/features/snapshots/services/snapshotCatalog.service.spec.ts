import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { LoadFilesUseCase } from "../../../load/load.facade"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { settle, setUpProjects } from "../../projects/projectsTestBed.mocks"
import { SnapshotCatalogService } from "./snapshotCatalog.service"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" }), aFolder("f-web", { label: "billing-web" })])
const API = aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "1111111" })
const FAILURE = { code: "IO" as const, message: "store unreadable", details: {} }

describe("SnapshotCatalogService", () => {
    it("should list the snapshots of a folder of the active project", async () => {
        // Arrange
        await setUpProjects({ projects: [BILLING], snapshots: [API], activeProjectId: "p-billing" })

        // Act
        const catalog = TestBed.inject(SnapshotCatalogService)

        // Assert
        expect(catalog.snapshots("f-api").map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-api"])
        expect(catalog.snapshots("f-unknown")).toEqual([])
    })

    it("should reload a folder's snapshots on snapshots.changed", async () => {
        // Arrange
        const { bridge } = await setUpProjects({ projects: [BILLING], snapshots: [API], activeProjectId: "p-billing" })
        const catalog = TestBed.inject(SnapshotCatalogService)
        bridge.respondWith("snapshots.list", { snapshots: [API, aSnapshot("p-billing", "f-web", "s-web")] })

        // Act
        bridge.emit("snapshots.changed", { projectId: "p-billing", folderId: "f-web" })
        await settle()

        // Assert
        expect(catalog.snapshots("f-web").map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-api", "s-web"])
    })

    it("should keep a folder's failure until a refresh succeeds", async () => {
        // Arrange
        const { bridge } = await setUpProjects({ projects: [BILLING], snapshots: [API], activeProjectId: "p-billing" })
        const catalog = TestBed.inject(SnapshotCatalogService)
        bridge.failWith("snapshots.list", FAILURE)

        // Act
        await catalog.refreshActiveProject()
        const failed = [catalog.failureOf("f-api"), catalog.failureOf("f-web")]
        bridge.respondWith("snapshots.list", { snapshots: [API] })
        await catalog.refresh({ projectId: "p-billing", folderId: "f-api" })

        // Assert
        expect(failed).toEqual(["store unreadable", "store unreadable"])
        expect(catalog.failureOf("f-api")).toBeNull()
        expect(catalog.failureOf("f-web")).toBe("store unreadable")
    })

    it("should stay empty without a bridge", () => {
        // Arrange
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: null },
                { provide: LoadFilesUseCase, useValue: {} },
                { provide: Router, useValue: {} }
            ]
        })

        // Act
        const catalog = TestBed.inject(SnapshotCatalogService)

        // Assert
        expect(catalog.snapshots("f-api")).toEqual([])
    })
})
