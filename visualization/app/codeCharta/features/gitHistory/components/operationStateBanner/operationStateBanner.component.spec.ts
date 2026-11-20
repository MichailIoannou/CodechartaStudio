import { TestBed } from "@angular/core/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import type { FakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitOperationService } from "../../services/gitOperation.service"
import { SyncActionsService } from "../../services/syncActions.service"
import { OperationStateBannerComponent } from "./operationStateBanner.component"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api")])
const MERGING = aStatusOn("main", { operationInProgress: "merge", counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 2 } })

describe("OperationStateBannerComponent", () => {
    let bridge: FakeDesktopBridge

    async function renderBanner(status: GitStatus) {
        bridge = provideGitHistory({ git: { "f-api": { info: aRepositoryInfo(), status, refs: aRefs() } } }, BILLING).bridge
        const rendered = await render(OperationStateBannerComponent)
        await settleGit()
        rendered.fixture.detectChanges()
        return rendered
    }

    const statusReads = () => bridge.calls.filter(call => call.args[0] === "git.status").length

    it("should show nothing while no operation is in progress", async () => {
        // Arrange & Act
        await renderBanner(aStatusOn("main"))

        // Assert
        expect(screen.queryByTestId("history-operation-notice")).toBe(null)
    })

    it("should explain the merge, abort it on request and refresh", async () => {
        // Arrange
        await renderBanner(MERGING)
        const abort = jest.spyOn(TestBed.inject(SyncActionsService), "abort").mockResolvedValue()
        const readsBefore = statusReads()

        // Act
        await userEvent.click(screen.getByTestId("history-operation-abort"))
        await userEvent.click(screen.getByTestId("history-operation-refresh"))
        await settleGit()

        // Assert
        expect(screen.getByTestId("history-operation-notice-text").textContent).toBe(
            "Merging into 'main'. Resolve the conflicts in your editor, stage the files, then commit. 2 files have conflicts."
        )
        expect(screen.getByTestId("history-operation-abort").textContent?.trim()).toBe("Abort merge…")
        expect(abort).toHaveBeenCalledTimes(1)
        expect(statusReads()).toBeGreaterThan(readsBefore)
    })

    it("should offer no abort for an operation finished in a terminal", async () => {
        // Arrange & Act
        await renderBanner(aStatusOn("main", { operationInProgress: "cherryPick" }))

        // Assert
        expect(screen.getByTestId("history-operation-notice-text").textContent).toBe(
            "A cherry-pick is in progress. Finish or abort it in a terminal."
        )
        expect(screen.queryByTestId("history-operation-abort")).toBe(null)
    })

    it("should disable abort while another git operation runs", async () => {
        // Arrange
        const { fixture } = await renderBanner(MERGING)
        jest.spyOn(TestBed.inject(GitConfirmationService), "ask").mockResolvedValue(true)
        void TestBed.inject(GitOperationService).run({ kind: "switch", repo: API, send: () => new Promise(() => undefined) })

        // Act
        await settleGit()
        fixture.detectChanges()
        const button = screen.getByTestId("history-operation-abort") as HTMLButtonElement

        // Assert
        expect(button.disabled).toBe(true)
        expect(button.title).toBe("Waiting for the previous git operation…")
    })
})
