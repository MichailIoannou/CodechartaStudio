import { Locator, Page } from "@playwright/test"

export class DesktopToolsPageObject {
    constructor(private readonly page: Page) {}

    async openSettings() {
        await this.page.getByRole("button", { name: "Settings", exact: true, description: "Global Configuration" }).click()
        await this.page.getByText("Global Configuration").waitFor()
    }

    panel(): Locator {
        return this.page.getByTestId("desktop-tools")
    }

    toolNames(): Locator {
        return this.panel().getByTestId("desktop-tool-name")
    }

    toolState(tool: string): Locator {
        return this.panel().getByTestId(`desktop-tool-${tool}`).getByTestId("desktop-tool-state")
    }

    summary(): Locator {
        return this.panel().getByTestId("desktop-tools-summary")
    }
}
