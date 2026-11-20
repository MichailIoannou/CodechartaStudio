import { TestBed } from "@angular/core/testing"
import { screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aPickedFolder, aProject, aSnapshot } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { ManageProjectDialogComponent } from "./manageProjectDialog.component"

const BILLING = aProject(
    "p-billing",
    [
        aFolder("f-api", { label: "billing-api" }),
        aFolder("f-fork", { label: "billing-api-fork", role: "fork" }),
        aFolder("f-gone", { label: "gone", role: "helper", status: "missing" })
    ],
    { name: "billing", description: "Invoices." }
)
const SNAPSHOTS = [aSnapshot("p-billing", "f-api", "s-1"), aSnapshot("p-billing", "f-fork", "s-2"), aSnapshot("p-billing", "f-fork", "s-3")]
const SEED: FakeDesktopSeed = { projects: [BILLING], activeProjectId: "p-billing", snapshots: SNAPSHOTS }

describe("ManageProjectDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function openDialog(seed: FakeDesktopSeed = SEED) {
        HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) {
            this.setAttribute("open", "")
        })
        HTMLDialogElement.prototype.close = jest.fn()
        testBed = await setUpProjects(seed)
        const fixture = TestBed.createComponent(ManageProjectDialogComponent)
        fixture.autoDetectChanges()
        fixture.componentInstance.open()
        await settle()
        return fixture
    }

    async function showSection(section: "general" | "folders" | "profile") {
        await userEvent.click(screen.getByTestId(`manage-project-section-${section}`))
    }

    it("should switch sections with the segmented control and the arrow keys", async () => {
        // Arrange
        await openDialog()
        screen.getByTestId("manage-project-section-general").focus()

        // Act
        await userEvent.keyboard("{ArrowRight}")
        const afterRight = screen.getByTestId("manage-project-section-folders").getAttribute("aria-selected")
        await userEvent.keyboard("{ArrowLeft}{ArrowLeft}")

        // Assert
        expect(afterRight).toBe("true")
        expect(screen.getByTestId("manage-project-section-profile").getAttribute("aria-selected")).toBe("true")
        expect(document.activeElement).toBe(screen.getByTestId("manage-project-section-profile"))
    })

    it("should save a changed name and description", async () => {
        // Arrange
        await openDialog()
        const save = screen.getByTestId("manage-general-save") as HTMLButtonElement
        const savedBefore = save.disabled

        // Act
        await userEvent.clear(screen.getByLabelText("Name"))
        await userEvent.type(screen.getByLabelText("Name"), "invoices")
        await userEvent.click(save)
        await settle()

        // Assert
        expect(savedBefore).toBe(true)
        expect(testBed.requestsOf("projects.update")).toEqual([{ projectId: "p-billing", name: "invoices", description: "Invoices." }])
        expect(testBed.projects.activeProject()?.name).toBe("invoices")
    })

    it("should name the snapshot count in the delete confirmation", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(screen.getByTestId("manage-general-delete"))

        // Assert
        expect(screen.getByTestId("delete-project-dialog").textContent).toContain(
            "Move the project 'billing' and its 3 analyses to the recycle bin? Your folders are not touched."
        )
    })

    it("should unload the map when the active project is deleted", async () => {
        // Arrange
        await openDialog()
        await userEvent.click(screen.getByTestId("manage-general-delete"))

        // Act
        await userEvent.click(screen.getByTestId("delete-project-confirm"))
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.delete")).toEqual([{ projectId: "p-billing", permanently: false }])
        expect(testBed.loadFilesUseCase.unloadAllFiles).toHaveBeenCalled()
        expect(testBed.projects.activeProject()).toBeNull()
    })

    it("should ask before closing with unsaved changes", async () => {
        // Arrange
        await openDialog()
        await userEvent.type(screen.getByLabelText("Name"), "!")

        // Act
        await userEvent.click(screen.getByTestId("manage-project-close"))

        // Assert
        expect(screen.getByTestId("manage-project-discard").textContent).toContain(
            "Your changes to this project are not saved. Close anyway?"
        )
        expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2)
        expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled()
    })

    it("should close at once without changes, also with Escape", async () => {
        // Arrange
        await openDialog()

        // Act
        screen.getByTestId("manage-project-dialog").dispatchEvent(new Event("cancel", { cancelable: true }))

        // Assert
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1)
    })

    it("should offer re-link for a missing folder", async () => {
        // Arrange
        await openDialog({ ...SEED, pickedFolders: [aPickedFolder("found-again")] })
        await showSection("folders")

        // Act
        await userEvent.click(within(screen.getByTestId("folder-row-f-gone")).getByRole("button", { name: "Re-link…" }))
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.pickFolder")).toEqual([{ title: "Re-link 'gone'" }])
        expect(testBed.projects.activeProject()?.folders[2]).toEqual(expect.objectContaining({ path: "/work/found-again", status: "ok" }))
    })

    it("should ask again when the history differs", async () => {
        // Arrange
        await openDialog({ ...SEED, pickedFolders: [aPickedFolder("other-repo")] })
        testBed.bridge.failWith("projects.relinkFolder", { code: "DIFFERENT_HISTORY", message: "different", details: {} })
        await showSection("folders")
        await userEvent.click(within(screen.getByTestId("folder-row-f-gone")).getByRole("button", { name: "Re-link…" }))
        await settle()
        testBed.bridge.respondWith("projects.relinkFolder", BILLING)

        // Act
        await userEvent.click(within(screen.getByTestId("relink-different-history")).getByTestId("confirm-dialog-yes"))
        await settle()

        // Assert
        expect(screen.getByTestId("relink-different-history").textContent).toContain(
            "'/work/other-repo' does not share history with the analyses of 'gone'. Link it anyway?"
        )
        expect(testBed.requestsOf("projects.relinkFolder")).toEqual([
            { projectId: "p-billing", folderId: "f-gone", pickToken: aPickedFolder("other-repo").pickToken },
            { projectId: "p-billing", folderId: "f-gone", pickToken: aPickedFolder("other-repo").pickToken, acceptDifferentHistory: true }
        ])
    })

    it("should ask before removing a folder with analyses and remove one without at once", async () => {
        // Arrange
        await openDialog()
        await showSection("folders")
        await userEvent.click(screen.getByLabelText("Remove folder billing-api-fork"))
        const question = screen.getByTestId("remove-folder-dialog").textContent

        // Act
        await userEvent.click(screen.getByTestId("remove-folder-confirm"))
        await settle()
        await userEvent.click(screen.getByLabelText("Remove folder gone"))
        await settle()

        // Assert
        expect(question).toContain(
            "Remove 'billing-api-fork' from the project? Its 2 analyses go to the recycle bin. The folder on disk is not touched."
        )
        expect(testBed.requestsOf("projects.removeFolder")).toEqual([
            { projectId: "p-billing", folderId: "f-fork", permanently: false },
            { projectId: "p-billing", folderId: "f-gone", permanently: false }
        ])
    })

    it("should save folder labels, roles and refreshes per action and show a refusal", async () => {
        // Arrange
        await openDialog({ ...SEED, pickedFolders: [aPickedFolder("billing-docs")] })
        await showSection("folders")

        // Act
        await userEvent.selectOptions(screen.getByLabelText("Role of billing-api-fork"), "primary")
        await settle()
        await userEvent.click(screen.getByRole("button", { name: "Refresh git facts of billing-api-fork" }))
        await userEvent.click(screen.getByTestId("manage-folders-add"))
        await settle()
        testBed.bridge.failWith("projects.updateFolder", { code: "DUPLICATE_LABEL", message: "Another folder is called web.", details: {} })
        const [label] = screen.getAllByLabelText("Folder label")
        await userEvent.clear(label)
        await userEvent.type(label, "web{Enter}")
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.updateFolder")[0]).toEqual({ projectId: "p-billing", folderId: "f-fork", role: "primary" })
        expect(testBed.requestsOf("projects.refreshFolder")).toEqual([{ projectId: "p-billing", folderId: "f-fork" }])
        expect(testBed.projects.activeProject()?.folders.map(folder => folder.label)).toContain("billing-docs")
        expect(screen.getByTestId("manage-folders-failure").textContent).toContain("Another folder is called web.")
    })

    it("should save the analysis profile", async () => {
        // Arrange
        await openDialog()
        await showSection("profile")

        // Act
        await userEvent.type(screen.getByLabelText("Exclude (one pattern per line)"), "**/generated/**{Enter}{Enter}dist/**")
        await userEvent.click(screen.getByLabelText("Skip Git history"))
        await userEvent.click(screen.getByLabelText("Skip Raw text"))
        await userEvent.click(screen.getByLabelText("Skip Raw text"))
        await userEvent.click(screen.getByLabelText("Run analysers in parallel"))
        await userEvent.click(screen.getByTestId("manage-profile-save"))
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.update")).toEqual([
            { projectId: "p-billing", analysisProfile: { exclude: ["**/generated/**", "dist/**"], without: ["git"], parallel: false } }
        ])
        expect((screen.getByTestId("manage-profile-save") as HTMLButtonElement).disabled).toBe(true)
    })

    it("should show a refused profile in the section", async () => {
        // Arrange
        await openDialog()
        testBed.bridge.failWith("projects.update", { code: "BAD_REQUEST", message: "Too many patterns.", details: {} })
        await showSection("profile")

        // Act
        await userEvent.click(screen.getByLabelText("Run analysers in parallel"))
        await userEvent.click(screen.getByTestId("manage-profile-save"))
        await settle()

        // Assert
        expect(screen.getByTestId("manage-profile-failure").textContent).toContain("Too many patterns.")
    })
})
