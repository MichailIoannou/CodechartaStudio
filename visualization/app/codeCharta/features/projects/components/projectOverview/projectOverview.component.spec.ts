import { TestBed } from "@angular/core/testing"
import { screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aCommit, aFolder, aGitStatus, aPickedFolder, aProject, aSnapshot } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { ProjectOverviewComponent } from "./projectOverview.component"

const API = aFolder("f-api", {
    label: "billing-api",
    path: "C:\\work\\billing-api",
    git: {
        topLevel: "C:\\work\\billing-api",
        isRepositoryRoot: true,
        remotes: [{ name: "origin", url: "https://github.com/acme/billing-api.git" }],
        defaultBranch: "main",
        rootCommits: ["r".repeat(40)],
        isShallow: false,
        detectedAt: ""
    }
})
const WEB = aFolder("f-web", { label: "billing-web", role: "fork" })
const OUT = aFolder("f-out", { label: "out", role: "helper", kind: "plain" })
const BILLING = aProject("p-billing", [API, WEB, OUT], {
    name: "billing",
    description: "Invoicing services.",
    updatedAt: "2026-11-02T00:00:00Z"
})
const DOTFILES = aProject("p-dots", [aFolder("f-dots", { label: "dotfiles", status: "missing" })], {
    name: "dotfiles",
    updatedAt: "2026-11-10T00:00:00Z"
})
const HEAD = aCommit("a1b2c3d", "Fix invoice rounding")
const RELEASE = aCommit("9f8e7d6", "Release 2.4.0", { authorName: "Jo Park" })
const STATUS = aGitStatus("feature/invoice-rounding", {
    upstream: { refName: "refs/remotes/origin/x", name: "origin/feature/invoice-rounding", ahead: 2, behind: 1, isGone: false },
    counts: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 }
})
const SEED: FakeDesktopSeed = {
    projects: [BILLING, DOTFILES],
    activeProjectId: "p-billing",
    snapshots: [
        aSnapshot("p-billing", "f-api", "s-release", {
            shortCommit: "9f8e7d6",
            commit: RELEASE.sha,
            subject: "Release 2.4.0",
            durationMs: 72_000
        }),
        aSnapshot("p-billing", "f-out", "s-out", { source: "imported", originalFileName: "out.cc.json" })
    ],
    gitStatuses: { "f-api": STATUS, "f-web": aGitStatus("main") },
    gitLogs: { "f-api": [HEAD, RELEASE] }
}

function cellsOf(row: HTMLElement): string[] {
    const cells = row.firstElementChild?.tagName === "BUTTON" ? row.firstElementChild.children : row.children
    return Array.from(cells, cell => cell.textContent?.trim() ?? "")
}

describe("ProjectOverviewComponent", () => {
    let testBed: ProjectsTestBed

    async function renderOverview(seed: FakeDesktopSeed = SEED) {
        testBed = await setUpProjects(seed)
        const fixture = TestBed.createComponent(ProjectOverviewComponent)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    it("should show the working folder, its git state and its analyses", async () => {
        // Arrange & Act
        await renderOverview()

        // Assert
        expect(screen.getByRole("heading", { name: "billing" })).toBeTruthy()
        expect(screen.getByText("Invoicing services.")).toBeTruthy()
        const git = screen.getByTestId("working-folder-git")
        expect(git.textContent).toContain("feature/invoice-rounding")
        expect(git.textContent).toContain("2 to push")
        expect(git.textContent).toContain("1 to pull")
        expect(git.textContent).toContain("3 uncommitted (1 staged)")
        expect(git.textContent).toContain("Fix invoice rounding")
        expect(git.textContent).toContain("origin github.com/acme/billing-api")
        expect(screen.getByTestId("analyses-rows").textContent).toContain("Release 2.4.0")
        expect(screen.getByTestId("analyses-rows").textContent).toContain("took 1 min 12 s")
    })

    it("should mark the head and the analysed commits in the recent commits", async () => {
        // Arrange & Act
        await renderOverview()

        // Assert
        const rows = within(screen.getByTestId("project-overview-commits")).getAllByRole("listitem")
        expect(rows.map(cellsOf)).toEqual([
            ["", "a1b2c3d", "Fix invoice rounding", "Mia Chen", expect.stringMatching(/ago$/), ""],
            ["", "9f8e7d6", "Release 2.4.0", "Jo Park", expect.stringMatching(/ago$/), "analysed"]
        ])
        expect(rows[0].querySelector("i")?.classList.contains("fa-regular")).toBe(true)
    })

    it("should list the folders with their branch, analyses and the plain-folder hint", async () => {
        // Arrange & Act
        await renderOverview()

        // Assert
        const api = screen.getByTestId("project-overview-folder-billing-api").textContent ?? ""
        const web = screen.getByTestId("project-overview-folder-billing-web").textContent ?? ""
        const out = screen.getByTestId("project-overview-folder-out").textContent ?? ""
        expect(api).toContain("1 analysis")
        expect(api).toContain("(working)")
        expect(web).toContain("main")
        expect(web).toContain("Work here")
        expect(out).toContain("plain folder")
        expect(out).toContain("1 imported")
        expect(out).toContain("Imported maps only. Add the repository folder and move the snapshot to it.")
    })

    it("should switch the working folder with Work here", async () => {
        // Arrange
        await renderOverview()
        const web = screen.getByTestId("project-overview-folder-billing-web")

        // Act
        await userEvent.click(within(web).getByRole("button", { name: "Work here" }))
        await settle()

        // Assert
        expect(testBed.projects.workingFolder()?.label).toBe("billing-web")
    })

    it("should add a picked folder from the header", async () => {
        // Arrange
        await renderOverview({ ...SEED, pickedFolders: [aPickedFolder("billing-docs")] })

        // Act
        await userEvent.click(screen.getByTestId("project-overview-add-folder"))
        await settle()

        // Assert
        expect(testBed.projects.activeProject()?.folders.map(folder => folder.label)).toContain("billing-docs")
    })

    it("should reveal the working folder", async () => {
        // Arrange
        await renderOverview()

        // Act
        await userEvent.click(screen.getByTestId("working-folder-show-in-files"))

        // Assert
        expect(testBed.requestsOf("projects.revealFolder")).toEqual([{ projectId: "p-billing", folderId: "f-api" }])
    })

    it("should read the git state again on window focus, at most every few seconds", async () => {
        // Arrange
        await renderOverview()
        const statusReads = testBed.requestsOf("git.status").length
        jest.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000)

        // Act
        window.dispatchEvent(new Event("focus"))
        window.dispatchEvent(new Event("focus"))
        await settle()

        // Assert
        expect(testBed.requestsOf("git.status").length).toBe(statusReads + 2)
        jest.restoreAllMocks()
    })

    it("should list the projects by last update when no project is open", async () => {
        // Arrange & Act
        await renderOverview({ ...SEED, activeProjectId: null })

        // Assert
        expect(screen.getByText("Open a project to see its code as a city.")).toBeTruthy()
        const rows = screen.getAllByRole("button").filter(button => button.dataset.testid?.startsWith("project-overview-project-"))
        expect(rows.map(cellsOf)).toEqual([
            ["", "dotfiles", "1 folder · 0 analyses", "1 folder missing", ""],
            ["", "billing", "3 folders · 2 analyses", ""]
        ])
    })

    it("should open a project from the list", async () => {
        // Arrange
        await renderOverview({ ...SEED, activeProjectId: null })

        // Act
        await userEvent.click(screen.getByTestId("project-overview-project-billing"))
        await settle()

        // Assert
        expect(testBed.projects.activeProject()?.name).toBe("billing")
    })

    it("should say that there are no projects yet and offer the sample maps", async () => {
        // Arrange
        await renderOverview({ projects: [] })

        // Act
        await userEvent.click(screen.getByTestId("project-overview-samples"))

        // Assert
        expect(screen.getByText(/No projects yet\./)).toBeTruthy()
        expect(testBed.loadFilesUseCase.showSampleFiles).toHaveBeenCalled()
    })

    it("should show the store problem with a way to try again and to open the store folder", async () => {
        // Arrange
        await renderOverview({ ...SEED, responses: { "store.status": { problem: "STORE_LOCKED" } } })

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Open store folder" }))
        await userEvent.click(screen.getByRole("button", { name: "Try again" }))
        await settle()

        // Assert
        expect(screen.getByTestId("project-overview-store-problem").textContent).toContain(
            "Another CodeCharta window is using the store. Close it and try again."
        )
        expect(testBed.bridge.calls.filter(call => call.name === "reveal")).toHaveLength(1)
        expect(testBed.requestsOf("store.status")).toHaveLength(2)
    })
})
