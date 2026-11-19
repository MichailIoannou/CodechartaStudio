import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import { ToastService } from "../../../shared/facade"
import type { CommitSelection } from "../../model/commitSelection"
import { COMMIT_ACTIONS, CommitAction } from "../../ports/commitActions.port"
import { BranchActionsService } from "../../services/branchActions.service"
import { aLocalBranch, aLogCommit, aRefs, aRemoteBranch, aStatusOn } from "../../services/gitApi.mocks"
import { GitOperationService } from "../../services/gitOperation.service"
import { CommitContextMenuComponent, CommitMenuTarget } from "./commitContextMenu.component"

const REPO = { projectId: "p-billing", folderId: "f-api" }
const COMMIT = aLogCommit("a", "Fix invoice rounding")
const ONE_COMMIT: CommitSelection = { repo: REPO, items: [{ kind: "commit", commit: COMMIT }] }

function anAction(id: string, label: string, overrides: Partial<CommitAction> = {}): CommitAction {
    return {
        id,
        label,
        icon: "fa-solid fa-play",
        hoverHint: `${label} hint`,
        isPrimary: false,
        isOfferedFor: () => true,
        run: jest.fn(),
        ...overrides
    }
}

function aTarget(overrides: Partial<CommitMenuTarget> = {}): CommitMenuTarget {
    return { anchor: { x: 10, y: 20 }, item: ONE_COMMIT.items[0], selection: ONE_COMMIT, isFromKeyboard: false, ...overrides }
}

describe("CommitContextMenuComponent", () => {
    const writeText = jest.fn().mockResolvedValue(undefined)

    async function renderMenu(target: CommitMenuTarget, actions: CommitAction[] = []) {
        TestBed.configureTestingModule({
            providers: actions.map(action => ({ provide: COMMIT_ACTIONS, multi: true, useValue: action }))
        })
        const closed = jest.fn()
        const rendered = await render(CommitContextMenuComponent, { inputs: { target }, on: { closed } })
        await new Promise(resolve => setTimeout(resolve))
        return { ...rendered, closed }
    }

    function itemLabels(): string[] {
        return screen.getAllByRole("button", { hidden: true }).map(button => button.textContent?.trim() ?? "")
    }

    beforeEach(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        writeText.mockClear()
    })

    it("should list the offered contributed actions first, skip the others and then offer the copy items", async () => {
        // Arrange
        const notOffered = anAction("compare", "Compare", { isOfferedFor: () => false })

        // Act
        await renderMenu(aTarget(), [anAction("analyse", "Analyse This Commit"), notOffered])

        // Assert
        expect(itemLabels()).toEqual(["Analyse This Commit", "Copy SHA", "Copy Subject", "New Branch Here…"])
        expect(screen.getByTestId("commit-context-menu").querySelectorAll(".border-t")).toHaveLength(2)
        expect(screen.getByText("Copy SHA").closest("button")?.getAttribute("title")).toBe("Copy the full commit hash")
    })

    it("should offer only the copy items without contributions", async () => {
        // Arrange & Act
        await renderMenu(aTarget())

        // Assert
        expect(itemLabels()).toEqual(["Copy SHA", "Copy Subject", "New Branch Here…"])
        expect(screen.getByTestId("commit-context-menu").querySelectorAll(".border-t")).toHaveLength(1)
    })

    it("should copy the full sha with a toast and close", async () => {
        // Arrange
        const { closed } = await renderMenu(aTarget())

        // Act
        fireEvent.click(screen.getByText("Copy SHA"))
        await new Promise(resolve => setTimeout(resolve))

        // Assert
        expect(writeText).toHaveBeenCalledWith(COMMIT.sha)
        expect(TestBed.inject(ToastService).messages()[0].text).toBe(`Copied ${COMMIT.sha.slice(0, 7)}`)
        expect(closed).toHaveBeenCalledWith({ isFocusReturned: false })
    })

    it("should copy the subject", async () => {
        // Arrange
        await renderMenu(aTarget())

        // Act
        fireEvent.click(screen.getByText("Copy Subject"))

        // Assert
        expect(writeText).toHaveBeenCalledWith("Fix invoice rounding")
    })

    it("should run a contributed action with the selection and close", async () => {
        // Arrange
        const analyse = anAction("analyse", "Analyse This Commit")
        const { closed } = await renderMenu(aTarget(), [analyse])

        // Act
        fireEvent.click(screen.getByText("Analyse This Commit"))

        // Assert
        expect(analyse.run).toHaveBeenCalledWith(ONE_COMMIT)
        expect(closed).toHaveBeenCalledTimes(1)
    })

    it("should offer no copy items for the uncommitted changes", async () => {
        // Arrange
        const workingTree: CommitSelection = { repo: REPO, items: [{ kind: "workingTree", status: aStatusOn("main") }] }

        // Act
        await renderMenu(aTarget({ item: workingTree.items[0], selection: workingTree }), [
            anAction("analyse-tree", "Analyse Working Tree")
        ])

        // Assert
        expect(itemLabels()).toEqual(["Analyse Working Tree"])
    })

    it("should focus the first item when opened from the keyboard and move with the arrows", async () => {
        // Arrange
        const { detectChanges } = await renderMenu(aTarget({ isFromKeyboard: true }), [anAction("analyse", "Analyse This Commit")])
        await new Promise(resolve => requestAnimationFrame(resolve))
        detectChanges()
        const firstFocused = document.activeElement?.textContent?.trim()
        const menu = screen.getByTestId("commit-context-menu")

        // Act
        fireEvent.keyDown(menu, { key: "ArrowDown" })
        const afterDown = document.activeElement?.textContent?.trim()
        fireEvent.keyDown(menu, { key: "ArrowUp" })
        fireEvent.keyDown(menu, { key: "ArrowUp" })

        // Assert
        expect(firstFocused).toBe("Analyse This Commit")
        expect(afterDown).toBe("Copy SHA")
        expect(document.activeElement?.textContent?.trim()).toBe("New Branch Here…")
    })

    it("should close on Escape, hand the focus back and keep the key from the list", async () => {
        // Arrange
        const { closed } = await renderMenu(aTarget())
        const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        const stopPropagation = jest.spyOn(event, "stopPropagation")

        // Act
        screen.getByTestId("commit-context-menu").dispatchEvent(event)

        // Assert
        expect(closed).toHaveBeenCalledWith({ isFocusReturned: true })
        expect(stopPropagation).toHaveBeenCalled()
    })

    it("should close without taking the focus when dismissed by a click outside", async () => {
        // Arrange
        const { closed } = await renderMenu(aTarget())

        // Act
        fireEvent.pointerDown(document.body)

        // Assert
        expect(closed).toHaveBeenCalledWith({ isFocusReturned: false })
    })

    it("should let other keys through", async () => {
        // Arrange
        await renderMenu(aTarget())
        const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })

        // Act
        screen.getByTestId("commit-context-menu").dispatchEvent(event)

        // Assert
        expect(event.defaultPrevented).toBe(false)
    })

    describe("write entries", () => {
        const refs = aRefs({
            localBranches: [
                aLocalBranch("main", { commit: COMMIT.sha, isCurrent: true }),
                aLocalBranch("release/2.4", { commit: COMMIT.sha }),
                aLocalBranch("other", { commit: "f".repeat(40) })
            ],
            remoteBranches: [{ ...aRemoteBranch("origin", "release/2.4"), commit: COMMIT.sha }]
        })
        const branchActions = { refs: signal(refs), switchTo: jest.fn(), openDialog: jest.fn() }
        const isBusy = signal(false)

        async function renderWithBranches() {
            branchActions.switchTo.mockClear()
            branchActions.openDialog.mockClear()
            TestBed.configureTestingModule({
                providers: [
                    { provide: BranchActionsService, useValue: branchActions },
                    { provide: GitOperationService, useValue: { isBusy } }
                ]
            })
            const closed = jest.fn()
            await render(CommitContextMenuComponent, { inputs: { target: aTarget() }, on: { closed } })
            return closed
        }

        it("should offer to check out the other branches at the commit and a new branch here", async () => {
            // Arrange & Act
            isBusy.set(false)
            await renderWithBranches()

            // Assert
            expect(itemLabels().slice(2)).toEqual([
                "Check Out 'release/2.4'",
                "Check Out 'origin/release/2.4' as New Branch…",
                "New Branch Here…"
            ])
            expect(screen.getByText("Check Out 'release/2.4'").closest("button")?.getAttribute("title")).toBe("Switch to this branch")
        })

        it("should switch, open the tracking dialog and the new branch dialog, closing the menu each time", async () => {
            // Arrange
            isBusy.set(false)
            const closed = await renderWithBranches()

            // Act
            fireEvent.click(screen.getByText("Check Out 'release/2.4'"))
            fireEvent.click(screen.getByText("Check Out 'origin/release/2.4' as New Branch…"))
            fireEvent.click(screen.getByText("New Branch Here…"))

            // Assert
            expect(branchActions.switchTo).toHaveBeenCalledWith(refs.localBranches[1])
            expect(branchActions.openDialog.mock.calls).toEqual([
                [{ kind: "checkOutRemote", remote: refs.remoteBranches[0] }],
                [{ kind: "create", startPoint: COMMIT.sha, subject: COMMIT.subject }]
            ])
            expect(closed).toHaveBeenCalledTimes(3)
        })

        it("should disable the write entries while a git operation runs", async () => {
            // Arrange & Act
            isBusy.set(true)
            await renderWithBranches()

            // Assert
            const newBranch = screen.getByText("New Branch Here…").closest("button")
            expect(newBranch?.disabled).toBe(true)
            expect(newBranch?.getAttribute("title")).toBe("Waiting for the previous git operation…")
        })
    })
})
