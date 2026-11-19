import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { aFolder, aProject, aSnapshot } from "../../../projects/projects.mocks"
import { settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { aJob } from "../../snapshots.mocks"
import { AnalysisLogDialogComponent, AnalysisLogSource } from "./analysisLogDialog.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])
const SNAPSHOT = aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "9f8e7d6", target: "commit" })
const FAILED = aJob("job-1", { state: "failed" })

describe("AnalysisLogDialogComponent", () => {
    let close: jest.Mock

    async function openLog(source: AnalysisLogSource, seed = {}) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        close = jest.fn()
        HTMLDialogElement.prototype.close = close
        await setUpProjects({ projects: [BILLING], activeProjectId: "p-billing", snapshots: [SNAPSHOT], analysisJobs: [FAILED], ...seed })
        const fixture = TestBed.createComponent(AnalysisLogDialogComponent)
        fixture.autoDetectChanges()
        const opened = fixture.componentInstance.open(source)
        await settle()
        await opened
        return fixture
    }

    it("should show the log of a snapshot under its folder and commit", async () => {
        // Arrange & Act
        await openLog(
            { kind: "snapshot", snapshot: SNAPSHOT, folderLabel: "billing-api" },
            { snapshotLogs: { "s-api": "Map: a.cc.json.gz" } }
        )

        // Assert
        expect(screen.getByRole("heading", { hidden: true }).textContent).toBe("Analysis Log — billing-api 9f8e7d6")
        expect(screen.getByTestId("analysis-log-text").textContent).toBe("Map: a.cc.json.gz")
    })

    it("should show the log of a failed job", async () => {
        // Arrange & Act
        await openLog({ kind: "job", job: FAILED, folderLabel: "billing-api" }, { failedJobLogs: { "job-1": "java 21" } })

        // Assert
        expect(screen.getByRole("heading", { hidden: true }).textContent).toBe("Analysis Log — billing-api a1b2c3d")
        expect(screen.getByTestId("analysis-log-text").textContent).toBe("java 21")
    })

    it("should say when the log cannot be read", async () => {
        // Arrange & Act
        await openLog({ kind: "job", job: FAILED, folderLabel: "billing-api" })

        // Assert
        expect(screen.getByTestId("analysis-log-unreadable").textContent).toBe(
            "The log could not be read: There is no failed analysis job-1."
        )
        expect((screen.getByTestId("analysis-log-copy") as HTMLButtonElement).disabled).toBe(true)
    })

    it("should copy the log and say so for two seconds", async () => {
        // Arrange
        await openLog(
            { kind: "snapshot", snapshot: SNAPSHOT, folderLabel: "billing-api" },
            { snapshotLogs: { "s-api": "Map: a.cc.json.gz" } }
        )
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        jest.useFakeTimers()

        // Act
        screen.getByTestId("analysis-log-copy").click()
        await Promise.resolve()
        TestBed.tick()
        const whileCopied = screen.getByTestId("analysis-log-copy").textContent?.trim()
        jest.advanceTimersByTime(2000)
        TestBed.tick()

        // Assert
        expect(writeText).toHaveBeenCalledWith("Map: a.cc.json.gz")
        expect(whileCopied).toBe("Copied")
        expect(screen.getByTestId("analysis-log-copy").textContent?.trim()).toBe("Copy log")
        jest.useRealTimers()
    })

    it("should close", async () => {
        // Arrange
        await openLog({ kind: "snapshot", snapshot: SNAPSHOT, folderLabel: "billing-api" }, { snapshotLogs: { "s-api": "" } })

        // Act
        await userEvent.click(screen.getByTestId("analysis-log-close"))

        // Assert
        expect(screen.getByTestId("analysis-log-text").textContent).toBe("")
        expect(close).toHaveBeenCalled()
    })
})
