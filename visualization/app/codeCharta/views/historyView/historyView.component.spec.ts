import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { provideRouter } from "@angular/router"
import { render, screen } from "@testing-library/angular"
import { GitHistoryPanelComponent } from "../../features/gitHistory/facade"
import { GlobalConfigurationOpener } from "../../features/globalSettings/facade"
import { ProjectsFacade, RelinkFolderComponent } from "../../features/projects/facade"
import { routePaths } from "../../routing/routePaths"
import { createFakeDesktopBridge } from "../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../util/desktop/desktopBridge.token"
import { HistoryViewComponent } from "./historyView.component"

const openConfiguration = jest.fn()
const startRelink = jest.fn()
const projectsFacade = {
    activeProject: () => ({ id: "p-billing" }),
    chooseFolder: jest.fn().mockResolvedValue(undefined),
    openFolderMenu: jest.fn()
}

@Component({ selector: "cc-relink-folder", template: "" })
class RelinkFolderStubComponent {
    start = startRelink
}

describe("HistoryViewComponent", () => {
    async function renderView({ isDesktop }: { isDesktop: boolean }) {
        TestBed.overrideComponent(HistoryViewComponent, {
            remove: { imports: [RelinkFolderComponent] },
            add: { imports: [RelinkFolderStubComponent] }
        })
        return render(HistoryViewComponent, {
            providers: [
                provideRouter([{ path: routePaths.metrics, children: [] }]),
                { provide: DESKTOP_BRIDGE, useValue: isDesktop ? createFakeDesktopBridge() : null },
                { provide: GlobalConfigurationOpener, useValue: { openGlobalConfiguration: openConfiguration } },
                { provide: ProjectsFacade, useValue: projectsFacade }
            ]
        })
    }

    beforeEach(() => {
        openConfiguration.mockReset()
        startRelink.mockReset()
        projectsFacade.chooseFolder.mockClear()
        projectsFacade.openFolderMenu.mockClear()
    })

    it("should explain that commit history needs the desktop app in the web build", async () => {
        // Arrange & Act
        await renderView({ isDesktop: false })

        // Assert
        expect(screen.getByText("Commit history is available in the desktop app.")).not.toBeNull()
        expect(screen.getByRole("link", { name: "Show the map" }).getAttribute("href")).toBe("/")
        expect(document.querySelector("cc-git-history-panel")).toBeNull()
    })

    it("should show the history panel inside the desktop app", async () => {
        // Arrange & Act
        await renderView({ isDesktop: true })

        // Assert
        expect(screen.queryByTestId("history-desktop-only")).toBeNull()
        expect(document.querySelector("cc-git-history-panel")).not.toBeNull()
    })

    it("should open the global configuration at git's desktop tools row when the panel asks for the desktop tools", async () => {
        // Arrange
        const { fixture } = await renderView({ isDesktop: true })
        const panel = fixture.debugElement.query(By.directive(GitHistoryPanelComponent)).componentInstance as GitHistoryPanelComponent

        // Act
        panel.openDesktopTools.emit()

        // Assert
        expect(openConfiguration).toHaveBeenCalledWith({ section: "desktopTools", tool: "git" })
    })

    it("should re-link the folder the panel names", async () => {
        // Arrange
        const { fixture } = await renderView({ isDesktop: true })
        const panel = fixture.debugElement.query(By.directive(GitHistoryPanelComponent)).componentInstance as GitHistoryPanelComponent

        // Act
        panel.relinkFolder.emit({ id: "f-api", label: "billing-api" })

        // Assert
        expect(startRelink).toHaveBeenCalledWith({ id: "f-api", label: "billing-api" })
    })

    it("should make the folder the panel names the working folder of the active project and stay in the History", async () => {
        // Arrange
        const { fixture } = await renderView({ isDesktop: true })
        const panel = fixture.debugElement.query(By.directive(GitHistoryPanelComponent)).componentInstance as GitHistoryPanelComponent

        // Act
        panel.workInFolder.emit({ id: "f-web", label: "billing-web" })

        // Assert
        expect(projectsFacade.chooseFolder).toHaveBeenCalledWith({ projectId: "p-billing", folderId: "f-web", staysOnView: true })
    })

    it("should open the project menu when the panel asks to choose the working folder", async () => {
        // Arrange
        const { fixture } = await renderView({ isDesktop: true })
        const panel = fixture.debugElement.query(By.directive(GitHistoryPanelComponent)).componentInstance as GitHistoryPanelComponent

        // Act
        panel.chooseWorkingFolder.emit()

        // Assert
        expect(projectsFacade.openFolderMenu).toHaveBeenCalled()
    })
})
