import { TestBed } from "@angular/core/testing"
import { screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject, aSnapshot } from "../../../projects/projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { CleanupDialogComponent } from "./cleanupDialog.component"

const PLAN_WAIT_MS = 350
const FOLDER = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], {
    name: "billing",
    view: { workingFolderId: "f-api", shownSnapshotIdByFolder: {} }
})

function anAnalysis(day: number) {
    const finishedAt = `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`
    const sha = `${day}`.padEnd(40, "a")
    return aSnapshot("p-billing", "f-api", `s-${day}`, {
        target: "commit",
        commit: sha,
        shortCommit: sha.slice(0, 7),
        subject: `Commit of day ${day}`,
        finishedAt,
        createdAt: finishedAt,
        mapBytes: 1_000_000
    })
}

const ANALYSES = [5, 4, 3, 2, 1].map(anAnalysis)
const IMPORTED = aSnapshot("p-billing", "f-api", "s-imported", { source: "imported", originalFileName: "old.cc.json" })

describe("CleanupDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function openDialog(seed: FakeDesktopSeed = {}) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
            this.dispatchEvent(new Event("close"))
        })
        testBed = await setUpProjects({ projects: [BILLING], activeProjectId: "p-billing", snapshots: [...ANALYSES, IMPORTED], ...seed })
        await testBed.projects.showWorkingFolder()
        const fixture = TestBed.createComponent(CleanupDialogComponent)
        fixture.autoDetectChanges()
        fixture.componentInstance.open()
        await waitForPlan()
        return fixture
    }

    async function waitForPlan() {
        await settle()
        await new Promise(resolve => setTimeout(resolve, PLAN_WAIT_MS))
        await settle()
    }

    async function keepCommits(count: string) {
        const input = screen.getByTestId("cleanup-keep-commits")
        await userEvent.clear(input)
        if (count) {
            await userEvent.type(input, count)
        }
        await waitForPlan()
    }

    function confirmButton() {
        return screen.getByTestId("cleanup-confirm") as HTMLButtonElement
    }

    it("should propose the default policy and find nothing to clean up in a small folder", async () => {
        // Arrange & Act
        await openDialog()

        // Assert
        expect(screen.getByTestId("cleanup-dialog").textContent).toContain("Clean Up Analyses — billing-api")
        expect(testBed.requestsOf("snapshots.planPrune")).toEqual([
            { ...FOLDER, policy: { keepNewestCommitSnapshots: 50, keepNewestWorkingTreeSnapshots: 3, keepBranchTipsAndTags: true } }
        ])
        expect(screen.getByTestId("cleanup-plan").textContent).toContain("Nothing to clean up with these settings.")
        expect(confirmButton().disabled).toBe(true)
    })

    it("should list what a clean-up removes and the space it frees", async () => {
        // Arrange
        await openDialog()

        // Act
        await keepCommits("2")

        // Assert
        const plan = screen.getByTestId("cleanup-plan")
        expect(plan.textContent).toContain("Moves 3 analyses (3.0 MB) of billing-api to the recycle bin:")
        expect(within(plan).getByTestId("cleanup-list").querySelector("summary")?.textContent?.trim()).toBe("3 analyses, 3.0 MB")
        const rows = within(plan).getAllByTestId("cleanup-row")
        expect(rows.map(row => Array.from(row.children).map(cell => cell.textContent?.trim()))).toEqual([
            ["3aaaaaa", "Commit of day 3"],
            ["2aaaaaa", "Commit of day 2"],
            ["1aaaaaa", "Commit of day 1"]
        ])
        expect(plan.textContent).not.toContain("old.cc.json")
        expect(confirmButton().textContent?.trim()).toBe("Move 3 to recycle bin")
    })

    it("should move the listed analyses to the recycle bin and close", async () => {
        // Arrange
        await openDialog()
        await keepCommits("4")

        // Act
        await userEvent.click(confirmButton())
        await settle()

        // Assert
        expect(testBed.requestsOf("snapshots.prune")).toEqual([{ ...FOLDER, snapshotIds: ["s-1"], permanently: false }])
        expect(testBed.toastService.show).toHaveBeenCalledWith("Moved 1 analysis (1.0 MB) to the recycle bin.", "success")
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should show a failed clean-up in the dialog", async () => {
        // Arrange
        await openDialog()
        await keepCommits("4")
        testBed.bridge.failWith("snapshots.prune", {
            code: "SNAPSHOT_BEING_WRITTEN",
            message: "An analysis is still being written.",
            details: {}
        })

        // Act
        await userEvent.click(confirmButton())
        await settle()

        // Assert
        expect(screen.getByTestId("cleanup-failure").textContent).toContain("An analysis is still being written.")
        expect(confirmButton().disabled).toBe(false)
    })

    it("should close and leave the recycle bin failure to its toast", async () => {
        // Arrange
        await openDialog()
        await keepCommits("4")
        testBed.bridge.failWith("snapshots.prune", { code: "RECYCLE_FAILED", message: "No recycle bin.", details: {} })

        // Act
        await userEvent.click(confirmButton())
        await settle()

        // Assert
        expect(screen.queryByTestId("cleanup-failure")).toBeNull()
        expect(testBed.toastService.show).toHaveBeenCalledWith(
            "Could not move the analyses to the recycle bin. Nothing was deleted.",
            "error",
            {
                details: "No recycle bin."
            }
        )
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should pass the working-tree count and the branch tip choice to the plan", async () => {
        // Arrange
        await openDialog()
        const workingTrees = screen.getByTestId("cleanup-keep-working-trees")

        // Act
        await userEvent.clear(workingTrees)
        await userEvent.type(workingTrees, "1")
        await userEvent.click(screen.getByTestId("cleanup-keep-tips"))
        await waitForPlan()

        // Assert
        expect(testBed.requestsOf("snapshots.planPrune").at(-1)).toEqual({
            ...FOLDER,
            policy: { keepNewestCommitSnapshots: 50, keepNewestWorkingTreeSnapshots: 1, keepBranchTipsAndTags: false }
        })
    })

    it("should ask for a whole number and plan nothing without one", async () => {
        // Arrange
        await openDialog()
        const asked = testBed.requestsOf("snapshots.planPrune").length

        // Act
        await keepCommits("")

        // Assert
        expect(screen.getByTestId("cleanup-input-error").textContent).toBe("Enter a whole number of 0 or more.")
        expect(testBed.requestsOf("snapshots.planPrune")).toHaveLength(asked)
        expect(confirmButton().disabled).toBe(true)
    })

    it("should show a plan that could not be made", async () => {
        // Arrange & Act
        await openDialog({ failures: { "snapshots.planPrune": { code: "IO", message: "store unreadable", details: {} } } })

        // Assert
        expect(screen.getByTestId("cleanup-plan-failure").textContent).toContain("store unreadable")
    })

    it("should stop planning once closed", async () => {
        // Arrange
        const fixture = await openDialog()
        const asked = testBed.requestsOf("snapshots.planPrune").length

        // Act
        await userEvent.click(screen.getByTestId("cleanup-cancel"))
        fixture.componentInstance.keepCommits.set(1)
        await waitForPlan()

        // Assert
        expect(testBed.requestsOf("snapshots.planPrune")).toHaveLength(asked)
        expect(fixture.componentInstance.isOpen()).toBe(false)
    })
})
