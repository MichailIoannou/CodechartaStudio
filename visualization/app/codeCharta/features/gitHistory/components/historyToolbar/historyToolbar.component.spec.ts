import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitLogService } from "../../services/gitLog.service"
import { HistoryToolbarComponent } from "./historyToolbar.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api", path: "C:\\work\\billing-api" })], { name: "billing" })

describe("HistoryToolbarComponent", () => {
    async function renderToolbar(status: GitStatus = aStatusOn("feature/invoice-rounding")) {
        const testBed = provideGitHistory({ git: { "f-api": { info: aRepositoryInfo(), status, refs: aRefs() } } }, BILLING)
        const rendered = await render(HistoryToolbarComponent)
        await settleGit()
        rendered.detectChanges()
        return { ...testBed, ...rendered }
    }

    it("should name the working folder as the repository and say where to change it", async () => {
        // Arrange & Act
        await renderToolbar()

        // Assert
        const repository = screen.getByTestId("history-repository")
        expect(repository.textContent.trim()).toBe("billing-api")
        expect(repository.getAttribute("title")).toBe("Folder C:\\work\\billing-api of project 'billing' — change it in the project menu")
        expect(screen.getByText("Repository")).not.toBeNull()
    })

    it("should show the current branch and scope the commit list to it on click", async () => {
        // Arrange
        await renderToolbar()

        // Act
        fireEvent.click(screen.getByTestId("history-current-branch"))

        // Assert
        expect(screen.getByTestId("history-current-branch").textContent).toContain("feature/invoice-rounding")
        expect(TestBed.inject(GitLogService).scope()).toEqual({ kind: "refs", refNames: ["refs/heads/feature/invoice-rounding"] })
    })

    it("should show a detached head by its short sha", async () => {
        // Arrange & Act
        await renderToolbar(aStatusOn("main", { head: { kind: "detached", commit: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" } }))

        // Assert
        expect(screen.getByTestId("history-current-branch").textContent.replaceAll(/\s+/g, " ").trim()).toBe("at a1b2c3d (detached)")
    })

    it("should mark a merge in progress", async () => {
        // Arrange & Act
        await renderToolbar(aStatusOn("main", { operationInProgress: "merge" }))

        // Assert
        expect(screen.getByText("merging").classList).toContain("badge-warning")
    })

    it("should mark no operation git does not name a badge for", async () => {
        // Arrange & Act
        await renderToolbar(aStatusOn("main", { operationInProgress: "bisect" }))

        // Assert
        expect(document.querySelector(".badge-warning")).toBeNull()
    })

    it("should refresh the repository and spin while it does", async () => {
        // Arrange
        const { bridge, detectChanges } = await renderToolbar()
        const infoReadsBefore = bridge.calls.filter(call => call.args[0] === "git.repositoryInfo").length

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Refresh (F5)" }))
        detectChanges()
        const isSpinning = screen.getByTestId("history-refresh").querySelector(".fa-spin") !== null
        await settleGit()

        // Assert
        expect(isSpinning).toBe(true)
        expect(bridge.calls.filter(call => call.args[0] === "git.repositoryInfo")).toHaveLength(infoReadsBefore + 1)
    })
})
