import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { aFolder, aProject, aResolvedCommit, aSnapshot } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { MoveSnapshotDialogComponent, MoveSnapshotMode } from "./moveSnapshotDialog.component"

const BILLING = aProject(
    "p-billing",
    [aFolder("f-api", { label: "billing-api" }), aFolder("f-out", { label: "out", role: "helper", kind: "plain" })],
    { name: "billing" }
)
const IMPORTED = aSnapshot("p-billing", "f-out", "imported-1", {
    source: "imported",
    originalFileName: "a1b2c3d.billing.cc.json.gz",
    createdAt: "2026-11-12T12:00:00Z"
})
const COMMIT = aResolvedCommit("a1b2c3d", "Fix the invoice rounding")

describe("MoveSnapshotDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function openDialog(mode: MoveSnapshotMode = "move", snapshot = IMPORTED) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()
        testBed = await setUpProjects({
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [snapshot],
            commits: { "f-api": [COMMIT] }
        })
        const fixture = TestBed.createComponent(MoveSnapshotDialogComponent)
        fixture.autoDetectChanges()
        fixture.componentInstance.open(snapshot, mode)
        await settle()
        return fixture
    }

    function folderOptions() {
        return Array.from((screen.getByTestId("move-snapshot-folder") as HTMLSelectElement).options, option => option.textContent?.trim())
    }

    function submitButton() {
        return screen.getByTestId("move-snapshot-submit") as HTMLButtonElement
    }

    async function check() {
        await userEvent.click(screen.getByTestId("move-snapshot-check"))
        await settle()
    }

    it("should list the folders of the project as targets", async () => {
        // Arrange & Act
        await openDialog()

        // Assert
        expect(screen.getByRole("heading", { hidden: true }).textContent).toBe("Move Snapshot")
        expect(screen.getByTestId("move-snapshot-file").textContent).toBe("a1b2c3d.billing.cc.json.gz · imported 12 Nov 2026")
        expect(folderOptions()).toEqual(["billing-api", "out"])
        expect((screen.getByTestId("move-snapshot-folder") as HTMLSelectElement).value).toBe("f-out")
        expect((screen.getByTestId("move-snapshot-commit") as HTMLInputElement).value).toBe("a1b2c3d")
    })

    it("should check the hash in the target folder", async () => {
        // Arrange
        await openDialog()
        const disabledBeforeCheck = submitButton().disabled

        // Act
        await check()
        const notInOut = screen.getByTestId("move-snapshot-check-result").textContent?.trim()
        await userEvent.selectOptions(screen.getByTestId("move-snapshot-folder"), "f-api")
        await check()

        // Assert
        expect(disabledBeforeCheck).toBe(true)
        expect(notInOut).toBe("Not a commit of 'out'.")
        expect(screen.getByTestId("move-snapshot-check-result").textContent?.trim()).toBe("Fix the invoice rounding (Mia Chen, 3 Nov)")
        expect(submitButton().disabled).toBe(false)
        expect(testBed.requestsOf("projects.resolveCommit")).toEqual([
            { projectId: "p-billing", folderId: "f-out", hash: "a1b2c3d" },
            { projectId: "p-billing", folderId: "f-api", hash: "a1b2c3d" }
        ])
    })

    it("should move and show the snapshot", async () => {
        // Arrange
        await openDialog()
        await userEvent.selectOptions(screen.getByTestId("move-snapshot-folder"), "f-api")
        await check()

        // Act
        await userEvent.click(submitButton())
        await settle()

        // Assert
        expect(testBed.requestsOf("snapshots.move")).toEqual([{ ...IMPORTED.ref, toFolderId: "f-api", bindToCommit: COMMIT.commit }])
        expect(testBed.projects.workingFolder()?.id).toBe("f-api")
        expect(testBed.projects.shownSnapshot()?.shortCommit).toBe("a1b2c3d")
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should move without a commit when the hash is left empty", async () => {
        // Arrange
        await openDialog("bind", { ...IMPORTED, originalFileName: "map.cc.json" })

        // Act
        const title = screen.getByRole("heading", { hidden: true }).textContent
        const label = submitButton().textContent?.trim()
        await userEvent.selectOptions(screen.getByTestId("move-snapshot-folder"), "f-api")
        await userEvent.click(submitButton())
        await settle()

        // Assert
        expect(title).toBe("Bind to Commit")
        expect(label).toBe("Bind")
        expect(testBed.requestsOf("snapshots.move")).toEqual([{ ...IMPORTED.ref, toFolderId: "f-api", bindToCommit: null }])
    })

    it("should forget the check when the hash changes and refuse to check what is not a hash", async () => {
        // Arrange
        await openDialog()
        await userEvent.selectOptions(screen.getByTestId("move-snapshot-folder"), "f-api")
        await check()

        // Act
        await userEvent.type(screen.getByTestId("move-snapshot-commit"), "x")

        // Assert
        expect(submitButton().disabled).toBe(true)
        expect((screen.getByTestId("move-snapshot-check") as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByTestId("move-snapshot-check-result").textContent?.trim()).toBe("Leave empty to keep it unbound")
    })

    it("should show a refused move inside the dialog", async () => {
        // Arrange
        await openDialog()
        testBed.bridge.failWith("snapshots.move", { code: "CONFLICT", message: "The target exists.", details: {} })
        await userEvent.clear(screen.getByTestId("move-snapshot-commit"))

        // Act
        await userEvent.click(submitButton())
        await settle()

        // Assert
        expect(screen.getByTestId("move-snapshot-failure").textContent?.trim()).toBe("The target exists.")
        expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled()
    })

    it("should show a failed check inside the dialog", async () => {
        // Arrange
        await openDialog()
        testBed.bridge.failWith("projects.resolveCommit", { code: "FOLDER_UNAVAILABLE", message: "The folder is gone.", details: {} })

        // Act
        await check()

        // Assert
        expect(screen.getByTestId("move-snapshot-failure").textContent?.trim()).toBe("The folder is gone.")
        expect(screen.getByTestId("move-snapshot-check-result").textContent?.trim()).toBe("Leave empty to keep it unbound")
    })
})
