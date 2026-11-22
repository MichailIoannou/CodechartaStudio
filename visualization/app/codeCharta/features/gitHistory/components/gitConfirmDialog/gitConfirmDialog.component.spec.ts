import { TestBed } from "@angular/core/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { deleteRemoteConfirmation, HOOKS_NOTICE, pullChoice } from "../../util/effectText"
import { GitConfirmDialogComponent } from "./gitConfirmDialog.component"

describe("GitConfirmDialogComponent", () => {
    const originalShowModal = HTMLDialogElement.prototype.showModal
    const originalClose = HTMLDialogElement.prototype.close

    beforeEach(() => {
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

    async function ask(confirmation = HOOKS_NOTICE) {
        const rendered = await render(GitConfirmDialogComponent)
        const answer = TestBed.inject(GitConfirmationService).ask(confirmation)
        rendered.fixture.detectChanges()
        await rendered.fixture.whenStable()
        return { answer, dialog: screen.getByTestId("git-confirm-dialog") as HTMLDialogElement }
    }

    it("should ask a yes / no question and answer yes", async () => {
        // Arrange
        const { answer, dialog } = await ask()
        const title = screen.getByText("Git Hooks")

        // Act
        await userEvent.click(screen.getByTestId("git-confirm-yes"))

        // Assert
        expect(title).toBeTruthy()
        expect(await answer).toBe(true)
        expect(dialog.open).toBe(false)
    })

    it("should ask a destructive question with Cancel and the verb, and decline on Cancel", async () => {
        // Arrange
        const { answer } = await ask(deleteRemoteConfirmation("feature/x", "origin"))
        const verb = screen.getByTestId("git-confirm-verb")

        // Act
        await userEvent.click(screen.getByTestId("git-confirm-cancel"))

        // Assert
        expect(verb.textContent?.trim()).toBe("Delete from remote")
        expect(verb.classList).toContain("btn-error")
        expect(await answer).toBe(false)
    })

    it("should decline when Escape or the backdrop closes the dialog", async () => {
        // Arrange
        const { answer, dialog } = await ask()

        // Act
        dialog.close()

        // Assert
        expect(await answer).toBe(false)
    })

    it("should decline the open question when another one is asked", async () => {
        // Arrange
        const { answer } = await ask()

        // Act
        const second = TestBed.inject(GitConfirmationService).ask(HOOKS_NOTICE)
        TestBed.inject(GitConfirmationService).answer(true)

        // Assert
        expect(await answer).toBe(false)
        expect(await second).toBe(true)
    })

    describe("choices", () => {
        const choice = pullChoice({ branch: "main", upstream: "origin/main", ahead: 2, behind: 3 })

        async function choose() {
            const rendered = await render(GitConfirmDialogComponent)
            const answer = TestBed.inject(GitConfirmationService).choose(choice)
            rendered.fixture.detectChanges()
            await rendered.fixture.whenStable()
            await new Promise(resolve => setTimeout(resolve))
            return { answer, dialog: screen.getByTestId("git-confirm-dialog") as HTMLDialogElement }
        }

        it("should offer Cancel and every option without a default, with the focus on Cancel", async () => {
            // Arrange & Act
            await choose()
            const buttons = screen.getAllByRole("button").filter(button => button.closest(".modal-action"))

            // Assert
            expect(screen.getByText("Branches Have Diverged")).toBeTruthy()
            expect(screen.getByTestId("git-confirm-text").textContent).toContain("(2 local, 3 remote commits)")
            expect(buttons.map(button => button.textContent?.trim())).toEqual(["Cancel", "Merge", "Rebase my commits"])
            expect(buttons.some(button => button.classList.contains("btn-primary") || button.classList.contains("btn-error"))).toBe(false)
            expect(document.activeElement).toBe(buttons[0])
        })

        it("should answer the chosen option", async () => {
            // Arrange
            const { answer, dialog } = await choose()

            // Act
            await userEvent.click(screen.getByTestId("git-choice-rebase"))

            // Assert
            expect(await answer).toBe("rebase")
            expect(dialog.open).toBe(false)
        })

        it("should answer nothing on Cancel, Escape or a yes meant for a confirmation", async () => {
            // Arrange
            const service = () => TestBed.inject(GitConfirmationService)
            const { answer, dialog } = await choose()

            // Act
            await userEvent.click(screen.getByTestId("git-confirm-cancel"))
            const escaped = service().choose(choice)
            dialog.close()
            const confirmed = service().choose(choice)
            service().answer(true)

            // Assert
            expect([await answer, await escaped, await confirmed]).toEqual([null, null, null])
        })

        it("should ignore an option picked while a confirmation is asked", async () => {
            // Arrange
            const { answer } = await ask()

            // Act
            TestBed.inject(GitConfirmationService).pick("merge")
            TestBed.inject(GitConfirmationService).answer(true)

            // Assert
            expect(await answer).toBe(true)
        })
    })
})
