import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitProblemNotice } from "../../util/gitErrorText"
import { GitProblemNoticeComponent } from "./gitProblemNotice.component"

describe("GitProblemNoticeComponent", () => {
    async function renderNotice(notice: GitProblemNotice) {
        return render(GitProblemNoticeComponent, { inputs: { notice } })
    }

    it("should show the sentence without an action when there is nothing to do", async () => {
        // Arrange & Act
        await renderNotice({ text: "Bare repositories are not supported.", command: null, action: null })

        // Assert
        expect(screen.getByRole("alert").textContent).toContain("Bare repositories are not supported.")
        expect(screen.queryByRole("button")).toBeNull()
    })

    it("should ask for the desktop tools", async () => {
        // Arrange
        const { fixture } = await renderNotice({ text: "Git was not found.", command: null, action: "openDesktopTools" })
        const openDesktopTools = jest.fn()
        fixture.componentInstance.openDesktopTools.subscribe(openDesktopTools)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Open desktop tools" }))

        // Assert
        expect(openDesktopTools).toHaveBeenCalled()
    })

    it("should ask to re-link the folder", async () => {
        // Arrange
        const { fixture } = await renderNotice({ text: "'billing-api' was not found on disk.", command: null, action: "relinkFolder" })
        const relink = jest.fn()
        fixture.componentInstance.relinkFolder.subscribe(relink)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Re-link folder…" }))

        // Assert
        expect(relink).toHaveBeenCalled()
    })

    it("should copy the safe-directory command with its path and confirm it", async () => {
        // Arrange
        const command = "git config --global --add safe.directory /work/billing-api"
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        const { detectChanges } = await renderNotice({ text: "Git does not trust '/work/billing-api'.", command, action: null })

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Copy command" }))
        await Promise.resolve()
        detectChanges()

        // Assert
        expect(screen.getByText(command)).not.toBeNull()
        expect(writeText).toHaveBeenCalledWith(command)
        expect(screen.getByRole("button", { name: "Copy command" }).querySelector(".fa-check")).not.toBeNull()
    })

    it("should offer to work in the other git folder of the project", async () => {
        // Arrange
        const web = { id: "f-web", label: "billing-web" }
        const { fixture } = await renderNotice({
            text: "'billing-api' is not a git repository.",
            command: null,
            action: "workInFolder",
            workInFolder: web
        })
        const workIn = jest.fn()
        fixture.componentInstance.workInFolder.subscribe(workIn)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Work in 'billing-web'" }))

        // Assert
        expect(workIn).toHaveBeenCalledWith(web)
    })

    it("should offer to choose the working folder in the project menu", async () => {
        // Arrange
        const { fixture } = await renderNotice({
            text: "'billing-api' is not a git repository.",
            command: null,
            action: "chooseWorkingFolder"
        })
        const choose = jest.fn()
        fixture.componentInstance.chooseWorkingFolder.subscribe(choose)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Choose working folder…" }))

        // Assert
        expect(choose).toHaveBeenCalled()
        expect(screen.queryByRole("combobox")).toBeNull()
    })
})
