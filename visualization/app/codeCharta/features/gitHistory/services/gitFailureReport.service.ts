import { Injectable, inject } from "@angular/core"
import { ToastService } from "../../shared/facade"
import type { GitError } from "../model/gitError"
import { readyValueOf } from "../model/loadState"
import { GitErrorContext, gitErrorCommands, gitErrorSentence } from "../util/gitErrorText"
import { GitRepositoryService } from "./gitRepository.service"

/** A failed git write as an error toast that stays until dismissed, with git's own text behind "Details". */
@Injectable({ providedIn: "root" })
export class GitFailureReport {
    private readonly toast = inject(ToastService)
    private readonly repository = inject(GitRepositoryService)

    /** A cancel the user asked for needs no message: the button already shows the operation ended. */
    report(error: GitError, context: GitErrorContext = {}): void {
        if (error.code === "CANCELLED") {
            return
        }
        const inProgress = context.inProgress ?? readyValueOf(this.repository.status())?.operationInProgress ?? null
        const commands = gitErrorCommands(error)
        this.toast.show(gitErrorSentence(error, { ...context, inProgress }), "error", {
            ...(error.detail ? { details: error.detail } : {}),
            ...(commands.length > 0 ? { commands } : {})
        })
    }
}
