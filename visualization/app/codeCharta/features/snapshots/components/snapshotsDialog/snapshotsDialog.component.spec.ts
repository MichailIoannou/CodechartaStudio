import { TestBed } from "@angular/core/testing"
import { screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject, aSnapshot } from "../../../projects/projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { SnapshotsDialogService } from "../../services/snapshotsDialog.service"
import { COMMIT_SHA } from "../../snapshots.mocks"
import { SnapshotsDialogComponent } from "./snapshotsDialog.component"

const BILLING = aProject(
    "p-billing",
    [aFolder("f-api", { label: "billing-api" }), aFolder("f-out", { label: "out", role: "helper", kind: "plain" })],
    { name: "billing", view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-commit" } } }
)
const COMMIT = aSnapshot("p-billing", "f-api", "s-commit", {
    target: "commit",
    commit: COMMIT_SHA,
    shortCommit: "a1b2c3d",
    subject: "Fix invoice rounding",
    commitDate: "2026-11-03T14:03:00Z",
    finishedAt: "2026-11-03T14:10:00Z",
    profileHash: "2f9c0123",
    createdAt: "2026-11-03T14:10:00Z"
})
const WORKING_TREE = aSnapshot("p-billing", "f-api", "s-tree", {
    target: "workingTree",
    shortCommit: "a1b2c3d",
    dirty: true,
    finishedAt: "2026-11-04T09:12:00Z",
    profileHash: "2f9c0123",
    notInMap: ["svn history"],
    createdAt: "2026-11-04T09:12:00Z"
})
const BOUND_IMPORT = aSnapshot("p-billing", "f-api", "imported-bound", {
    source: "imported",
    commit: "9f8e7d6".padEnd(40, "0"),
    shortCommit: "9f8e7d6",
    subject: "Release 2.4.0",
    originalFileName: "release.cc.json",
    createdAt: "2026-11-01T08:00:00Z"
})
const UNBOUND_IMPORT = aSnapshot("p-billing", "f-out", "imported-unbound", {
    source: "imported",
    originalFileName: "export-2024.cc.json",
    createdAt: "2026-11-12T08:00:00Z"
})
const HEAD: GitStatus = {
    head: { kind: "branch", name: "main", commit: COMMIT_SHA },
    upstream: null,
    counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
    operationInProgress: null
}

describe("SnapshotsDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function openDialog(seed: FakeDesktopSeed = {}, beforeOpen: (bed: ProjectsTestBed) => void = () => undefined) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
            this.dispatchEvent(new Event("close"))
        })
        testBed = await setUpProjects({
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [COMMIT, WORKING_TREE, BOUND_IMPORT, UNBOUND_IMPORT],
            gitStatuses: { "f-api": HEAD },
            ...seed
        })
        await testBed.projects.showWorkingFolder()
        beforeOpen(testBed)
        TestBed.inject(SnapshotsDialogService).show()
        const fixture = TestBed.createComponent(SnapshotsDialogComponent)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    function rowCells(container: HTMLElement) {
        return within(container)
            .getAllByTestId("snapshots-row")
            .map(row =>
                Array.from(row.children)
                    .slice(0, 6)
                    .map(cell =>
                        Array.from(cell.childNodes)
                            .filter(node => node.nodeType !== Node.COMMENT_NODE)
                            .map(node => node.textContent?.trim())
                            .filter(Boolean)
                            .join(" ")
                    )
            )
    }

    function enqueued() {
        return testBed.requestsOf("analysis.enqueue")
    }

    it("should list snapshots per folder", async () => {
        // Arrange & Act
        await openDialog()
        await userEvent.selectOptions(screen.getByTestId("snapshots-folder"), "all")

        // Assert
        expect(screen.getByText("Snapshots — billing")).toBeTruthy()
        const api = screen.getByTestId("snapshots-folder-billing-api")
        expect(api.textContent).toContain("billing-api")
        const relative = expect.stringMatching(/ago$|^just now$/)
        expect(rowCells(api)).toEqual([
            ["working tree (on a1b2c3d)", "—", relative, "2f9c…", "1.0 kB", "uncommitted partial"],
            ["a1b2c3d Fix invoice rounding", relative, relative, "2f9c…", "1.0 kB", "shown"],
            ["9f8e7d6 Release 2.4.0", "—", "unknown (imported 1 Nov 2026)", "unknown", "1.0 kB", "imported"]
        ])
        expect(screen.getByTestId("snapshots-folder-out").textContent).toContain("No analyses yet.")
    })

    it("should flag imported rows with unknown analysis time and offer no re-analyse", async () => {
        // Arrange & Act
        await openDialog()

        // Assert
        const importedRow = screen.getAllByTestId("snapshots-row")[2]
        expect(within(importedRow).getByTestId("snapshots-analysed-unknown").textContent).toBe("unknown (imported 1 Nov 2026)")
        expect(within(importedRow).queryByTestId("snapshots-reanalyse")).toBeNull()
        expect(within(importedRow).getByTestId("snapshots-move")).toBeTruthy()
        expect(within(screen.getAllByTestId("snapshots-row")[1]).getByTestId("snapshots-reanalyse")).toBeTruthy()
    })

    it("should list unbound imports in the separate section", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.selectOptions(screen.getByTestId("snapshots-folder"), "all")

        // Assert
        const section = screen.getByTestId("snapshots-unbound-imports")
        expect(section.textContent).toContain("Imported — analysis time unknown")
        expect(within(section).getByTestId("snapshots-unbound-row").textContent).toContain("export-2024.cc.json")
        expect(within(section).getByTestId("snapshots-unbound-row").textContent).toContain("imported 12 Nov 2026")
        expect(screen.getByTestId("snapshots-folder-out").textContent).not.toContain("export-2024")
    })

    it("should load a snapshot and close", async () => {
        // Arrange
        await openDialog()
        testBed.loadFilesUseCase.loadProjectSnapshots.mockClear()

        // Act
        await userEvent.click(within(screen.getAllByTestId("snapshots-row")[0]).getByTestId("snapshots-open"))
        await settle()

        // Assert
        const [[toLoad]] = testBed.loadFilesUseCase.loadProjectSnapshots.mock.calls
        expect(toLoad.map(entry => entry.origin.snapshotId)).toEqual(["s-tree"])
        expect(TestBed.inject(SnapshotsDialogService).isOpen()).toBe(false)
    })

    it("should analyse the current checkout and the HEAD commit of the chosen folder", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(screen.getByTestId("snapshots-analyse-checkout"))
        await userEvent.click(screen.getByTestId("snapshots-analyse-head"))
        await settle()

        // Assert
        expect(enqueued()).toEqual([
            { projectId: "p-billing", folderId: "f-api", target: { kind: "workingTree" }, force: false },
            { projectId: "p-billing", folderId: "f-api", target: { kind: "commit", sha: COMMIT_SHA }, force: false }
        ])
    })

    it("should not offer the HEAD commit of a plain folder and analyse an empty folder from its row", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.selectOptions(screen.getByTestId("snapshots-folder"), "f-out")
        await userEvent.click(
            within(screen.getByTestId("snapshots-folder-out")).getByRole("button", { hidden: true, name: /Analyse current checkout/ })
        )
        await settle()

        // Assert
        const head = screen.getByTestId("snapshots-analyse-head") as HTMLButtonElement
        expect(head.disabled).toBe(true)
        expect(head.title).toBe("Not a git repository")
        expect(enqueued()).toEqual([{ projectId: "p-billing", folderId: "f-out", target: { kind: "workingTree" }, force: false }])
    })

    it("should re-analyse a snapshot with force", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(within(screen.getAllByTestId("snapshots-row")[1]).getByTestId("snapshots-reanalyse"))
        await settle()

        // Assert
        expect(enqueued()).toEqual([
            { projectId: "p-billing", folderId: "f-api", target: { kind: "commit", sha: COMMIT_SHA }, force: true }
        ])
    })

    it("should show preflight problems with hints", async () => {
        // Arrange
        await openDialog()
        testBed.bridge.respondWith("analysis.enqueue", {
            status: "rejected",
            problems: [{ code: "JAVA_NOT_FOUND", severity: "error", message: "Java was not found.", hint: "Install Java 22 or newer." }]
        })

        // Act
        await userEvent.click(screen.getByTestId("snapshots-analyse-checkout"))
        await settle()

        // Assert
        expect(screen.getByTestId("preflight-problems").textContent).toContain("Java was not found.")
        expect(screen.getByTestId("preflight-problems").textContent).toContain("Install Java 22 or newer.")
    })

    it("should show the log of an analysed snapshot", async () => {
        // Arrange
        await openDialog({ snapshotLogs: { "s-commit": "Map: a1b2c3d.cc.json.gz" } })

        // Act
        await userEvent.click(within(screen.getAllByTestId("snapshots-row")[1]).getByTestId("snapshots-show-log"))
        await settle()

        // Assert
        expect(screen.getByTestId("analysis-log-text").textContent).toBe("Map: a1b2c3d.cc.json.gz")
    })

    it("should move or bind an imported snapshot", async () => {
        // Arrange
        await openDialog()
        await userEvent.selectOptions(screen.getByTestId("snapshots-folder"), "all")

        // Act
        await userEvent.click(within(screen.getByTestId("snapshots-unbound-row")).getByTestId("snapshots-bind"))

        // Assert
        expect(screen.getByTestId("move-snapshot-dialog").textContent).toContain("Bind to Commit")
        expect(screen.getByTestId("move-snapshot-file").textContent).toContain("export-2024.cc.json")
    })

    it("should show a folder that could not be read and retry it", async () => {
        // Arrange
        await openDialog({}, bed => bed.bridge.failWith("snapshots.list", { code: "IO", message: "store unreadable", details: {} }))
        testBed.bridge.respondWith("snapshots.list", { snapshots: [COMMIT] })

        // Act
        const failure = screen.getByTestId("snapshots-folder-failure").textContent
        await userEvent.click(within(screen.getByTestId("snapshots-folder-failure")).getByRole("button", { hidden: true, name: "Retry" }))
        await settle()

        // Assert
        expect(failure).toContain("store unreadable")
        expect(screen.queryByTestId("snapshots-folder-failure")).toBeNull()
        expect(screen.getAllByTestId("snapshots-row")).toHaveLength(1)
    })

    it("should close", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(screen.getByTestId("snapshots-close"))

        // Assert
        expect(TestBed.inject(SnapshotsDialogService).isOpen()).toBe(false)
    })
})
