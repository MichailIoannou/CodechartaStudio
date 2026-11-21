import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aGitStatus, aPickedImportFile, aProject, aSnapshot } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { FolderMenuRequestsService } from "../../services/folderMenuRequests.service"
import { ProjectSwitcherComponent } from "./projectSwitcher.component"

const BILLING = aProject(
    "p-billing",
    [
        aFolder("f-api", { label: "billing-api", path: "C:\\work\\billing-api" }),
        aFolder("f-web", { label: "billing-web", role: "fork" }),
        aFolder("f-out", { label: "out", role: "helper", kind: "plain" })
    ],
    { name: "billing" }
)
const DOTFILES = aProject(
    "p-dots",
    [aFolder("f-dots", { label: "dotfiles" }), aFolder("f-work", { label: "dotfiles-work", status: "missing" })],
    {
        name: "dotfiles"
    }
)
const CODECHARTA = aProject("p-cc", [aFolder("f-cc", { label: "codecharta" })], { name: "codecharta" })
const SEED: FakeDesktopSeed = {
    projects: [DOTFILES, BILLING, CODECHARTA],
    activeProjectId: "p-billing",
    snapshots: [aSnapshot("p-dots", "f-dots", "s-dots")],
    gitStatuses: { "f-api": aGitStatus("feature/invoice-rounding"), "f-dots": aGitStatus("main") }
}

describe("ProjectSwitcherComponent", () => {
    let testBed: ProjectsTestBed

    async function renderSwitcher(seed: FakeDesktopSeed = SEED) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        testBed = await setUpProjects(seed)
        const fixture = TestBed.createComponent(ProjectSwitcherComponent)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    async function openMenu() {
        await userEvent.click(screen.getByTestId("project-switcher-trigger"))
        await settle()
    }

    it("should name the project and the working folder on the trigger", async () => {
        // Arrange & Act
        await renderSwitcher()

        // Assert
        const trigger = screen.getByTestId("project-switcher-trigger")
        expect(Array.from(trigger.querySelectorAll("span span"), span => span.textContent?.trim())).toEqual(["billing", "/", "billing-api"])
        expect(trigger.title).toBe("Project 'billing', working folder 'billing-api' (C:\\work\\billing-api) — switch folder or project")
        expect(trigger.getAttribute("aria-expanded")).toBe("false")
    })

    it("should list the folders of the project with the working folder checked and their branches", async () => {
        // Arrange
        await renderSwitcher()

        // Act
        await openMenu()

        // Assert
        const api = screen.getByTestId("project-switcher-folder-billing-api")
        expect(api.getAttribute("aria-checked")).toBe("true")
        expect(api.textContent).toContain("feature/invoice-rounding")
        expect(api.textContent).toContain("C:\\work\\billing-api")
        expect(screen.getByTestId("project-switcher-folder-billing-web").getAttribute("aria-checked")).toBe("false")
        expect(screen.getByTestId("project-switcher-folder-out").textContent).toContain("plain folder")
    })

    it("should list the other projects by name and show the folders of an expanded one", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-project-dotfiles"))
        await settle()

        // Assert
        const projectRows = screen.getAllByRole("menuitem").map(row => row.dataset.testid)
        expect(projectRows).toEqual(["project-switcher-project-codecharta", "project-switcher-project-dotfiles"])
        expect(screen.getByTestId("project-switcher-project-dotfiles").textContent).toContain("2 folders")
        expect(screen.getByTestId("project-switcher-folder-dotfiles").textContent).toContain("main")
        expect(screen.getByTestId("project-switcher-folder-dotfiles-work").textContent).toContain("missing")
        expect(screen.queryByTestId("project-switcher-folder-codecharta")).toBeNull()
    })

    it("should open a project from the list by choosing one of its folders", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()
        await userEvent.click(screen.getByTestId("project-switcher-project-dotfiles"))
        await settle()

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-folder-dotfiles"))
        await settle()

        // Assert
        expect(testBed.projects.activeProject()?.name).toBe("dotfiles")
        expect(testBed.loadFilesUseCase.loadProjectSnapshots).toHaveBeenCalled()
        expect(screen.queryByTestId("project-switcher-menu")).toBeNull()
    })

    it("should show the overview and close the menu", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-overview"))

        // Assert
        expect(testBed.router.navigateByUrl).toHaveBeenCalledWith("/project")
        expect(screen.queryByTestId("project-switcher-menu")).toBeNull()
    })

    it("should close the project", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-close"))
        await settle()

        // Assert
        expect(testBed.projects.activeProject()).toBeNull()
        expect(screen.getByTestId("project-switcher-trigger").textContent).toContain("No project")
    })

    it("should open the manage project dialog", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-manage"))

        // Assert
        expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
        expect(screen.queryByTestId("project-switcher-menu")).toBeNull()
    })

    it("should say that no project is open and list all projects", async () => {
        // Arrange
        await renderSwitcher({ ...SEED, activeProjectId: null })

        // Act
        await openMenu()

        // Assert
        expect(screen.getByText("No project open.")).toBeTruthy()
        expect(screen.getByText("Projects")).toBeTruthy()
        expect((screen.getByTestId("project-switcher-close") as HTMLButtonElement).disabled).toBe(true)
    })

    it("should say that there are no projects yet and open the new project dialog", async () => {
        // Arrange
        await renderSwitcher({ projects: [] })
        await openMenu()
        const noProjects = screen.getByText("No projects yet.")

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-new"))

        // Assert
        expect(noProjects).toBeTruthy()
        expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    })

    it("should open with the arrow key, move with the arrows and close with Escape", async () => {
        // Arrange
        await renderSwitcher()
        const trigger = screen.getByTestId("project-switcher-trigger")
        trigger.focus()

        // Act
        await userEvent.keyboard("{ArrowDown}")
        await settle()
        const focusedFirst = (document.activeElement as HTMLElement).dataset.testid
        await userEvent.keyboard("{ArrowDown}")
        const focusedSecond = document.activeElement
        await userEvent.keyboard("{Escape}")

        // Assert
        expect(focusedFirst).toBe("project-switcher-folder-billing-api")
        expect((focusedSecond as HTMLElement).dataset.testid).toBe("project-switcher-folder-billing-web")
        expect(screen.queryByTestId("project-switcher-menu")).toBeNull()
        expect(document.activeElement).toBe(trigger)
    })

    it("should open with the working folder focused when another view asks to choose the working folder", async () => {
        // Arrange
        await renderSwitcher()

        // Act
        TestBed.inject(FolderMenuRequestsService).request()
        await settle()

        // Assert
        expect(screen.getByTestId("project-switcher-menu")).not.toBeNull()
        expect((document.activeElement as HTMLElement).dataset.testid).toBe("project-switcher-folder-billing-api")
    })

    it("should expand and collapse a project with the arrow keys", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()
        screen.getByTestId("project-switcher-project-dotfiles").focus()

        // Act
        await userEvent.keyboard("{ArrowRight}")
        await settle()
        screen.getByTestId("project-switcher-folder-dotfiles").focus()
        await userEvent.keyboard("{ArrowLeft}")
        const focusedAfterLeft = (document.activeElement as HTMLElement).dataset.testid
        await userEvent.keyboard("{ArrowLeft}")

        // Assert
        expect(focusedAfterLeft).toBe("project-switcher-project-dotfiles")
        expect(screen.queryByTestId("project-switcher-folder-dotfiles")).toBeNull()
    })

    it("should close when clicked outside", async () => {
        // Arrange
        await renderSwitcher()
        await openMenu()

        // Act
        await userEvent.click(document.body)

        // Assert
        expect(screen.queryByTestId("project-switcher-menu")).toBeNull()
    })

    it("should pick a cc.json file from the menu and show the open dialog", async () => {
        // Arrange
        await renderSwitcher({ ...SEED, pickedImportFile: aPickedImportFile("Downloads") })
        await openMenu()

        // Act
        await userEvent.click(screen.getByTestId("project-switcher-open-file"))
        await settle()

        // Assert
        expect(screen.queryByTestId("project-switcher-menu")).toBeNull()
        expect(testBed.requestsOf("snapshots.pickImportFile")).toEqual([
            { title: "Open cc.json", filters: [{ name: "cc.json files", extensions: ["json", "gz"] }] }
        ])
        expect(screen.getByTestId("open-file-dialog").textContent).toContain("Downloads.cc.json")
        expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    })

    it("should open a cc.json file with Ctrl+O but not while typing or while a dialog is open", async () => {
        // Arrange
        await renderSwitcher()
        const input = document.createElement("input")
        document.body.append(input)
        const openDialog = document.createElement("dialog")
        openDialog.setAttribute("open", "")

        // Act
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true }))
        document.body.append(openDialog)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }))
        openDialog.remove()
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "O", metaKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }))
        await settle()
        input.remove()

        // Assert
        expect(testBed.requestsOf("snapshots.pickImportFile")).toHaveLength(1)
    })

    it("should toast when the file cannot be picked", async () => {
        // Arrange
        await renderSwitcher()
        testBed.bridge.failWith("snapshots.pickImportFile", { code: "IO", message: "No dialog", details: {} })

        // Act
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }))
        await settle()

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith("No dialog", "error")
    })
})
