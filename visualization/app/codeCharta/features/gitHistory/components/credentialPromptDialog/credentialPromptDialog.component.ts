import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, viewChild } from "@angular/core"
import { DesktopEnvironment } from "../../../../util/desktop/desktopEnvironment.service"
import { CredentialPromptService, MAX_PROMPT_ANSWER_LENGTH } from "../../services/credentialPrompt.service"

const TITLE = "Git Needs Your Input"

/**
 * Asks what git or ssh asks, over any view. The typed answer lives only in the input element: it is read when sent
 * and the input is emptied at once, so no signal, log or stored state ever holds it.
 */
@Component({
    selector: "cc-credential-prompt-dialog",
    templateUrl: "./credentialPromptDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialPromptDialogComponent {
    private readonly prompts = inject(CredentialPromptService)
    private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>("dialog")
    private readonly answerInput = viewChild<ElementRef<HTMLInputElement>>("answerInput")
    private readonly noButton = viewChild<ElementRef<HTMLButtonElement>>("noButton")

    readonly isDesktop = inject(DesktopEnvironment).isDesktop
    readonly maxAnswerLength = MAX_PROMPT_ANSWER_LENGTH
    readonly prompt = this.prompts.current
    readonly title = computed(() => {
        const count = this.prompts.waitingCount()
        return count > 1 ? `${TITLE} (1 of ${count})` : TITLE
    })

    constructor() {
        effect(() => this.showOrClose(this.prompt()?.promptId ?? null))
    }

    submit(event: Event) {
        event.preventDefault()
        const prompt = this.prompt()
        const input = this.answerInput()?.nativeElement
        if (!prompt || !input) {
            return
        }
        const answer = input.value
        input.value = ""
        void this.prompts.answer(prompt.promptId, answer)
    }

    answerConfirm(answer: "yes" | "no") {
        const prompt = this.prompt()
        if (prompt) {
            void this.prompts.answer(prompt.promptId, answer)
        }
    }

    cancel() {
        const prompt = this.prompt()
        this.clearInput()
        if (prompt) {
            void this.prompts.cancel(prompt.promptId)
        }
    }

    /** Escape and the backdrop close the native dialog; a prompt still open then was not answered. */
    onClosed() {
        if (this.prompt()) {
            this.cancel()
        }
    }

    private showOrClose(promptId: string | null) {
        const dialog = this.dialog()?.nativeElement
        this.clearInput()
        if (!dialog) {
            return
        }
        if (promptId && !dialog.open) {
            dialog.showModal()
        } else if (!promptId && dialog.open) {
            dialog.close()
        }
        if (promptId) {
            setTimeout(() => (this.answerInput() ?? this.noButton())?.nativeElement.focus())
        }
    }

    private clearInput() {
        const input = this.answerInput()?.nativeElement
        if (input) {
            input.value = ""
        }
    }
}
