import { signal } from "@angular/core"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { BranchActionsService, BranchDialogRequest } from "../../services/branchActions.service"
import { aLocalBranch, anUpstream, aRefs, aRemoteBranch } from "../../services/gitApi.mocks"
import { BranchDialogComponent } from "./branchDialog.component"

const FEATURE = aLocalBranch("feature/x", { upstream: anUpstream("origin/feature/x") })
const REMOTE = aRemoteBranch("origin", "feature/y")
const REFS = aRefs({
    localBranches: [aLocalBranch("main", { isCurrent: true }), FEATURE],
    remoteBranches: [REMOTE, aRemoteBranch("origin", "feature/x")]
})
const START = "a1b2c3d".padEnd(40, "0")

describe("BranchDialogComponent", () => {
    const originalShowModal = HTMLDialogElement.prototype.showModal
    const originalClose = HTMLDialogElement.prototype.close
    const dialog = signal<BranchDialogRequest | null>(null)
    const actions = {
        dialog,
        refs: signal(REFS),
        closeDialog: jest.fn(() => dialog.set(null)),
        createBranch: jest.fn().mockResolvedValue(undefined),
        renameBranch: jest.fn().mockResolvedValue(undefined),
        setUpstream: jest.fn().mockResolvedValue(undefined),
        checkOutRemote: jest.fn().mockResolvedValue(undefined)
    }

    beforeEach(() => {
        jest.clearAllMocks()
        dialog.set(null)
        HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
            this.setAttribute("open", "")
        }
        HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
            this.removeAttribute("open")
            this.dispatchEvent(new Event("close"))
        }
    })

    afterEach(() => {
        HTMLDialogElement.prototype.showModal = originalShowModal
        HTMLDialogElement.prototype.close = originalClose
    })

    async function open(request: BranchDialogRequest) {
        const rendered = await render(BranchDialogComponent, { providers: [{ provide: BranchActionsService, useValue: actions }] })
        dialog.set(request)
        rendered.fixture.detectChanges()
        await rendered.fixture.whenStable()
        return rendered
    }

    const nameInput = () => screen.getByTestId("branch-dialog-name") as HTMLInputElement
    const submitButton = () => screen.getByTestId("branch-dialog-submit") as HTMLButtonElement

    it("should create a branch at the start commit, switching only when asked", async () => {
        // Arrange
        await open({ kind: "create", startPoint: START, subject: "Release 2.4.0" })
        const isDisabledWhileEmpty = submitButton().disabled
        const title = screen.getByRole("heading").textContent
        const start = screen.getByTestId("branch-dialog-start").textContent?.replace(/\s+/g, " ").trim()

        // Act
        await userEvent.type(nameInput(), "feature/new")
        await userEvent.click(screen.getByTestId("branch-dialog-switch"))
        await userEvent.click(submitButton())

        // Assert
        expect(title).toBe("New Branch")
        expect(start).toBe("Starts at a1b2c3d Release 2.4.0")
        expect(isDisabledWhileEmpty).toBe(true)
        expect(actions.createBranch).toHaveBeenCalledWith({ name: "feature/new", startPoint: START, checkout: true })
        expect(actions.closeDialog).toHaveBeenCalled()
    })

    it("should validate the name while typing", async () => {
        // Arrange
        await open({ kind: "create", startPoint: START, subject: "Release 2.4.0" })

        // Act
        await userEvent.type(nameInput(), "-x")
        const leadingDash = screen.getByTestId("branch-dialog-rule").textContent
        await userEvent.clear(nameInput())
        await userEvent.type(nameInput(), "main")

        // Assert
        expect(leadingDash).toBe("A branch name cannot start with '-'.")
        expect(screen.getByTestId("branch-dialog-rule").textContent).toBe("A branch named 'main' already exists.")
        expect(submitButton().disabled).toBe(true)
    })

    it("should rename with the name prefilled and say what is kept", async () => {
        // Arrange
        await open({ kind: "rename", branch: FEATURE })
        const isDisabledUnchanged = submitButton().disabled

        // Act
        await userEvent.clear(nameInput())
        await userEvent.type(nameInput(), "feature/renamed")
        await userEvent.click(submitButton())

        // Assert
        expect(isDisabledUnchanged).toBe(true)
        expect(screen.queryByTestId("branch-dialog-rule")).toBe(null)
        expect(actions.renameBranch).toHaveBeenCalledWith(FEATURE, "feature/renamed")
    })

    it("should word the rename effect with the typed name", async () => {
        // Arrange
        await open({ kind: "rename", branch: FEATURE })

        // Act
        await userEvent.type(nameInput(), "-2")

        // Assert
        expect(screen.getByTestId("branch-dialog-effect").textContent).toBe(
            "Renames the local branch 'feature/x' to 'feature/x-2'. Its upstream setting is kept; the remote branch is not renamed."
        )
    })

    it("should set the upstream to a remote branch or to none", async () => {
        // Arrange
        await open({ kind: "setUpstream", branch: FEATURE })
        const select = screen.getByTestId("branch-dialog-upstream") as HTMLSelectElement
        const preselected = select.value

        // Act
        await userEvent.selectOptions(select, "No upstream")
        await userEvent.click(submitButton())

        // Assert
        expect(preselected).toBe("refs/remotes/origin/feature/x")
        expect(actions.setUpstream).toHaveBeenCalledWith(FEATURE, null)
    })

    it("should check out a remote branch under the local name it suggests", async () => {
        // Arrange
        await open({ kind: "checkOutRemote", remote: REMOTE })
        const title = screen.getByRole("heading").textContent
        const submitLabel = submitButton().textContent?.trim()

        // Act
        await userEvent.click(submitButton())

        // Assert
        expect(title).toBe("Check Out as New Local Branch")
        expect(submitLabel).toBe("Check out")
        expect(actions.checkOutRemote).toHaveBeenCalledWith(REMOTE, "feature/y")
    })

    it("should close without running anything on Cancel and on Escape", async () => {
        // Arrange
        await open({ kind: "checkOutRemote", remote: REMOTE })

        // Act
        await userEvent.click(screen.getByTestId("branch-dialog-cancel"))
        dialog.set({ kind: "rename", branch: FEATURE })
        await new Promise(resolve => setTimeout(resolve))
        ;(screen.getByTestId("branch-dialog") as HTMLDialogElement).close()

        // Assert
        expect(actions.closeDialog).toHaveBeenCalledTimes(2)
        expect(actions.checkOutRemote).not.toHaveBeenCalled()
        expect(actions.renameBranch).not.toHaveBeenCalled()
    })
})
