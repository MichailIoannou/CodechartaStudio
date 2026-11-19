import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { routeLinks } from "../../../../routing/routePaths"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aPickedFolder, aPickedImportFile, aProject, aResolvedCommit, aSnapshot } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { OpenFileService } from "../../services/openFile.service"
import { OpenFileDialogComponent } from "./openFileDialog.component"

const BILLING = aProject(
    "p-billing",
    [aFolder("f-api", { label: "billing-api" }), aFolder("f-out", { label: "out", role: "helper", kind: "plain" })],
    {
        name: "billing"
    }
)
const HINT = aResolvedCommit("a1b2c3d", "Fix the invoice rounding")

describe("OpenFileDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function pickToOpen(seed: FakeDesktopSeed) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()
        testBed = await setUpProjects(seed)
        const fixture = TestBed.createComponent(OpenFileDialogComponent)
        fixture.autoDetectChanges()
        await TestBed.inject(OpenFileService).pickToOpen()
        await settle()
        return fixture
    }

    async function pickToImport(seed: FakeDesktopSeed, folderId: string) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()
        testBed = await setUpProjects(seed)
        const fixture = TestBed.createComponent(OpenFileDialogComponent)
        fixture.autoDetectChanges()
        await TestBed.inject(OpenFileService).pickToImport({ projectId: "p-billing", folderId })
        await settle()
        return fixture
    }

    async function submit() {
        await userEvent.click(screen.getByTestId("open-file-submit"))
        await settle()
    }

    function text(testId: string) {
        return screen.getByTestId(testId).textContent?.replace(/\s+/g, " ").trim() ?? ""
    }

    it("should name the new project after the containing folder", async () => {
        // Arrange
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads") })

        // Act
        const target = text("open-file-target")
        await submit()

        // Assert
        expect(target).toContain("New project Downloads with folder /work/Downloads")
        expect(testBed.projects.projects().map(project => project.name)).toEqual(["Downloads"])
        expect(testBed.projects.activeProject()?.name).toBe("Downloads")
    })

    it("should target the existing project of the containing folder", async () => {
        // Arrange
        const existingTarget = { projectId: "p-billing", projectName: "billing", folderId: "f-out" }
        await pickToOpen({ projects: [BILLING], pickedImportFile: aPickedImportFile("out", { existingTarget }) })

        // Act
        const target = text("open-file-target")
        await submit()

        // Assert
        expect(target).toContain("Project billing, folder out")
        expect(testBed.requestsOf("snapshots.openFile")).toEqual([
            { importToken: "f".repeat(32), target: { projectId: "p-billing", folderId: "f-out" }, bindToCommit: null }
        ])
    })

    it("should label the snapshot as imported with unknown analysis time", async () => {
        // Arrange & Act
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads") })

        // Assert
        expect(text("open-file-file")).toContain("Downloads.cc.json")
        expect(text("open-file-file")).toContain("4.2 MB")
        expect(text("open-file-file")).toContain("Imported snapshot — analysis time unknown")
    })

    it("should show the file date as a hint", async () => {
        // Arrange & Act
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads") })

        // Assert
        expect(text("open-file-file")).toMatch(/File date: 12 Nov 2026, \d{2}:\d{2}/)
    })

    it("should offer binding when the hint resolves to a commit", async () => {
        // Arrange
        const picked = aPickedImportFile("billing-api", {
            fileName: "a1b2c3d.billing.cc.json.gz",
            commitHint: { hash: "a1b2c3d" },
            hintCommit: HINT,
            containingFolder: { ...aPickedImportFile("billing-api").containingFolder, kind: "git" }
        })
        await pickToOpen({ pickedImportFile: picked })

        // Act
        const binding = text("open-file-binding")
        await submit()

        // Assert
        expect(binding).toContain("Bind to commit a1b2c3d — Fix the invoice rounding")
        expect(binding).toContain("The file name points to this commit of 'billing-api'.")
        expect(testBed.requestsOf("snapshots.openFile")[0]).toEqual(expect.objectContaining({ bindToCommit: HINT.commit }))
    })

    it("should not offer binding for a plain folder", async () => {
        // Arrange & Act
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads", { commitHint: { hash: "a1b2c3d" } }) })

        // Assert
        expect(screen.queryByTestId("open-file-binding")).toBeNull()
        expect(text("open-file-look-elsewhere")).toBe("Look for commit a1b2c3d in another folder…")
    })

    it("should open unbound when the binding is unchecked", async () => {
        // Arrange
        const picked = aPickedImportFile("billing-api", { commitHint: { hash: "a1b2c3d" }, hintCommit: HINT })
        await pickToOpen({ pickedImportFile: picked })

        // Act
        await userEvent.click(screen.getByRole("checkbox", { hidden: true }))
        await submit()

        // Assert
        expect(testBed.requestsOf("snapshots.openFile")[0]).toEqual(expect.objectContaining({ bindToCommit: null }))
    })

    it("should offer show existing for a duplicate", async () => {
        // Arrange
        const snapshot = aSnapshot("p-billing", "f-out", "imported-1", { source: "imported" })
        const picked = aPickedImportFile("out", {
            existingTarget: { projectId: "p-billing", projectName: "billing", folderId: "f-out" },
            duplicateOf: snapshot.ref
        })
        await pickToOpen({ projects: [BILLING], snapshots: [snapshot], pickedImportFile: picked })

        // Act
        const alert = text("open-file-duplicate")
        const label = text("open-file-submit")
        await submit()

        // Assert
        expect(alert).toBe("This file was already imported into 'billing'.")
        expect(label).toBe("Show existing snapshot")
        expect(testBed.requestsOf("snapshots.openFile")).toEqual([])
        expect(testBed.projects.shownSnapshot()?.ref).toEqual(snapshot.ref)
    })

    it("should show the opened snapshot", async () => {
        // Arrange
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads") })

        // Act
        await submit()

        // Assert
        const shown = testBed.projects.shownSnapshot()
        expect(shown?.source).toBe("imported")
        expect(testBed.projects.workingFolder()?.id).toBe(shown?.ref.folderId)
        expect(testBed.router.navigateByUrl).toHaveBeenLastCalledWith(routeLinks.metrics)
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should open into another project and folder chosen with Change", async () => {
        // Arrange
        const commits = { "f-api": [HINT] }
        await pickToOpen({
            projects: [BILLING],
            commits,
            pickedImportFile: aPickedImportFile("Downloads", { commitHint: { hash: "a1b2c3d" } })
        })

        // Act
        await userEvent.click(screen.getByTestId("open-file-change"))
        await userEvent.selectOptions(screen.getByTestId("open-file-project"), "p-billing")
        await settle()
        const binding = text("open-file-binding")
        const target = text("open-file-target")
        await submit()

        // Assert
        expect(target).toContain("Project billing, folder billing-api")
        expect(binding).toContain("this commit of 'billing-api'")
        expect(testBed.requestsOf("snapshots.openFile")[0]).toEqual(
            expect.objectContaining({ target: { projectId: "p-billing", folderId: "f-api" }, bindToCommit: HINT.commit })
        )
    })

    it("should open into a new project although another project has the folder", async () => {
        // Arrange
        const existingTarget = { projectId: "p-billing", projectName: "billing", folderId: "f-out" }
        await pickToOpen({ projects: [BILLING], pickedImportFile: aPickedImportFile("out", { existingTarget }) })

        // Act
        await userEvent.click(screen.getByTestId("open-file-change"))
        await userEvent.selectOptions(screen.getByTestId("open-file-project"), "")
        await userEvent.selectOptions(screen.getByTestId("open-file-project"), "p-billing")
        await userEvent.selectOptions(screen.getByTestId("open-file-folder"), "f-api")
        await userEvent.selectOptions(screen.getByTestId("open-file-project"), "")
        await submit()

        // Assert
        expect(testBed.requestsOf("projects.create")).toEqual([expect.objectContaining({ name: "out" })])
        expect(testBed.requestsOf("snapshots.import")).toHaveLength(1)
        expect(testBed.projects.activeProject()?.name).toBe("out")
    })

    it("should bind to a commit found in another folder", async () => {
        // Arrange
        const seed: FakeDesktopSeed = {
            pickedImportFile: aPickedImportFile("Downloads", { commitHint: { hash: "a1b2c3d" } }),
            pickedFolders: [aPickedFolder("billing-api")],
            commits: {}
        }
        await pickToOpen(seed)
        const createdFolderId = "f-0000000000000003"
        testBed.bridge.respondWith("projects.resolveCommit", { commit: HINT })

        // Act
        await userEvent.click(screen.getByTestId("open-file-look-elsewhere"))
        await settle()
        const binding = text("open-file-binding")

        // Assert
        expect(binding).toContain("Bind to commit a1b2c3d")
        expect(binding).toContain("this commit of 'billing-api'")
        expect(testBed.requestsOf("projects.create")).toEqual([
            expect.objectContaining({
                name: "Downloads",
                folders: [expect.objectContaining({ role: "primary" }), expect.objectContaining({ label: "billing-api" })]
            })
        ])
        expect(testBed.requestsOf("projects.resolveCommit")).toEqual([
            expect.objectContaining({ folderId: createdFolderId, hash: "a1b2c3d" })
        ])
    })

    it("should say when the commit is not in the other folder either", async () => {
        // Arrange
        const existingTarget = { projectId: "p-billing", projectName: "billing", folderId: "f-out" }
        await pickToOpen({
            projects: [BILLING],
            pickedImportFile: aPickedImportFile("out", { existingTarget, commitHint: { hash: "a1b2c3d" } }),
            pickedFolders: [aPickedFolder("billing-web")]
        })

        // Act
        await userEvent.click(screen.getByTestId("open-file-look-elsewhere"))
        await settle()

        // Assert
        expect(text("open-file-search-failure")).toBe("Commit a1b2c3d is not in 'billing-web' either.")
        expect(testBed.requestsOf("projects.addFolder")).toEqual([expect.objectContaining({ projectId: "p-billing" })])
    })

    it("should keep the dialog when the folder picker is cancelled", async () => {
        // Arrange
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads", { commitHint: { hash: "a1b2c3d" } }) })

        // Act
        await userEvent.click(screen.getByTestId("open-file-look-elsewhere"))
        await settle()

        // Assert
        expect(screen.getByTestId("open-file-look-elsewhere")).toBeTruthy()
        expect(screen.queryByTestId("open-file-search-failure")).toBeNull()
    })

    it("should import into the fixed folder and resolve the hint there", async () => {
        // Arrange
        const picked = aPickedImportFile("Downloads", { commitHint: { hash: "a1b2c3d" } })
        await pickToImport({ projects: [BILLING], pickedImportFile: picked, commits: { "f-api": [HINT] } }, "f-api")

        // Act
        const title = screen.getByRole("heading", { hidden: true }).textContent
        const target = text("open-file-target")
        await submit()

        // Assert
        expect(title).toBe("Import cc.json")
        expect(target).toBe("Goes to Folder billing-api of project billing")
        expect(screen.queryByTestId("open-file-change")).toBeNull()
        expect(testBed.requestsOf("snapshots.import")).toEqual([
            { projectId: "p-billing", folderId: "f-api", importToken: "f".repeat(32), bindToCommit: HINT.commit }
        ])
    })

    it("should show an error inside the dialog and keep it open", async () => {
        // Arrange
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads") })
        testBed.bridge.failWith("snapshots.openFile", { code: "IO", message: "Disk full", details: {} })

        // Act
        await submit()

        // Assert
        expect(text("open-file-failure")).toBe("Disk full")
        expect(screen.queryByTestId("open-file-pick-again")).toBeNull()
        expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled()
    })

    it("should offer to pick again when the file is gone", async () => {
        // Arrange
        await pickToOpen({ pickedImportFile: aPickedImportFile("Downloads") })
        testBed.bridge.failWith("snapshots.openFile", { code: "TOKEN_EXPIRED", message: "expired", details: {} })
        await submit()
        const failure = text("open-file-failure")

        // Act
        await userEvent.click(screen.getByTestId("open-file-pick-again"))
        await settle()

        // Assert
        expect(failure).toContain("The file is no longer available. Pick it again.")
        expect(screen.queryByTestId("open-file-failure")).toBeNull()
        expect(testBed.requestsOf("snapshots.pickImportFile")).toHaveLength(2)
    })
})
