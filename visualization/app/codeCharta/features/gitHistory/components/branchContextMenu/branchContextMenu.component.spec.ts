import { Provider, signal } from "@angular/core"
import { fireEvent, render, screen } from "@testing-library/angular"
import { BRANCH_ACTIONS, BranchAction } from "../../ports/branchActions.port"
import { BranchActionsService } from "../../services/branchActions.service"
import { aLocalBranch, anUpstream, aRefs, aRemoteBranch, aTag } from "../../services/gitApi.mocks"
import { GitOperationService } from "../../services/gitOperation.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { SyncActionsService } from "../../services/syncActions.service"
import type { BranchRef } from "../../util/branchTree"
import { BranchContextMenuComponent, BranchMenuTarget } from "./branchContextMenu.component"

const FEATURE = aLocalBranch("feature/x", { upstream: anUpstream("origin/feature/x", { ahead: 2, behind: 1 }) })
const REMOTE = aRemoteBranch("origin", "feature/y")
const TAG = aTag("v2.4.0")
const REFS = aRefs({ localBranches: [aLocalBranch("main", { isCurrent: true }), FEATURE], remoteBranches: [REMOTE], tags: [TAG] })
const LAST_COMMIT = { subject: "Release 2.4.0", committedAt: 0 }

const LOCAL_REF: BranchRef = { refName: FEATURE.refName, fullName: "feature/x", kind: "local", local: FEATURE, lastCommit: LAST_COMMIT }
const REMOTE_REF: BranchRef = { refName: REMOTE.refName, fullName: REMOTE.name, kind: "remote", local: null, lastCommit: LAST_COMMIT }
const TAG_REF: BranchRef = { refName: TAG.refName, fullName: TAG.name, kind: "tag", local: null, lastCommit: null }

describe("BranchContextMenuComponent", () => {
    const actions = {
        refs: signal(REFS),
        switchTo: jest.fn(),
        deleteLocal: jest.fn(),
        deleteRemote: jest.fn(),
        openDialog: jest.fn()
    }
    const sync = { push: jest.fn(), forcePush: jest.fn() }
    const isBusy = signal(false)

    const repo = { projectId: "p-billing", folderId: "f-api" }

    async function renderMenu(ref: BranchRef, isFromKeyboard = false, extraProviders: Provider[] = []) {
        jest.clearAllMocks()
        const target: BranchMenuTarget = { anchor: { x: 10, y: 20 }, ref, isFromKeyboard }
        const closed = jest.fn()
        const rendered = await render(BranchContextMenuComponent, {
            inputs: { target },
            on: { closed },
            providers: [
                { provide: BranchActionsService, useValue: actions },
                { provide: SyncActionsService, useValue: sync },
                { provide: GitOperationService, useValue: { isBusy } },
                { provide: GitRepositoryService, useValue: { activeRepository: signal(repo) } },
                ...extraProviders
            ]
        })
        return { ...rendered, closed }
    }

    const click = (label: string) => fireEvent.click(screen.getByText(label))

    it("should run the actions of a local branch", async () => {
        // Arrange
        isBusy.set(false)
        const { closed } = await renderMenu(LOCAL_REF)

        // Act
        for (const label of [
            "Switch To",
            "New Branch from Here…",
            "Rename…",
            "Delete…",
            "Set Upstream…",
            "Push",
            "Force Push (with Lease)…"
        ]) {
            click(label)
        }

        // Assert
        expect(actions.switchTo).toHaveBeenCalledWith(FEATURE)
        expect(actions.deleteLocal).toHaveBeenCalledWith(FEATURE)
        expect(sync.push).toHaveBeenCalledWith(FEATURE)
        expect(sync.forcePush).toHaveBeenCalledWith(FEATURE)
        expect(actions.openDialog.mock.calls).toEqual([
            [{ kind: "create", startPoint: FEATURE.commit, subject: "Release 2.4.0" }],
            [{ kind: "rename", branch: FEATURE }],
            [{ kind: "setUpstream", branch: FEATURE }]
        ])
        expect(closed).toHaveBeenCalledWith(false)
    })

    it("should list the items other features contribute after its own and run them on the branch", async () => {
        // Arrange
        isBusy.set(false)
        const run = jest.fn()
        const compareWithMain: BranchAction = {
            id: "compare.branchWithTarget",
            icon: "fa-solid fa-code-compare",
            labelFor: target => `Compare with 'main' (${target.name})`,
            hoverHintFor: () => "Show what it changes",
            isOfferedFor: target => target.kind === "local",
            run
        }
        const { closed } = await renderMenu(LOCAL_REF, false, [{ provide: BRANCH_ACTIONS, multi: true, useValue: compareWithMain }])

        // Act
        const labels = screen.getAllByRole("button", { hidden: true }).map(button => button.textContent?.trim())
        click("Compare with 'main' (feature/x)")

        // Assert
        expect(labels.at(-1)).toBe("Compare with 'main' (feature/x)")
        expect(run).toHaveBeenCalledWith({ repo, refName: FEATURE.refName, name: "feature/x", kind: "local", isCurrent: false })
        expect(closed).toHaveBeenCalledWith(false)
    })

    it("should leave out a contributed item not offered for the ref", async () => {
        // Arrange
        const offeredForLocalOnly: BranchAction = {
            id: "compare.branchWithTarget",
            icon: "fa-solid fa-code-compare",
            labelFor: () => "Compare with 'main'",
            hoverHintFor: () => "",
            isOfferedFor: target => target.kind === "local",
            run: jest.fn()
        }

        // Act
        await renderMenu(TAG_REF, false, [{ provide: BRANCH_ACTIONS, multi: true, useValue: offeredForLocalOnly }])

        // Assert
        expect(screen.queryByText("Compare with 'main'")).toBeNull()
    })

    it("should run the actions of a remote branch and a tag", async () => {
        // Arrange
        isBusy.set(false)
        await renderMenu(REMOTE_REF)

        // Act
        click("Check Out as New Local Branch…")
        click("Delete from Remote…")

        // Assert
        expect(actions.openDialog).toHaveBeenCalledWith({ kind: "checkOutRemote", remote: REMOTE })
        expect(actions.deleteRemote).toHaveBeenCalledWith(REMOTE)
    })

    it("should start a new branch at a tag", async () => {
        // Arrange
        isBusy.set(false)
        await renderMenu(TAG_REF)

        // Act
        click("New Branch from Here…")

        // Assert
        expect(actions.openDialog).toHaveBeenCalledWith({ kind: "create", startPoint: TAG.commit, subject: "" })
    })

    it("should show every item disabled with the reason while an operation runs", async () => {
        // Arrange & Act
        isBusy.set(true)
        await renderMenu(REMOTE_REF)

        // Assert
        const buttons = Array.from(screen.getByTestId("branch-context-menu").querySelectorAll("button"))
        expect(buttons.every(button => button.disabled && button.title === "Waiting for the previous git operation…")).toBe(true)
    })

    it("should focus the first item when opened from the keyboard, move with the arrows and close on Escape", async () => {
        // Arrange
        isBusy.set(false)
        const { closed, detectChanges } = await renderMenu(LOCAL_REF, true)
        await new Promise(resolve => requestAnimationFrame(resolve))
        detectChanges()
        const menu = screen.getByTestId("branch-context-menu")
        const firstFocused = document.activeElement?.textContent?.trim()

        // Act
        fireEvent.keyDown(menu, { key: "ArrowUp" })
        const afterUp = document.activeElement?.textContent?.trim()
        fireEvent.keyDown(menu, { key: "Tab" })
        fireEvent.keyDown(menu, { key: "Escape" })

        // Assert
        expect(firstFocused).toBe("Switch To")
        expect(afterUp).toBe("Force Push (with Lease)…")
        expect(closed).toHaveBeenCalledWith(true)
    })

    it("should only close when the refs are not loaded", async () => {
        // Arrange
        isBusy.set(false)
        actions.refs.set(null as never)
        const { closed } = await renderMenu(LOCAL_REF)

        // Act
        click("Switch To")

        // Assert
        expect(actions.switchTo).not.toHaveBeenCalled()
        expect(closed).toHaveBeenCalledWith(false)
        actions.refs.set(REFS)
    })

    it("should close without running anything when dismissed", async () => {
        // Arrange
        isBusy.set(false)
        const { closed, fixture } = await renderMenu(REMOTE_REF)

        // Act
        fixture.componentInstance.dismiss()

        // Assert
        expect(closed).toHaveBeenCalledWith(false)
        expect(actions.openDialog).not.toHaveBeenCalled()
    })
})
