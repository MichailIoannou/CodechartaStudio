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

    async open() {
        await this.tab().click()
        await this.repository().waitFor({ state: "visible" })
    }
}
