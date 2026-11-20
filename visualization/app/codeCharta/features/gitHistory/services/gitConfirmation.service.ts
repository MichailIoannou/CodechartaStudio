import { computed, Injectable, signal } from "@angular/core"
import type { GitChoice, GitConfirmation } from "../util/effectText"

type Question = { kind: "confirm"; confirmation: GitConfirmation } | { kind: "choose"; choice: GitChoice<string> }

interface PendingQuestion {
    question: Question
    /** The chosen value, `CONFIRMED` for a confirmation, or null for a decline. */
    settle: (answer: string | null) => void
}

const CONFIRMED = "confirmed"

/** The confirmation or choice git writes ask first, one at a time; asking again declines the open one. */
@Injectable({ providedIn: "root" })
export class GitConfirmationService {
    private readonly pending = signal<PendingQuestion | null>(null)

    readonly current = computed(() => {
        const question = this.pending()?.question
        return question?.kind === "confirm" ? question.confirmation : null
    })
    readonly currentChoice = computed(() => {
        const question = this.pending()?.question
        return question?.kind === "choose" ? question.choice : null
    })

    async ask(confirmation: GitConfirmation): Promise<boolean> {
        return (await this.open({ kind: "confirm", confirmation })) === CONFIRMED
    }

    /** Null when the user cancels. */
    choose<Value extends string>(choice: GitChoice<Value>): Promise<Value | null> {
        return this.open({ kind: "choose", choice }) as Promise<Value | null>
    }

    answer(isConfirmed: boolean): void {
        const isConfirmation = this.pending()?.question.kind === "confirm"
        this.settle(isConfirmed && isConfirmation ? CONFIRMED : null)
    }

    pick(value: string): void {
        if (this.pending()?.question.kind === "choose") {
            this.settle(value)
        }
    }

    private open(question: Question): Promise<string | null> {
        this.settle(null)
        return new Promise(settle => this.pending.set({ question, settle }))
    }

    private settle(answer: string | null): void {
        const pending = this.pending()
        this.pending.set(null)
        pending?.settle(answer)
    }
}
