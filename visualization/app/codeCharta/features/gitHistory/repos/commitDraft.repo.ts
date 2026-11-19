import { Injectable, inject } from "@angular/core"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"

const COMMIT_DRAFT_KEY_PREFIX = "codeChartaCommitDraft."

export interface CommitMessage {
    subject: string
    body: string
}

export const EMPTY_MESSAGE: CommitMessage = { subject: "", body: "" }

/** Design H12: the commit message being written, kept per repository (the message only). */
@Injectable({ providedIn: "root" })
export class CommitDraftRepo {
    private readonly localStorageRepo = inject(LocalStorageRepo)

    read(repositoryId: string): CommitMessage {
        try {
            const stored: unknown = JSON.parse(this.localStorageRepo.read(COMMIT_DRAFT_KEY_PREFIX + repositoryId) ?? "{}")
            return messageOf(stored)
        } catch {
            return EMPTY_MESSAGE
        }
    }

    write(repositoryId: string, message: CommitMessage): void {
        this.localStorageRepo.write(COMMIT_DRAFT_KEY_PREFIX + repositoryId, JSON.stringify(message))
    }
}

function messageOf(stored: unknown): CommitMessage {
    if (typeof stored !== "object" || stored === null) {
        return EMPTY_MESSAGE
    }
    const { subject, body } = stored as Partial<CommitMessage>
    return { subject: typeof subject === "string" ? subject : "", body: typeof body === "string" ? body : "" }
}
