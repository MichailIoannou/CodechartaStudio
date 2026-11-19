import { TestBed } from "@angular/core/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { PromptRequested } from "../../../../model/coreApi/PromptRequested"
import { FakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { CredentialPromptService } from "../../services/credentialPrompt.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { CredentialPromptDialogComponent } from "./credentialPromptDialog.component"

const SECRET_ANSWER = "correct horse battery staple"
const PASSPHRASE: PromptRequested = {
    promptId: "p1",
    requestId: "git-operation-1",
    repositoryLabel: "billing-api",
    kind: "secret",
    message: 'Enter passphrase for "/home/mia/.ssh/id_ed25519": '
}
const USERNAME: PromptRequested = { ...PASSPHRASE, promptId: "p2", kind: "text", message: "Username for 'https://example.com': " }
const HOST_KEY: PromptRequested = {
    ...PASSPHRASE,
    promptId: "p3",
    kind: "confirm",
    message:
        "The authenticity of host 'example.com' can't be established.\nED25519 key fingerprint is SHA256:abc.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? "
}

describe("CredentialPromptDialogComponent", () => {
    let bridge: FakeDesktopBridge
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

    async function renderDialog(...prompts: PromptRequested[]) {
        bridge = provideGitHistory({ responses: { "prompt.answer": null, "prompt.cancel": null } }, null).bridge
        const rendered = await render(CredentialPromptDialogComponent)
        for (const prompt of prompts) {
            bridge.emit("prompt.requested", prompt)
        }
        await settleGit()
        rendered.fixture.detectChanges()
        return rendered
    }

    function dialogElement() {
        return screen.getByTestId("credential-prompt") as HTMLDialogElement
    }

    function promptCalls(method: string) {
        return bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])
    }

    it("should show the message verbatim with the repository label", async () => {
        // Arrange & Act
        await renderDialog(HOST_KEY)

        // Assert
        expect(dialogElement().open).toBe(true)
        expect(screen.getByTestId("credential-prompt-message").textContent).toBe(HOST_KEY.message)
        expect(screen.getByTestId("credential-prompt-repository").textContent).toBe("billing-api")
        expect(screen.getByText("Git Needs Your Input")).toBeTruthy()
    })

    it("should mask a secret and show a text answer", async () => {
        // Arrange
        await renderDialog(PASSPHRASE, USERNAME)
        const secretType = (screen.getByTestId("credential-prompt-input") as HTMLInputElement).type

        // Act
        await userEvent.click(screen.getByTestId("credential-prompt-cancel"))
        await settleGit()

        // Assert
        expect(secretType).toBe("password")
        expect((screen.getByTestId("credential-prompt-input") as HTMLInputElement).type).toBe("text")
    })

    it("should answer yes or no to a confirm question, offering no input", async () => {
        // Arrange
        await renderDialog(HOST_KEY, { ...HOST_KEY, promptId: "p4" })
        const hasInput = screen.queryByTestId("credential-prompt-input") !== null

        // Act
        await userEvent.click(screen.getByTestId("credential-prompt-yes"))
        await settleGit()
        await userEvent.click(screen.getByTestId("credential-prompt-no"))
        await settleGit()

        // Assert
        expect(hasInput).toBe(false)
        expect(promptCalls("prompt.answer")).toEqual([
            { promptId: "p3", answer: "yes" },
            { promptId: "p4", answer: "no" }
        ])
    })

    it("should send the answer once on Enter and clear the input right after", async () => {
        // Arrange
        await renderDialog(PASSPHRASE, USERNAME)
        const input = screen.getByTestId("credential-prompt-input") as HTMLInputElement

        // Act
        await userEvent.type(input, `${SECRET_ANSWER}{Enter}`)
        await settleGit()

        // Assert
        expect(promptCalls("prompt.answer")).toEqual([{ promptId: "p1", answer: SECRET_ANSWER }])
        expect((screen.getByTestId("credential-prompt-input") as HTMLInputElement).value).toBe("")
    })

    it("should cancel the prompt on Cancel and when Escape closes the dialog", async () => {
        // Arrange
        await renderDialog(PASSPHRASE, USERNAME)

        // Act
        await userEvent.type(screen.getByTestId("credential-prompt-input"), "half typed")
        await userEvent.click(screen.getByTestId("credential-prompt-cancel"))
        await settleGit()
        dialogElement().close()
        await settleGit()

        // Assert
        expect(promptCalls("prompt.cancel")).toEqual([{ promptId: "p1" }, { promptId: "p2" }])
        expect(promptCalls("prompt.answer")).toEqual([])
    })

    it("should queue a second prompt behind the first and say how many wait", async () => {
        // Arrange
        await renderDialog(PASSPHRASE, USERNAME)
        const firstTitle = screen.getByRole("heading").textContent

        // Act
        await userEvent.type(screen.getByTestId("credential-prompt-input"), `${SECRET_ANSWER}{Enter}`)
        await settleGit()

        // Assert
        expect(firstTitle).toBe("Git Needs Your Input (1 of 2)")
        expect(screen.getByRole("heading").textContent).toBe("Git Needs Your Input")
        expect(screen.getByTestId("credential-prompt-message").textContent).toBe(USERNAME.message)
    })

    it("should close without an answer when the core closes the prompt", async () => {
        // Arrange
        await renderDialog(PASSPHRASE)

        // Act
        bridge.emit("prompt.closed", { promptId: "p1" })
        await settleGit()

        // Assert
        expect(dialogElement().open).toBe(false)
        expect(promptCalls("prompt.cancel")).toEqual([])
    })

    it("should render nothing in the web build", async () => {
        // Arrange
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: null }] })

        // Act
        await render(CredentialPromptDialogComponent)

        // Assert
        expect(screen.queryByTestId("credential-prompt")).toBe(null)
    })

    it("should never write the answer to the console, the page or the prompt state", async () => {
        // Arrange
        const consoleMethods = (["log", "info", "warn", "error", "debug"] as const).map(method => jest.spyOn(console, method))
        await renderDialog(PASSPHRASE)
        const prompts = TestBed.inject(CredentialPromptService)

        // Act
        await userEvent.type(screen.getByTestId("credential-prompt-input"), `${SECRET_ANSWER}{Enter}`)
        await settleGit()

        // Assert
        const logged = consoleMethods.flatMap(spy => spy.mock.calls.flat().map(String))
        expect(logged.some(text => text.includes(SECRET_ANSWER))).toBe(false)
        expect(document.body.innerHTML).not.toContain(SECRET_ANSWER)
        expect(JSON.stringify([prompts.current(), prompts.waitingCount()])).not.toContain(SECRET_ANSWER)
        for (const spy of consoleMethods) {
            spy.mockRestore()
        }
    })
})
