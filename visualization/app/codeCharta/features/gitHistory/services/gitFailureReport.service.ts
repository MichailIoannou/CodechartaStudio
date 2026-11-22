import { Injectable, inject } from "@angular/core"
import { ToastService } from "../../shared/facade"
import type { GitError } from "../model/gitError"
import { readyValueOf } from "../model/loadState"
import { GitErrorContext, GitFollowUp, gitErrorCommands, gitErrorFollowUp, gitErrorSentence } from "../util/gitErrorText"
import { GitRepositoryService } from "./gitRepository.service"

/** What the caller runs for the follow-up button a failure offers ("Pull", "Fetch", "Publish branch"). */
export type GitFollowUpHandlers = Partial<Record<GitFollowUp["kind"], () => void>>

/** A failed git write as an error toast that stays until dismissed, with git's own text behind "Details". */
@Injectable({ providedIn: "root" })
export class GitFailureReport {
    private readonly toast = inject(ToastService)
    private readonly repository = inject(GitRepositoryService)

    /** A cancel the user asked for needs no message: the button already shows the operation ended. */
    report(error: GitError, context: GitErrorContext = {}, followUps: GitFollowUpHandlers = {}): void {
        if (error.code === "CANCELLED") {
            return
        }
        const inProgress = context.inProgress ?? readyValueOf(this.repository.status())?.operationInProgress ?? null
        const commands = gitErrorCommands(error)
        const action = followUpAction(error, followUps)
        this.toast.show(gitErrorSentence(error, { ...context, inProgress }), "error", {
            ...(error.detail ? { details: error.detail } : {}),
            ...(commands.length > 0 ? { commands } : {}),
            ...(action ? { action } : {})
        })
    }
}

function followUpAction(error: GitError, followUps: GitFollowUpHandlers): { label: string; run: () => void } | null {
    const followUp = gitErrorFollowUp(error)
    const run = followUp ? followUps[followUp.kind] : undefined
    return followUp && run ? { label: followUp.label, run } : null
}
