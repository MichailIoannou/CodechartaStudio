import { Page } from "@playwright/test"

export class ProjectsPageObject {
    constructor(private readonly page: Page) {}

    switcherTrigger() {
        return this.page.getByTestId("project-switcher-trigger")
    }

    overview() {
        return this.page.getByTestId("project-overview")
    }

    overviewFolders() {
        return this.page.getByTestId("project-overview-folders").locator("li span.font-semibold")
    }

    viewSwitcher() {
        return this.page.getByTestId("view-switcher")
    }

    async openMenu() {
        await this.switcherTrigger().click()
    }

    async chooseFolderOfOtherProject(projectName: string, folderLabel: string) {
        await this.openMenu()
        await this.page.getByTestId(`project-switcher-project-${projectName}`).click()
        await this.page.getByTestId(`project-switcher-folder-${folderLabel}`).click()
    }

    async createProject(name: string, folderCount: number) {
        await this.page.getByTestId("project-overview-new-project").click()
        const dialog = this.page.locator("dialog[open]")
        for (let added = 0; added < folderCount; added++) {
            await dialog.getByTestId("create-project-add-folder").click()
        }
        await dialog.locator("#create-project-name").fill(name)
        await dialog.getByTestId("create-project-submit").click()
    }

    openFileDialog() {
        return this.page.locator("dialog[open]").filter({ has: this.page.getByTestId("open-file-submit") })
    }

    async openFileWithShortcut() {
        await this.page.keyboard.press("Control+o")
    }
}
