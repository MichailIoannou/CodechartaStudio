import { Injectable, inject } from "@angular/core"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import { shortSha } from "../../../util/wording"
import { ToastService } from "../../shared/facade"

/** Copies what the commit list and its menu offer to copy. */
@Injectable({ providedIn: "root" })
export class CommitClipboardService {
    private readonly toastService = inject(ToastService)

    async copySha(commit: GitCommitSummary): Promise<void> {
        await navigator.clipboard.writeText(commit.sha)
        this.toastService.show(`Copied ${shortSha(commit.sha)}`, "success")
    }

    async copySubject(commit: GitCommitSummary): Promise<void> {
        await navigator.clipboard.writeText(commit.subject)
    }
}
