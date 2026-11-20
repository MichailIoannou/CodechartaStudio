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

    it("should switch the working folder as the project menu does", async () => {
        // Arrange
        const project = aProject("p-1", [aFolder("f-1"), aFolder("f-2")])
        await setUpProjects({ projects: [project], activeProjectId: "p-1" })
        const facade = TestBed.inject(ProjectsFacade)

        // Act
        await facade.chooseFolder({ projectId: "p-1", folderId: "f-2" })

        // Assert
        expect(facade.workingFolder()?.id).toBe("f-2")
    })

    it("should ask the project menu to open for choosing the working folder", async () => {
        // Arrange
        const { projects } = await setUpProjects({ projects: [aProject("p-1", [aFolder("f-1")])], activeProjectId: "p-1" })
        const facade = TestBed.inject(ProjectsFacade)
        const before = projects.folderMenuRequest()

        // Act
        facade.openFolderMenu()

        // Assert
        expect(projects.folderMenuRequest()).toBe(before + 1)
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
