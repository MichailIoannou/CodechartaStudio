import { Page } from "@playwright/test"

export class SnapshotsPageObject {
    constructor(private readonly page: Page) {}

    workspaceStatus() {
        return this.page.getByTestId("workspace-status-trigger")
    }

    workspaceStatusBadge() {
        return this.page.getByTestId("workspace-status-badge")
    }

    workspaceMenu() {
        return this.page.getByTestId("workspace-status-menu")
    }

    notice() {
        return this.page.getByTestId("snapshot-notice")
    }

    async dismissTheNotice() {
        await this.page.getByTestId("snapshot-notice-dismiss").click()
    }

    async analyseFromTheNotice() {
        await this.page.getByTestId("snapshot-notice-analyse").click()
    }

    snapshotsDialog() {
        return this.page.getByTestId("snapshots-dialog")
    }

    snapshotRows() {
        return this.snapshotsDialog().getByTestId("snapshots-row")
    }

    storeUsage() {
        return this.snapshotsDialog().getByTestId("snapshots-usage")
    }

    async deleteSnapshotRow(index: number) {
        const row = this.snapshotRows().nth(index)
        await row.hover()
        await row.getByTestId("snapshots-delete").click()
        await this.page.getByTestId("delete-snapshot-confirm").click()
    }

    batchSummary() {
        return this.page.getByTestId("batch-summary")
    }

    async startBatchOfLastCommits(count: number) {
        await this.snapshotsDialog().getByTestId("snapshots-analyse-several").click()
        await this.page.getByTestId("batch-count").fill(String(count))
    }

    async confirmBatch() {
        await this.page.getByTestId("batch-start").click()
    }

    activityBatch() {
        return this.workspaceMenu().getByTestId("activity-batch")
    }

    async cancelBatch() {
        await this.activityBatch().getByTestId("activity-cancel-batch").click()
    }

    cleanupPlan() {
        return this.page.getByTestId("cleanup-plan")
    }

    async planCleanupKeeping(newestCommitAnalyses: number) {
        await this.snapshotsDialog().getByTestId("snapshots-cleanup").click()
        await this.page.getByTestId("cleanup-keep-commits").fill(String(newestCommitAnalyses))
    }

    async confirmCleanup() {
        await this.page.getByTestId("cleanup-confirm").click()
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
