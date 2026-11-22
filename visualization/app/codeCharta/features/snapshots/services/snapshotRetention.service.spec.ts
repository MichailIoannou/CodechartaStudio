import { TestBed } from "@angular/core/testing"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { PrunePlan } from "../../../model/coreApi/PrunePlan"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { ProjectsTestBed, setUpProjects } from "../../projects/projectsTestBed.mocks"
import { SnapshotRetentionService } from "./snapshotRetention.service"

const FOLDER = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], {
    view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-shown" } }
})
const SHOWN = aSnapshot("p-billing", "f-api", "s-shown", { target: "commit", finishedAt: "2026-11-05T00:00:00Z" })
const OLD = aSnapshot("p-billing", "f-api", "s-old", { target: "commit", finishedAt: "2026-11-01T00:00:00Z" })
const OLDER = aSnapshot("p-billing", "f-api", "s-older", { target: "commit", finishedAt: "2026-10-01T00:00:00Z" })

describe("SnapshotRetentionService", () => {
    let testBed: ProjectsTestBed

    async function createService() {
        testBed = await setUpProjects({ projects: [BILLING], activeProjectId: "p-billing", snapshots: [SHOWN, OLD, OLDER] })
        await testBed.projects.showWorkingFolder()
        testBed.toastService.show.mockClear()
        return TestBed.inject(SnapshotRetentionService)
    }

    function failWith(method: "snapshots.delete" | "snapshots.prune", code: ErrorCode, message = "The recycle bin is not available.") {
        testBed.bridge.failWith(method, { code, message, details: {} })
    }

    function planOf(...snapshots: (typeof OLD)[]): PrunePlan {
        return { delete: snapshots, keep: 1, freedBytes: snapshots.reduce((total, snapshot) => total + snapshot.mapBytes, 0) }
    }

    it("should measure the store of a project", async () => {
        // Arrange
        const service = await createService()

        // Act
        const usage = await service.usage("p-billing")

        // Assert
        expect(usage.totalBytes).toBe(3 * OLD.mapBytes)
    })

    it("should move a snapshot to the recycle bin and say when it was the one in the map", async () => {
        // Arrange
        const service = await createService()

        // Act
        await service.delete(OLD)
        const toastsForOld = testBed.toastService.show.mock.calls.length
        await service.delete(SHOWN)

        // Assert
        expect(testBed.requestsOf("snapshots.delete")).toEqual([
            { ...OLD.ref, permanently: false },
            { ...SHOWN.ref, permanently: false }
        ])
        expect(toastsForOld).toBe(0)
        expect(testBed.toastService.show).toHaveBeenCalledWith(
            "The analysis shown in the map was deleted; it stays visible until you open another.",
            "info"
        )
    })

    it("should warn when the analysis is still being written", async () => {
        // Arrange
        const service = await createService()
        failWith("snapshots.delete", "SNAPSHOT_BEING_WRITTEN", "busy")

        // Act
        await service.delete(OLD)

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith(
            "This analysis is still being written. Try again when it has finished.",
            "warning"
        )
    })

    it("should report a failing recycle bin with its details and never delete permanently", async () => {
        // Arrange
        const service = await createService()
        failWith("snapshots.delete", "RECYCLE_FAILED")

        // Act
        await service.delete(OLD)

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith(
            "Could not move the analysis to the recycle bin. Nothing was deleted.",
            "error",
            {
                details: "The recycle bin is not available."
            }
        )
        expect(testBed.requestsOf("snapshots.delete")).toEqual([{ ...OLD.ref, permanently: false }])
    })

    it("should toast any other failure of a delete", async () => {
        // Arrange
        const service = await createService()
        failWith("snapshots.delete", "IO", "disk gone")

        // Act
        await service.delete(OLD)

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith("disk gone", "error")
    })

    it("should plan a clean-up and move what it lists to the recycle bin", async () => {
        // Arrange
        const service = await createService()
        const policy = { keepNewestCommitSnapshots: 1, keepNewestWorkingTreeSnapshots: 0, keepBranchTipsAndTags: false }

        // Act
        const plan = await service.planPrune(FOLDER, policy)
        const outcome = await service.prune(FOLDER, plan)

        // Assert
        expect(plan.delete.map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-old", "s-older"])
        expect(outcome).toBe("pruned")
        expect(testBed.requestsOf("snapshots.prune")).toEqual([{ ...FOLDER, snapshotIds: ["s-old", "s-older"], permanently: false }])
        expect(testBed.toastService.show).toHaveBeenCalledWith("Moved 2 analyses (2.0 kB) to the recycle bin.", "success")
    })

    it("should say how much of a clean-up was moved before the recycle bin failed", async () => {
        // Arrange
        const service = await createService()
        const plan = planOf(OLD, OLDER)
        testBed.bridge.respondWith("snapshots.list", { snapshots: [SHOWN, OLDER] })
        failWith("snapshots.prune", "RECYCLE_FAILED")

        // Act
        const outcome = await service.prune(FOLDER, plan)

        // Assert
        expect(outcome).toBe("recycleFailed")
        expect(testBed.toastService.show).toHaveBeenCalledWith("Moved 1 of 2 analyses to the recycle bin; the rest were kept.", "warning", {
            details: "The recycle bin is not available."
        })
    })

    it("should hand any other failure of a clean-up to the dialog", async () => {
        // Arrange
        const service = await createService()
        failWith("snapshots.prune", "SNAPSHOT_BEING_WRITTEN", "An analysis is still being written.")

        // Act
        const pruning = service.prune(FOLDER, planOf(OLD))

        // Assert
        await expect(pruning).rejects.toThrow("An analysis is still being written.")
    })
})
