import { provideRouter } from "@angular/router"
import { render, screen } from "@testing-library/angular"
import { routePaths } from "../../routing/routePaths"
import { createFakeDesktopBridge } from "../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../util/desktop/desktopBridge.token"
import { HistoryViewComponent } from "./historyView.component"

describe("HistoryViewComponent", () => {
    async function renderView({ isDesktop }: { isDesktop: boolean }) {
        return render(HistoryViewComponent, {
            providers: [
                provideRouter([{ path: routePaths.metrics, children: [] }]),
                { provide: DESKTOP_BRIDGE, useValue: isDesktop ? createFakeDesktopBridge() : null }
            ]
        })
    }

    it("should explain that commit history needs the desktop app in the web build", async () => {
        // Arrange & Act
        await renderView({ isDesktop: false })

        // Assert
        expect(screen.getByText("Commit history is available in the desktop app.")).not.toBeNull()
        expect(screen.getByRole("link", { name: "Show the map" }).getAttribute("href")).toBe("/")
    })

    it("should not explain the desktop app inside the desktop app", async () => {
        // Arrange & Act
        await renderView({ isDesktop: true })

        // Assert
        expect(screen.queryByTestId("history-desktop-only")).toBeNull()
    })
})
