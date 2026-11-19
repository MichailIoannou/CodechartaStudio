import { Locator, Page } from "@playwright/test"

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
        await this.page.getByTestId("compare-base").press("Tab")
        await this.page.getByTestId("compare-head").fill(head)
        await this.page.getByTestId("compare-head").press("Tab")
        await this.page.getByTestId("compare-submit").click()
    }

    async pick(side: "base" | "head", query: string, option: string) {
        const picker = this.page.getByTestId(`compare-${side}`)
        await picker.click()
        await picker.fill(query)
        await this.page.getByTestId(`compare-${side}-list`).getByRole("option", { name: option }).click()
    }

    async submit() {
        await this.page.getByTestId("compare-submit").click()
    }

    baseModeBadge() {
        return this.page.getByTestId("comparison-base-mode")
    }

    staleBadge() {
        return this.page.getByTestId("comparison-stale")
    }

    preparation() {
        return this.page.getByTestId("compare-preparation")
    }

    async useNearest() {
        await this.page.getByTestId("compare-use-nearest").click()
    }

    async useRecent() {
        await this.page.getByTestId("compare-recent-row").first().click()
    }

    async chooseFromTheCommitMenu(commitRow: Locator, item: string) {
        await commitRow.click({ button: "right" })
        await this.page.getByTestId("commit-context-menu").getByRole("button", { name: item }).click()
    }

    async leave() {
        await this.page.getByTestId("comparison-actions").click()
        await this.page.getByTestId("comparison-leave").click()
    }
}
