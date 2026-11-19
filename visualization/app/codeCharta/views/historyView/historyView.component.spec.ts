import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { provideRouter } from "@angular/router"
import { render, screen } from "@testing-library/angular"
import { GitHistoryPanelComponent } from "../../features/gitHistory/facade"
import { GlobalConfigurationDialogComponent } from "../../features/globalSettings/facade"
import { RelinkFolderComponent } from "../../features/projects/facade"
import { routePaths } from "../../routing/routePaths"
import { createFakeDesktopBridge } from "../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../util/desktop/desktopBridge.token"
import { HistoryViewComponent } from "./historyView.component"

const openConfiguration = jest.fn()
const startRelink = jest.fn()

@Component({ selector: "cc-global-configuration-dialog", template: "" })
class GlobalConfigurationDialogStubComponent {
    open = openConfiguration
}

@Component({ selector: "cc-relink-folder", template: "" })
class RelinkFolderStubComponent {
    start = startRelink
}

describe("HistoryViewComponent", () => {
    async function renderView({ isDesktop }: { isDesktop: boolean }) {
        TestBed.overrideComponent(HistoryViewComponent, {
            remove: { imports: [GlobalConfigurationDialogComponent, RelinkFolderComponent] },
            add: { imports: [GlobalConfigurationDialogStubComponent, RelinkFolderStubComponent] }
        })
        return render(HistoryViewComponent, {
            providers: [
                provideRouter([{ path: routePaths.metrics, children: [] }]),
                { provide: DESKTOP_BRIDGE, useValue: isDesktop ? createFakeDesktopBridge() : null }
            ]
        })
    }

    beforeEach(() => {
        openConfiguration.mockReset()
        startRelink.mockReset()
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

    it("should open the global configuration when the panel asks for the desktop tools", async () => {
        // Arrange
        const { fixture } = await renderView({ isDesktop: true })
        const panel = fixture.debugElement.query(By.directive(GitHistoryPanelComponent)).componentInstance as GitHistoryPanelComponent

        // Act
        panel.openDesktopTools.emit()

        // Assert
        expect(openConfiguration).toHaveBeenCalled()
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
})
