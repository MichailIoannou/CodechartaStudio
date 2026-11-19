import { Page } from "@playwright/test"

export class ComparePageObject {
    constructor(private readonly page: Page) {}

    dialog() {
        return this.page.getByTestId("compare-dialog")
    }

    chip() {
        return this.page.getByTestId("comparison-chip")
    }

    async openTheLegend() {
        await this.page.getByTestId("legend-panel-button").click()
    }

    legendCaption() {
        return this.page.getByTestId("comparison-legend-caption")
    }

    async openTheDialogFromTheCompareTab() {
        await this.page.mouse.move(0, 0)
        await this.page.locator("[data-testid=view-switcher-metrics]").hover()
        await this.page.getByRole("tab", { name: "Compare" }).click()
        await this.dialog().waitFor({ state: "visible" })
    }

    async compare(base: string, head: string) {
        await this.page.getByTestId("compare-base").fill(base)
        await this.page.getByTestId("compare-head").fill(head)
        await this.page.getByTestId("compare-submit").click()
    }

    async leave() {
        await this.page.getByTestId("comparison-actions").click()
        await this.page.getByTestId("comparison-leave").click()
    }
}
