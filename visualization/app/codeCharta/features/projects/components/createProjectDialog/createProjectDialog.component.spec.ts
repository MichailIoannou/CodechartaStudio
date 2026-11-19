import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FolderGitFacts } from "../../../../model/coreApi/FolderGitFacts"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aPickedFolder } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { CreateProjectDialogComponent } from "./createProjectDialog.component"

function gitWithRoots(...rootCommits: string[]): FolderGitFacts {
    return {
        topLevel: "/work",
        isRepositoryRoot: true,
        remotes: [{ name: "origin", url: "git@github.com:acme/billing-api.git" }],
        defaultBranch: "main",
        rootCommits,
        isShallow: false,
        detectedAt: ""
    }
}

describe("CreateProjectDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function openDialog(seed: FakeDesktopSeed = {}) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()
        testBed = await setUpProjects({ projects: [], ...seed }, { initialise: false })
        const fixture = TestBed.createComponent(CreateProjectDialogComponent)
        fixture.autoDetectChanges()
        fixture.componentInstance.open()
        await settle()
        return fixture
    }

    async function addFolder() {
        await userEvent.click(screen.getByTestId("create-project-add-folder"))
        await settle()
    }

    function labels() {
        return screen.queryAllByLabelText("Folder label").map(input => (input as HTMLInputElement).value)
    }

    function roles() {
        return Array.from(screen.getByTestId("folder-list").querySelectorAll("select"), select => select.value)
    }

    it("should add a picked folder with its suggested label and name the project after it", async () => {
        // Arrange
        await openDialog({ pickedFolders: [aPickedFolder("billing-api", { git: gitWithRoots("r1") })] })

        // Act
        await addFolder()

        // Assert
        expect(labels()).toEqual(["billing-api"])
        expect(roles()).toEqual(["primary"])
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("billing-api")
        expect(screen.getByTestId("folder-list").textContent).toContain("origin github.com/acme/billing-api")
    })

    it("should preselect fork for a folder sharing history with the primary", async () => {
        // Arrange
        await openDialog({
            pickedFolders: [
                aPickedFolder("billing-api", { git: gitWithRoots("r1") }),
                aPickedFolder("billing-fork", { git: gitWithRoots("r1") }),
                aPickedFolder("out", { kind: "plain" })
            ]
        })

        // Act
        await addFolder()
        await addFolder()
        await addFolder()

        // Assert
        expect(roles()).toEqual(["primary", "fork", "helper"])
        expect(screen.getByTestId("folder-list").textContent).toContain("shares history with billing-api")
    })

    it("should keep a typed name when folders are added", async () => {
        // Arrange
        await openDialog({ pickedFolders: [aPickedFolder("billing-api")] })
        await userEvent.type(screen.getByLabelText("Name"), "billing")

        // Act
        await addFolder()

        // Assert
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("billing")
    })

    it("should disable Create without a name and say so once the name was touched", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(screen.getByLabelText("Name"))
        await userEvent.tab()

        // Assert
        expect((screen.getByTestId("create-project-submit") as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText("A name is required.")).toBeTruthy()
    })

    it("should say that a folder is already in the list", async () => {
        // Arrange
        await openDialog({ pickedFolders: [aPickedFolder("billing-api"), aPickedFolder("billing-api", { pickToken: "f".repeat(32) })] })

        // Act
        await addFolder()
        await addFolder()

        // Assert
        expect(labels()).toEqual(["billing-api"])
        expect(testBed.toastService.show).toHaveBeenCalledWith("'/work/billing-api' is already part of this project.", "info")
    })

    it("should demote the former primary when another folder becomes primary", async () => {
        // Arrange
        await openDialog({ pickedFolders: [aPickedFolder("billing-api"), aPickedFolder("billing-web")] })
        await addFolder()
        await addFolder()

        // Act
        await userEvent.selectOptions(screen.getByLabelText("Role of billing-web"), "primary")

        // Assert
        expect(roles()).toEqual(["helper", "primary"])
    })

    it("should rename and remove folders before creating", async () => {
        // Arrange
        await openDialog({ pickedFolders: [aPickedFolder("billing-api"), aPickedFolder("out")] })
        await addFolder()
        await addFolder()

        // Act
        const [apiLabel] = screen.getAllByLabelText("Folder label")
        await userEvent.clear(apiLabel)
        await userEvent.type(apiLabel, "api{Enter}")
        await userEvent.click(screen.getByLabelText("Remove folder out"))
        await userEvent.click(screen.getByTestId("create-project-submit"))
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.create")).toEqual([
            { name: "billing-api", folders: [{ pickToken: aPickedFolder("billing-api").pickToken, label: "api", role: "primary" }] }
        ])
        expect(testBed.projects.activeProject()?.name).toBe("billing-api")
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should create with Ctrl+Enter", async () => {
        // Arrange
        await openDialog()
        await userEvent.type(screen.getByLabelText("Name"), "empty project")

        // Act
        await userEvent.keyboard("{Control>}{Enter}{/Control}")
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.create")).toEqual([{ name: "empty project", folders: [] }])
    })

    it("should show the bridge error in the dialog and stay open", async () => {
        // Arrange
        await openDialog()
        testBed.bridge.failWith("projects.create", { code: "IO", message: "The store is read-only.", details: {} })
        await userEvent.type(screen.getByLabelText("Name"), "billing")

        // Act
        await userEvent.click(screen.getByTestId("create-project-submit"))
        await settle()

        // Assert
        expect(screen.getByTestId("create-project-failure").textContent).toContain("The store is read-only.")
        expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled()
    })
})
