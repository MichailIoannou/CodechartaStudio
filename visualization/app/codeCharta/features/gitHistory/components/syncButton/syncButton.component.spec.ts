import { TestBed } from "@angular/core/testing"
import { render, screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { GitUpstream } from "../../../../model/coreApi/GitUpstream"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { BranchActionsService } from "../../services/branchActions.service"
import { aLocalBranch, anUpstream, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { SyncActionsService } from "../../services/syncActions.service"
import { SyncButtonComponent } from "./syncButton.component"

const BILLING = aProject("p-billing", [aFolder("f-api")])
const IN_SYNC = anUpstream("origin/main")
const MAIN = aLocalBranch("main", { isCurrent: true, upstream: IN_SYNC })
const ORIGIN = { name: "origin", url: "https://example.com/acme/billing-api.git" }
const PROGRESS = { message: "Receiving objects: 45%", done: 45, total: 100 }

type RepositorySeed = Partial<NonNullable<FakeDesktopSeed["git"]>[string]>

function seedWith(extra: RepositorySeed = {}, upstream: GitUpstream | null = IN_SYNC, remotes = [ORIGIN]): FakeDesktopSeed {
    const refs = aRefs({ localBranches: [{ ...MAIN, upstream }], remotes })
    return { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main", { upstream }), refs, ...extra } } }
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
        expect(labels).toEqual(["Fetch", "Fetch and Remove Deleted Branches", "Pull", "Push", "Force Push (with Lease)…", "Set Upstream…"])
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

    describe("main action", () => {
        const sync = () => TestBed.inject(SyncActionsService)
        const countsOf = () =>
            [screen.queryByTestId("sync-button-behind"), screen.queryByTestId("sync-button-ahead")].map(
                count => count?.textContent?.trim() ?? null
            )

        it("should pull with the incoming count when the branch is behind", async () => {
            // Arrange
            await renderButton(seedWith({}, anUpstream("origin/main", { behind: 3 })))
            const pull = jest.spyOn(sync(), "pull").mockResolvedValue()

            // Act
            await userEvent.click(main())

            // Assert
            expect(main().textContent).toContain("Pull")
            expect(main().title).toBe("Pull 3 commits from origin/main (fast-forward only)")
            expect(countsOf()).toEqual(["3", null])
            expect(pull).toHaveBeenCalledTimes(1)
        })

        it("should show both counts and pull first when the branch has diverged", async () => {
            // Arrange & Act
            await renderButton(seedWith({}, anUpstream("origin/main", { ahead: 2, behind: 1 })))

            // Assert
            expect(main().title).toBe("The branch has diverged: pull first, then push")
            expect(countsOf()).toEqual(["1", "2"])
        })

        it("should push with the outgoing count when the branch is ahead", async () => {
            // Arrange
            await renderButton(seedWith({}, anUpstream("origin/main", { ahead: 2 })))
            const push = jest.spyOn(sync(), "push").mockResolvedValue()

            // Act
            await userEvent.click(main())

            // Assert
            expect(main().title).toBe("Push 2 commits to origin/main")
            expect(countsOf()).toEqual([null, "2"])
            expect(push).toHaveBeenCalledTimes(1)
        })

        it("should publish a branch without upstream, and be disabled with the reason without a remote", async () => {
            // Arrange
            await renderButton(seedWith({}, null))
            const publish = jest.spyOn(sync(), "publish").mockResolvedValue()

            // Act
            await userEvent.click(main())
            const titleWithRemote = main().title
            TestBed.resetTestingModule()
            document.body.innerHTML = ""
            await renderButton(seedWith({}, null, []))

            // Assert
            expect(titleWithRemote).toBe("Publish 'main' to origin and track it")
            expect(publish).toHaveBeenCalledTimes(1)
            expect(main().disabled).toBe(true)
            expect(main().title).toBe("This repository has no remote.")
        })

        it("should fetch and refuse pull and push with the reason while a merge is unfinished", async () => {
            // Arrange
            const behind = anUpstream("origin/main", { behind: 2 })
            await renderButton(seedWith({ status: aStatusOn("main", { upstream: behind, operationInProgress: "merge" }) }, behind))

            // Act
            await userEvent.click(screen.getByTestId("sync-button-caret"))
            const items = Array.from(screen.getByTestId("sync-menu").querySelectorAll("button"))

            // Assert
            expect(main().textContent).toContain("Fetch")
            expect(main().disabled).toBe(false)
            const refused = items.filter(item => item.getAttribute("aria-disabled") === "true")
            expect(refused.map(item => [item.textContent?.trim(), item.title])).toEqual([
                ["Pull", "Finish or abort the merge first."],
                ["Push", "Finish or abort the merge first."],
                ["Force Push (with Lease)…", "Finish or abort the merge first."]
            ])
        })

        it("should read Pulling… and cancel the pull while it runs", async () => {
            // Arrange
            const { fixture } = await renderButton(
                seedWith({ slow: { "git.pull": { progress: PROGRESS } } }, anUpstream("origin/main", { behind: 1 }))
            )

            // Act
            await userEvent.click(main())
            await settleGit()
            fixture.detectChanges()
            const cancel = screen.getByTestId("sync-button-cancel")
            const whileRunning = { label: main().textContent?.trim(), cancel: cancel.getAttribute("aria-label"), counts: countsOf() }
            await userEvent.click(cancel)
            await settleGit()

            // Assert
            expect(whileRunning).toEqual({ label: "Pulling…", cancel: "Cancel the pull", counts: [null, null] })
            expect(bridge.calls.find(call => call.name === "cancel")?.args).toEqual(["git-operation-1"])
        })
    })

    describe("menu", () => {
        it.each([
            ["pull", "Pull", anUpstream("origin/main", { behind: 1 })],
            ["push", "Push", anUpstream("origin/main", { ahead: 1 })],
            ["forcePush", "Force Push (with Lease)…", anUpstream("origin/main", { ahead: 1, behind: 1 })],
            ["publish", "Publish Branch", null]
        ] as const)("should run %s from its menu item", async (method, label, upstream) => {
            // Arrange
            await renderButton(seedWith({}, upstream))
            const run = jest.spyOn(TestBed.inject(SyncActionsService), method).mockResolvedValue()

            // Act
            await userEvent.click(screen.getByTestId("sync-button-caret"))
            await userEvent.click(within(screen.getByTestId("sync-menu")).getByText(label))

            // Assert
            expect(run).toHaveBeenCalledTimes(1)
            expect(screen.queryByTestId("sync-menu")).toBe(null)
        })

        it("should show an item that cannot run with its reason and run nothing", async () => {
            // Arrange
            await renderButton()
            const push = jest.spyOn(TestBed.inject(SyncActionsService), "push").mockResolvedValue()

            // Act
            await userEvent.click(screen.getByTestId("sync-button-caret"))
            const item = within(screen.getByTestId("sync-menu")).getByText("Push").closest("button") as HTMLButtonElement
            await userEvent.click(item)

            // Assert
            expect(item.title).toBe("Nothing to push")
            expect(push).not.toHaveBeenCalled()
        })
    })
})
