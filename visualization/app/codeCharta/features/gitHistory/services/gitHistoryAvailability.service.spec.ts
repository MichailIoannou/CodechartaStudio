import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import type { Project } from "../../../model/coreApi/Project"
import { routeLinks, routePaths } from "../../../routing/routePaths"
import { createFakeDesktopBridge } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { WORKING_FOLDER_SOURCE } from "../ports/workingFolderSource.port"
import { GitHistoryAvailability } from "./gitHistoryAvailability.service"

describe("GitHistoryAvailability", () => {
    const activeProject = signal<Project | null>(null)

    function availabilityWith(project: Project | null, { isDesktop = true } = {}) {
        activeProject.set(project)
        TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: routePaths.metrics, children: [] },
                    { path: routePaths.history, children: [] }
                ]),
                { provide: DESKTOP_BRIDGE, useValue: isDesktop ? createFakeDesktopBridge() : null },
                { provide: WORKING_FOLDER_SOURCE, useValue: { activeProject, workingFolder: signal(null) } }
            ]
        })
        return TestBed.inject(GitHistoryAvailability)
    }

    async function showTheHistory() {
        const router = TestBed.inject(Router)
        await router.navigateByUrl(routeLinks.history)
        TestBed.tick()
        return router
    }

    it("should hide the history without the desktop bridge", () => {
        // Arrange
        const availability = availabilityWith(aProject("billing", [aFolder("f-api")]), { isDesktop: false })

        // Act
        const isAvailable = availability.isAvailable()

        // Assert
        expect(isAvailable).toBe(false)
    })

    it("should hide the history without an open project", () => {
        // Arrange
        const availability = availabilityWith(null)

        // Act
        const isAvailable = availability.isAvailable()

        // Assert
        expect(isAvailable).toBe(false)
    })

    it("should hide the history for a project without a git folder", () => {
        // Arrange
        const availability = availabilityWith(aProject("notes", [aFolder("f-notes", { kind: "plain" })]))

        // Act
        const isAvailable = availability.isAvailable()

        // Assert
        expect(isAvailable).toBe(false)
    })

    it("should show the history for an open project with a git folder", () => {
        // Arrange
        const availability = availabilityWith(aProject("billing", [aFolder("f-notes", { kind: "plain" }), aFolder("f-api")]))

        // Act
        const isAvailable = availability.isAvailable()

        // Assert
        expect(isAvailable).toBe(true)
    })

    it("should hide the history when no source of projects is provided", () => {
        // Arrange
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: createFakeDesktopBridge() }] })

        // Act
        const isAvailable = TestBed.inject(GitHistoryAvailability).isAvailable()

        // Assert
        expect(isAvailable).toBe(false)
    })

    it("should leave the history for the metrics view when the project closes", async () => {
        // Arrange
        availabilityWith(aProject("billing", [aFolder("f-api")]))
        const router = await showTheHistory()
        const navigateByUrl = jest.spyOn(router, "navigateByUrl")

        // Act
        activeProject.set(null)
        TestBed.tick()

        // Assert
        expect(navigateByUrl).toHaveBeenCalledWith(routeLinks.metrics, { replaceUrl: true })
    })

    it("should stay in the history while it remains available", async () => {
        // Arrange
        availabilityWith(aProject("billing", [aFolder("f-api")]))
        const router = await showTheHistory()
        const navigateByUrl = jest.spyOn(router, "navigateByUrl")

        // Act
        activeProject.set(aProject("billing", [aFolder("f-api"), aFolder("f-web")]))
        TestBed.tick()

        // Assert
        expect(navigateByUrl).not.toHaveBeenCalled()
    })

    it("should keep the history route of the web build, which explains the desktop app", async () => {
        // Arrange
        availabilityWith(null, { isDesktop: false })
        const router = await showTheHistory()

        // Act
        TestBed.tick()

        // Assert
        expect(router.url).toBe(routeLinks.history)
    })
})
