import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../projects.mocks"
import { settle, setUpProjects } from "../../projectsTestBed.mocks"
import { WorkingFolderCardComponent } from "./workingFolderCard.component"

describe("WorkingFolderCardComponent", () => {
    async function renderCard(folder: ProjectFolder, seed: FakeDesktopSeed = {}) {
        await setUpProjects({ projects: [aProject("p-1", [folder])], activeProjectId: "p-1", ...seed })
        const fixture = TestBed.createComponent(WorkingFolderCardComponent)
        fixture.componentRef.setInput("folder", folder)
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

    it("should list the remotes of a git folder", async () => {
        // Arrange
        const git = {
            topLevel: "/work/f-api",
            isRepositoryRoot: true,
            remotes: [{ name: "origin", url: "git@github.com:acme/api.git" }],
            defaultBranch: "main",
            rootCommits: [],
            isShallow: false,
            detectedAt: "2026-11-19T08:00:00Z"
        }

        // Act
        await renderCard(aFolder("f-api", { git }))

        // Assert
        expect(screen.getByTestId("working-folder-git").textContent).toContain("origin github.com/acme/api")
    })
})
