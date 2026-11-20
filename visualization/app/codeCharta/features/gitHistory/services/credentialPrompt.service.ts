import { computed, DestroyRef, Injectable, inject, signal } from "@angular/core"
import type { PromptRequested } from "../../../model/coreApi/PromptRequested"
import { GitApiService } from "./gitApi.service"

/** git refuses longer answers; the input stops there. */
export const MAX_PROMPT_ANSWER_LENGTH = 4096

/**
 * The questions git and ssh ask while an operation runs, one at a time, oldest first. It holds the questions only:
 * an answer goes straight to the core and is never kept.
 */
@Injectable({ providedIn: "root" })
export class CredentialPromptService {
    private readonly api = inject(GitApiService)
    private readonly waiting = signal<readonly PromptRequested[]>([])

    readonly current = computed(() => this.waiting()[0] ?? null)
    readonly waitingCount = computed(() => this.waiting().length)

    constructor() {
        const stopRequested = this.api.onPromptRequested(prompt => this.waiting.update(prompts => [...prompts, prompt]))
        const stopClosed = this.api.onPromptClosed(({ promptId }) => this.drop(promptId))
        inject(DestroyRef).onDestroy(() => {
            stopRequested()
            stopClosed()
        })
    }

    async answer(promptId: string, answer: string): Promise<void> {
        this.drop(promptId)
        await this.api.answerPrompt(promptId, answer)
    }

    async cancel(promptId: string): Promise<void> {
        this.drop(promptId)
        await this.api.cancelPrompt(promptId)
    }

    private drop(promptId: string) {
        this.waiting.update(prompts => prompts.filter(prompt => prompt.promptId !== promptId))
    }
}
