import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { GitRepositoryService } from "../../../gitHistory/facade"
import { aFolder, aGitStatus, aProject } from "../../projects.mocks"
import { settle, setUpProjects } from "../../projectsTestBed.mocks"
import { WorkingFolderCardComponent } from "./workingFolderCard.component"

describe("WorkingFolderCardComponent", () => {
    async function renderCard(folder: ProjectFolder, seed: FakeDesktopSeed = {}, { fetchStatus = true } = {}) {
        await setUpProjects({ projects: [aProject("p-1", [folder])], activeProjectId: "p-1", ...seed })
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
})
