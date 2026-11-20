import { TestBed } from "@angular/core/testing"
import { aFolder, aProject } from "../projects.mocks"
import { setUpProjects } from "../projectsTestBed.mocks"
import { ProjectsFacade } from "./projectsFacade"

describe("ProjectsFacade", () => {
    it("should tell whether a project is open in the desktop app", async () => {
        // Arrange
        const { projects } = await setUpProjects({ projects: [aProject("p-1", [aFolder("f-1")])], activeProjectId: "p-1" })
        const facade = TestBed.inject(ProjectsFacade)
        const whileOpen = facade.hasActiveProject()

        // Act
        await projects.openProject(null)

        // Assert
        expect(facade.isDesktop()).toBe(true)
        expect(whileOpen).toBe(true)
        expect(facade.hasActiveProject()).toBe(false)
    })

    it("should keep the provider of an unrecognised host on the folder", async () => {
        // Arrange
        const { projects } = await setUpProjects({ projects: [aProject("p-1", [aFolder("f-1")])], activeProjectId: "p-1" })
        const facade = TestBed.inject(ProjectsFacade)

        // Act
        await facade.setFolderHosting("f-1", { provider: "github", host: "git.example.org" })

        // Assert
        expect(projects.activeProject()?.folders[0].hosting).toEqual({ provider: "github", host: "git.example.org" })
    })
})
