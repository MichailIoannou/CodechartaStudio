import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import type { FakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { aLogCommit, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { CommitBoxComponent } from "./commitBox.component"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api")])
const STAGED = aStatusOn("main", { counts: { staged: 1, unstaged: 0, untracked: 0, conflicted: 0 } })

describe("CommitBoxComponent", () => {
    let bridge: FakeDesktopBridge

    beforeEach(() => {
        localStorage.clear()
    })

    async function renderBox(status: GitStatus = STAGED, isStaged = true) {
        const staged = { path: "src/a.ts", previousPath: null, kind: "staged" as const, change: "modified" as const, conflict: null }
        const changes = isStaged ? [staged] : []
        const commits = [aLogCommit("a", "Fix invoice rounding")]
        bridge = provideGitHistory(
            { git: { "f-api": { info: aRepositoryInfo(), status, refs: aRefs(), changes, commits } } },
            BILLING
        ).bridge
        const rendered = await render(CommitBoxComponent)
        jest.spyOn(TestBed.inject(GitConfirmationService), "ask").mockResolvedValue(true)
        await settleGit()
        rendered.detectChanges()
        return rendered
    }

    const summary = () => screen.getByTestId("commit-summary") as HTMLInputElement
    const commitButton = () => screen.getByTestId("commit-button") as HTMLButtonElement
    const commitsSent = () =>
        bridge.calls.filter(call => call.name === "request" && call.args[0] === "git.commit").map(call => call.args[1])

    it("should disable Commit without staged files or without a summary and say why", async () => {
        // Arrange
        const rendered = await renderBox(aStatusOn("main"), false)
        const withoutStaged = commitButton().parentElement?.getAttribute("title")

        // Act
        fireEvent.input(summary(), { target: { value: "Fix rounding" } })
        rendered.detectChanges()

        // Assert
        expect(withoutStaged).toBe("Stage files to commit")
        expect(commitButton().disabled).toBe(true)
    })

    it("should ask for a summary when files are staged", async () => {
        // Arrange & Act
        await renderBox()

        // Assert
        expect(commitButton().disabled).toBe(true)
        expect(commitButton().parentElement?.getAttribute("title")).toBe("Write a summary")
    })

    it("should commit on Ctrl+Enter with the summary and description", async () => {
        // Arrange
        const rendered = await renderBox()
        fireEvent.input(summary(), { target: { value: "Fix rounding" } })
        fireEvent.input(screen.getByTestId("commit-description"), { target: { value: "Half-even." } })
        rendered.detectChanges()

        // Act
        const shortcut = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })
        screen.getByTestId("commit-description").dispatchEvent(shortcut)
        await settleGit()
        rendered.detectChanges()

        // Assert
        expect(shortcut.defaultPrevented).toBe(true)
        expect(commitsSent()).toEqual([{ repo: API, subject: "Fix rounding", body: "Half-even.", amend: false }])
        expect(summary().value).toBe("")
    })

    it("should commit on a click and leave a plain Enter to the field", async () => {
        // Arrange
        const rendered = await renderBox()
        fireEvent.input(summary(), { target: { value: "Fix rounding" } })
        rendered.detectChanges()
        const plainEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })

        // Act
        summary().dispatchEvent(plainEnter)
        fireEvent.click(commitButton())
        await settleGit()

        // Assert
        expect(plainEnter.defaultPrevented).toBe(false)
        expect(commitsSent()).toHaveLength(1)
    })

    it("should count the summary and warn above 72 characters", async () => {
        // Arrange
        const rendered = await renderBox()

        // Act
        fireEvent.input(summary(), { target: { value: "x".repeat(73) } })
        rendered.detectChanges()

        // Assert
        const counter = screen.getByTestId("commit-summary-counter")
        expect(counter.textContent.trim()).toBe("73/72")
        expect(counter.classList).toContain("text-warning")
        expect(counter.getAttribute("title")).toBe("Long summaries are cut off in many git tools")
    })

    it("should fill the last message when amend is checked on an empty box", async () => {
        // Arrange
        const rendered = await renderBox()

        // Act
        fireEvent.change(screen.getByTestId("commit-amend"), { target: { checked: true } })
        await settleGit()
        rendered.detectChanges()

        // Assert
        expect(summary().value).toBe("Fix invoice rounding")
        expect(commitButton().disabled).toBe(false)
    })

    it("should say that the commit concludes a merge", async () => {
        // Arrange & Act
        await renderBox(aStatusOn("main", { operationInProgress: "merge" }))

        // Assert
        expect(screen.getByTestId("commit-box-merge").textContent.trim()).toBe("This commit concludes the merge.")
    })
})
