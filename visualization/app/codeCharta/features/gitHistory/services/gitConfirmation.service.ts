import { computed, Injectable, signal } from "@angular/core"
import type { GitConfirmation } from "../util/effectText"

interface PendingConfirmation {
    confirmation: GitConfirmation
    settle: (isConfirmed: boolean) => void
}

/** The confirmation git writes ask first, one at a time; asking again declines the open one. */
@Injectable({ providedIn: "root" })
export class GitConfirmationService {
    private readonly pending = signal<PendingConfirmation | null>(null)

    readonly current = computed(() => this.pending()?.confirmation ?? null)

    ask(confirmation: GitConfirmation): Promise<boolean> {
        this.answer(false)
        return new Promise(settle => this.pending.set({ confirmation, settle }))
    }

    answer(isConfirmed: boolean): void {
        const pending = this.pending()
        this.pending.set(null)
        pending?.settle(isConfirmed)
    }
}
