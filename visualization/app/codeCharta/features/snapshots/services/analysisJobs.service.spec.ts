import { TestBed } from "@angular/core/testing"
import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { settle } from "../../projects/projectsTestBed.mocks"
import { aJob, COMMIT_SHA } from "../snapshots.mocks"
import { AnalysisJobsService } from "./analysisJobs.service"

const FOLDER = { projectId: "p-billing", folderId: "f-api" }

describe("AnalysisJobsService", () => {
    let bridge: FakeDesktopBridge

    async function createService(seed: FakeDesktopSeed = {}) {
        bridge = createFakeDesktopBridge(seed)
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }] })
        const service = TestBed.inject(AnalysisJobsService)
        await settle()
        return service
    }

    it("should load jobs on start", async () => {
        // Arrange
        const seeded = aJob("job-1", { state: "running" })

        // Act
        const service = await createService({ analysisJobs: [seeded] })

        // Assert
        expect(service.jobs()).toEqual([seeded])
    })

    it("should apply notifications", async () => {
        // Arrange
        const service = await createService()
        const outcomes: AnalysisJob[] = []
        service.outcomes$.subscribe(job => outcomes.push(job))
        const result = await service.enqueue(FOLDER, { kind: "commit", sha: COMMIT_SHA })
        const jobId = result.status === "queued" ? result.job.id : ""

        // Act
        bridge.startJob(jobId)
        bridge.reportProgress(jobId, { mode: "determinate", percent: 42 })
        const running = service.jobs()[0]
        bridge.completeJob(jobId)

        // Assert
        expect(running).toMatchObject({ state: "running", progress: { mode: "determinate", percent: 42 } })
        expect(service.jobs()).toHaveLength(1)
        expect(service.jobs()[0]).toMatchObject({ state: "done", snapshotId: `${COMMIT_SHA}-01234567` })
        expect(outcomes.map(job => job.state)).toEqual(["done"])
    })

    it("should report a failed job as an outcome and read its log", async () => {
        // Arrange
        const service = await createService({ analysisJobs: [aJob("job-1", { state: "running" })] })
        const outcomes: AnalysisJob[] = []
        service.outcomes$.subscribe(job => outcomes.push(job))

        // Act
        bridge.failJob("job-1", { code: "JAVA_TOO_OLD", message: "Java 21 is too old.", hint: null }, "java 21")
        const log = await service.readLog("job-1")

        // Assert
        expect(outcomes.map(job => job.state)).toEqual(["failed"])
        expect(log).toBe("java 21")
    })

    it("should cancel a job and clear the finished ones", async () => {
        // Arrange
        const service = await createService({ analysisJobs: [aJob("job-1"), aJob("job-2", { state: "done" })] })

        // Act
        await service.cancel("job-1")
        const afterCancel = service.jobs().map(job => job.state)
        await service.clearFinished()

        // Assert
        expect(afterCancel).toEqual(["cancelled", "done"])
        expect(service.jobs()).toEqual([])
    })

    it("should reload the jobs when the core is ready again", async () => {
        // Arrange
        const service = await createService({ analysisJobs: [aJob("job-1")] })
        bridge.respondWith("analysis.list", { jobs: [] })

        // Act
        bridge.emit("shell.coreState", { state: "restarting", message: null })
        await settle()
        bridge.emit("shell.coreState", { state: "ready", message: null })
        await settle()

        // Assert
        expect(service.jobs()).toEqual([])
    })

    it("should stay empty without a bridge", async () => {
        // Arrange
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: null }] })

        // Act
        const service = TestBed.inject(AnalysisJobsService)
        await settle()

        // Assert
        expect(service.jobs()).toEqual([])
    })

    it("should stop listening when destroyed", async () => {
        // Arrange
        const service = await createService()

        // Act
        TestBed.resetTestingModule()
        bridge.emit("analysis.queued", { job: aJob("job-1") })

        // Assert
        expect(service.jobs()).toEqual([])
    })
})
