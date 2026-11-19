import { TestBed } from "@angular/core/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { BranchActionsService } from "../../services/branchActions.service"
import { aLocalBranch, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { SyncButtonComponent } from "./syncButton.component"

const BILLING = aProject("p-billing", [aFolder("f-api")])
const MAIN = aLocalBranch("main", { isCurrent: true })
const PROGRESS = { message: "Receiving objects: 45%", done: 45, total: 100 }

function seedWith(extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
    const refs = aRefs({ localBranches: [MAIN] })
    return { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs, ...extra } } }
}

describe("SyncButtonComponent", () => {
    let bridge: FakeDesktopBridge

    async function renderButton(seed = seedWith()) {
        bridge = provideGitHistory(seed, BILLING).bridge
        const rendered = await render(SyncButtonComponent)
        jest.spyOn(TestBed.inject(GitConfirmationService), "ask").mockResolvedValue(true)
        await settleGit()
        rendered.fixture.detectChanges()
        return rendered
    }

    const main = () => screen.getByTestId("sync-button-main") as HTMLButtonElement

    it("should fetch from all remotes with the main part", async () => {
        // Arrange
        await renderButton()
        const title = main().title

        // Act
        await userEvent.click(main())
        await settleGit()

        // Assert
        expect(title).toBe("Fetch from all remotes")
        expect(bridge.calls.filter(call => call.args[0] === "git.fetch").map(call => call.args[1])).toEqual([
            { repo: { projectId: "p-billing", folderId: "f-api" }, prune: false }
        ])
    })

    it("should read Fetching… and offer Cancel while a fetch runs, then return", async () => {
        // Arrange
        const { fixture } = await renderButton(seedWith({ slow: { "git.fetch": { progress: PROGRESS } } }))

        // Act
        await userEvent.click(main())
        await settleGit()
        fixture.detectChanges()
        const whileRunning = { label: main().textContent?.trim(), isDisabled: main().disabled, title: main().title }
        await userEvent.click(screen.getByTestId("sync-button-cancel"))
        await settleGit()
        fixture.detectChanges()

        // Assert
        expect(whileRunning).toEqual({ label: "Fetching…", isDisabled: true, title: "Fetching — progress shows in the status at the top" })
        expect(bridge.calls.find(call => call.name === "cancel")?.args).toEqual(["git-operation-1"])
        expect(main().textContent?.trim()).toBe("Fetch")
        expect(screen.queryByTestId("sync-button-cancel")).toBe(null)
    })

    it("should disable both parts while another git operation runs", async () => {
        // Arrange
        const { fixture } = await renderButton(seedWith({ slow: { "git.switch": {} } }))
        const switching = TestBed.inject(BranchActionsService).switchTo(aLocalBranch("feature/x"))

        // Act
        await settleGit()
        fixture.detectChanges()

        // Assert
        expect(main().disabled).toBe(true)
        expect(main().title).toBe("Waiting for the previous git operation…")
        expect((screen.getByTestId("sync-button-caret") as HTMLButtonElement).disabled).toBe(true)
        await bridge.cancel("git-operation-1")
        await switching
    })

    it("should list the fetch variants and Set Upstream… behind the caret", async () => {
        // Arrange
        await renderButton()

        // Act
        await userEvent.click(screen.getByTestId("sync-button-caret"))
        const labels = Array.from(screen.getByTestId("sync-menu").querySelectorAll("button")).map(button => button.textContent?.trim())
        await userEvent.click(screen.getByText("Fetch and Remove Deleted Branches"))
        await settleGit()
        await userEvent.click(screen.getByTestId("sync-button-caret"))
        await userEvent.click(screen.getByText("Set Upstream…"))

        // Assert
        expect(labels).toEqual(["Fetch", "Fetch and Remove Deleted Branches", "Set Upstream…"])
        expect(bridge.calls.filter(call => call.args[0] === "git.fetch").map(call => (call.args[1] as { prune: boolean }).prune)).toEqual([
            true
        ])
        expect(TestBed.inject(BranchActionsService).dialog()).toEqual({ kind: "setUpstream", branch: MAIN })
        expect(screen.queryByTestId("sync-menu")).toBe(null)
    })

    it("should close the menu when the caret is clicked again", async () => {
        // Arrange
        await renderButton()
        await userEvent.click(screen.getByTestId("sync-button-caret"))

        // Act
        await userEvent.click(screen.getByTestId("sync-button-caret"))

        // Assert
        expect(screen.queryByTestId("sync-menu")).toBe(null)
    })
})
