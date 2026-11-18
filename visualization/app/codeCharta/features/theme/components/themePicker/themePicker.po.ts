import { Locator, Page } from "@playwright/test"

export class ThemePickerPageObject {
    constructor(private readonly page: Page) {}

    async pick(label: string) {
        await this.page.getByRole("button", { name: "Settings", exact: true, description: "Global Configuration" }).click()
        await this.page.getByText("Global Configuration").waitFor()
        await this.page.getByTestId("theme-picker").selectOption({ label })
        await this.page.keyboard.press("Escape")
    }

    documentRoot(): Locator {
        return this.page.locator("html")
    }

    /** The map canvas keeps its drawing buffer, so its corner can be copied into a 2D canvas and read back. */
    mapCornerColor(): Promise<string> {
        return this.page.evaluate(() => {
            const scene = document.querySelector<HTMLCanvasElement>("#codeMapScene")
            const probe = document.createElement("canvas")
            probe.width = 1
            probe.height = 1
            const context = probe.getContext("2d")
            context.drawImage(scene, 0, 0, 1, 1, 0, 0, 1, 1)
            const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
            return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, "0")).join("")}`
        })
    }
}
