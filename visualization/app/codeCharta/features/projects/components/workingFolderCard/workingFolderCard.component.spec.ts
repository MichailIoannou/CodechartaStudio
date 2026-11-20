import type { Provider } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { GitRepositoryService, WORKING_FOLDER_SOURCE } from "../../../gitHistory/facade"
import { aLocalBranch, anUpstream, aRefs, aRepositoryInfo } from "../../../gitHistory/services/gitApi.mocks"
import { GitConfirmationService } from "../../../gitHistory/services/gitConfirmation.service"
import { aFolder, aGitStatus, aProject } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { ProjectsFacade } from "../../services/projectsFacade"
import { WorkingFolderCardComponent } from "./workingFolderCard.component"

describe("WorkingFolderCardComponent", () => {
    let testBed: ProjectsTestBed

    function bridgeRequests(method: string) {
        return testBed.bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])
    }

    async function renderCard(
        folder: ProjectFolder,
        seed: FakeDesktopSeed = {},
        { fetchStatus = true, providers = [] as Provider[] } = {}
    ) {
        testBed = await setUpProjects({ projects: [aProject("p-1", [folder])], activeProjectId: "p-1", ...seed }, { providers })
        if (fetchStatus) {
            await TestBed.inject(GitRepositoryService).refreshFolders([{ projectId: "p-1", folderId: folder.id }])
        }
        const fixture = TestBed.createComponent(WorkingFolderCardComponent)
        fixture.componentRef.setInput("folder", folder)
        fixture.componentRef.setInput("now", Date.now())
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    it("should say that a plain folder has no git history", async () => {
        // Arrange & Act
        await renderCard(aFolder("f-out", { kind: "plain" }))

        // Assert
        expect(screen.getByText("Plain folder — no git history.")).toBeTruthy()
        expect(screen.queryByTestId("working-folder-git")).toBeNull()
    })

    it("should warn about a missing folder", async () => {
        // Arrange & Act
        await renderCard(aFolder("f-gone", { status: "missing" }))

        // Assert
        expect(screen.getByTestId("working-folder-missing").textContent).toContain(
            "This folder was not found on disk. Its analyses still open."
        )
    })

    it("should show what git answered when it could not read the folder", async () => {
        // Arrange & Act
        await renderCard(aFolder("f-api"))

        // Assert
        expect(screen.getByTestId("working-folder-git-problem").textContent).toContain("no repository for f-api")
    })

    it("should show skeleton rows while the git state is unknown", async () => {
        // Arrange & Act
        await renderCard(aFolder("f-api"), {}, { fetchStatus: false })

        // Assert
        expect(screen.getByTestId("working-folder-git").querySelectorAll(".skeleton").length).toBe(6)
    })

    it("should name a detached head, a missing upstream and a merge in progress", async () => {
        // Arrange
        const status = aGitStatus("main", {
            head: { kind: "detached", commit: "a1b2c3d4e5" },
            counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 2 },
            operationInProgress: "merge"
        })

        // Act
        await renderCard(aFolder("f-api"), { gitStatuses: { "f-api": status } })

        // Assert
        const git = screen.getByTestId("working-folder-git").textContent ?? ""
        expect(git).toContain("detached at a1b2c3d")
        expect(git).toContain("no upstream")
        expect(screen.getByText("merge in progress — 2 conflicts").classList.contains("text-warning")).toBe(true)
    })

    it("should push with the sync button next to the upstream and then read in sync", async () => {
        // Arrange
        const upstream = anUpstream("origin/main", { ahead: 1 })
        const refs = aRefs({
            localBranches: [aLocalBranch("main", { isCurrent: true, upstream })],
            remotes: [{ name: "origin", url: "https://example.com/acme/billing-api.git" }]
        })
        await renderCard(
            aFolder("f-api"),
            { git: { "f-api": { info: aRepositoryInfo(), status: aGitStatus("main", { upstream }), refs } } },
            { providers: [{ provide: WORKING_FOLDER_SOURCE, useExisting: ProjectsFacade }] }
        )
        jest.spyOn(TestBed.inject(GitConfirmationService), "ask").mockResolvedValue(true)
        const main = within(screen.getByTestId("working-folder-upstream")).getByTestId("sync-button-main")
        const title = main.title

        // Act
        await userEvent.click(main)
        await settle()

        // Assert
        expect(title).toBe("Push 1 commit to origin/main")
        expect(screen.getByTestId("working-folder-upstream").textContent).toContain("in sync")
        expect(bridgeRequests("git.push")).toEqual([
            expect.objectContaining({ repo: { projectId: "p-1", folderId: "f-api" }, remote: "origin" })
        ])
    })
})
