import { Locator, Page } from "@playwright/test"

export class WindowControlsPageObject {
    constructor(private readonly page: Page) {}

    async openSettings() {
        await this.page.getByRole("button", { name: "Settings", exact: true, description: "Global Configuration" }).click()
        await this.page.getByText("Global Configuration").waitFor()
    }

    windowButton(name: string): Locator {
        return this.page.locator("cc-window-controls").getByRole("button", { name, exact: true })
    }

    titleBarToggle(): Locator {
        return this.page.getByRole("checkbox", { name: /Use CodeCharta's title bar/ })
    }

    restartNow(): Locator {
        return this.page.getByRole("button", { name: "Restart now" })
    }

    restartHint(): Locator {
        return this.page.getByText("Takes effect when CodeCharta restarts.")
    }

    appRegionOf(selector: string): Promise<string> {
        return this.page
            .locator(selector)
            .first()
            .evaluate(
                element =>
                    getComputedStyle(element).getPropertyValue("-webkit-app-region") ||
                    getComputedStyle(element).getPropertyValue("app-region")
            )
    }
}
