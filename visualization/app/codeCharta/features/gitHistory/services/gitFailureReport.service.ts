import { Injectable, inject } from "@angular/core"
import { ToastService } from "../../shared/facade"
import type { GitError } from "../model/gitError"
import { GitErrorContext, gitErrorSentence } from "../util/gitErrorText"

/** A failed git write as an error toast that stays until dismissed, with git's own text behind "Details". */
@Injectable({ providedIn: "root" })
export class GitFailureReport {
    private readonly toast = inject(ToastService)

    /** A cancel the user asked for needs no message: the button already shows the operation ended. */
    report(error: GitError, context: GitErrorContext = {}): void {
        if (error.code !== "CANCELLED") {
            this.toast.show(gitErrorSentence(error, context), "error", error.detail ? { details: error.detail } : {})
        }
    }
}
