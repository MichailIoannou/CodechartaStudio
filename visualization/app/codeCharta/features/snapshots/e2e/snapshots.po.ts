import { Page } from "@playwright/test"

export class SnapshotsPageObject {
    constructor(private readonly page: Page) {}

    workspaceStatus() {
        return this.page.getByTestId("workspace-status-trigger")
    }

    workspaceMenu() {
        return this.page.getByTestId("workspace-status-menu")
    }

    notice() {
        return this.page.getByTestId("snapshot-notice")
    }

    async analyseFromTheNotice() {
        await this.page.getByTestId("snapshot-notice-analyse").click()
    }

    snapshotsDialog() {
        return this.page.getByTestId("snapshots-dialog")
    }

    async analyseCurrentCheckoutFromTheStatus() {
        await this.openWorkspaceMenu()
        await this.page.getByTestId("workspace-status-analyse").click()
    }

    async openSnapshotsDialog() {
        await this.openWorkspaceMenu()
        await this.page.getByTestId("workspace-status-snapshots").click()
    }

    private async openWorkspaceMenu() {
        if (!(await this.workspaceMenu().isVisible())) {
            await this.workspaceStatus().click()
        }
    }

    async completeJob(jobId: string) {
        await this.page.evaluate(
            id => (window as unknown as { codeChartaDesktop: { completeJob(id: string): void } }).codeChartaDesktop.completeJob(id),
            jobId
        )
    }
}
