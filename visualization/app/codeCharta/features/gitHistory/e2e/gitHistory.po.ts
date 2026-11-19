import { Page } from "@playwright/test"

export class GitHistoryPageObject {
    constructor(private readonly page: Page) {}

    tab() {
        return this.page.getByTestId("view-switcher-history")
    }

    repository() {
        return this.page.getByTestId("history-repository")
    }

    currentBranch() {
        return this.page.getByTestId("history-current-branch")
    }

    branchRow(id: string) {
        return this.page.locator(`[data-row-id="${id}"]`)
    }

    scopeChip() {
        return this.page.getByTestId("commit-scope-chip")
    }

    problemNotice() {
        return this.page.getByTestId("git-problem-notice")
    }

    commitListHeader() {
        return this.page.getByTestId("commit-list-header")
    }

    commitRows() {
        return this.page.getByTestId("commit-row")
    }

    uncommittedChangesRow() {
        return this.page.getByTestId("commit-row-working-tree")
    }

    commitDetails() {
        return this.page.getByTestId("commit-details")
    }

    changedFiles() {
        return this.page.getByTestId("changed-file")
    }

    search() {
        return this.page.getByTestId("history-search")
    }

    syncButton() {
        return this.page.getByTestId("sync-button-main")
    }

    cancelSync() {
        return this.page.getByTestId("sync-button-cancel")
    }

    workspaceStatus() {
        return this.page.getByTestId("workspace-status-trigger")
    }

    confirmDialog() {
        return this.page.getByTestId("git-confirm-dialog")
    }

    async confirm(answer: "yes" | "verb") {
        await this.page.getByTestId(`git-confirm-${answer}`).click()
    }

    credentialPrompt() {
        return this.page.getByTestId("credential-prompt")
    }

    credentialInput() {
        return this.page.getByTestId("credential-prompt-input")
    }

    branchDialog() {
        return this.page.getByTestId("branch-dialog")
    }

    toasts() {
        return this.page.locator("cc-toast .alert")
    }

    changesTab() {
        return this.page.getByTestId("history-tab-changes")
    }

    changeRow(key: string) {
        return this.page.locator(`[data-row-key="${key}"]`)
    }

    groupHeaders() {
        return this.page.getByTestId("changes-group-toggle")
    }

    diffView() {
        return this.page.getByTestId("diff-view")
    }

    diffLines() {
        return this.page.getByTestId("diff-line")
    }

    commitSummary() {
        return this.page.getByTestId("commit-summary")
    }

    commitButton() {
        return this.page.getByTestId("commit-button")
    }

    async open() {
        await this.tab().click()
        await this.repository().waitFor({ state: "visible" })
    }
}
