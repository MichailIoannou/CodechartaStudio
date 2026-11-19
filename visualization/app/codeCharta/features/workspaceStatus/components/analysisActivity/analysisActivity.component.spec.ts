import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { AnalysisJob } from "../../../../model/coreApi/AnalysisJob"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { aJob } from "../../../snapshots/snapshots.mocks"
import { AnalysisActivityComponent } from "./analysisActivity.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" }), aFolder("f-web", { label: "billing-web" })])
const DONE = aJob("job-1", {
    state: "done",
    target: { kind: "workingTree" },
    startedAt: "2026-11-19T08:00:00Z",
    finishedAt: "2026-11-19T08:01:12Z",
    snapshotId: "worktree-20261119T080112000Z-01234567"
})
const OTHER_FOLDER = aJob("job-2", { state: "queued", folderId: "f-web" })

describe("AnalysisActivityComponent", () => {
    let testBed: ProjectsTestBed

    async function renderActivity(jobs: AnalysisJob[]) {
        testBed = await setUpProjects({ projects: [BILLING], activeProjectId: "p-billing", analysisJobs: jobs })
        const fixture = TestBed.createComponent(AnalysisActivityComponent)
        fixture.componentRef.setInput("jobs", jobs)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    it("should show how long a finished analysis took and which other folder a job is for", async () => {
        // Arrange & Act
        await renderActivity([DONE, OTHER_FOLDER])

        // Assert
        expect(screen.getByTestId("activity-done").textContent?.replaceAll(/\s+/g, " ")).toContain("Analysed working tree · 1 min 12 s")
        expect(screen.getByTestId("activity-queued").textContent?.replaceAll(/\s+/g, " ")).toContain("Queued: a1b2c3d · billing-web")
    })

    it("should clear the finished jobs", async () => {
        // Arrange
        await renderActivity([DONE, OTHER_FOLDER])

        // Act
        await userEvent.click(screen.getByTestId("activity-clear-finished"))
        await settle()

        // Assert
        expect(testBed.requestsOf("analysis.clearFinished")).toEqual([{}])
    })

    it("should offer no clearing while every job is pending and toast a refused cancel", async () => {
        // Arrange
        await renderActivity([OTHER_FOLDER])
        testBed.bridge.failWith("analysis.cancel", { code: "INTERNAL", message: "queue gone", details: {} })

        // Act
        await userEvent.click(screen.getByTestId("activity-cancel"))
        await settle()

        // Assert
        expect(screen.queryByTestId("activity-clear-finished")).toBeNull()
        expect(testBed.toastService.show).toHaveBeenCalledWith("queue gone", "error")
    })
})
