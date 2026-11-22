import { Injectable, signal } from "@angular/core"
import { Subject } from "rxjs"
import type { FolderRef } from "../../../model/coreApi/FolderRef"

export interface BatchDialogRequest {
    folder: FolderRef
    folderLabel: string
    /** Set when opened from a commit: the batch counts back from it instead of from a branch. */
    tipSha: string | null
}

/** Whether the batch analysis dialog is open and for which folder; the nav bar hosts it, the snapshots dialog and the History open it. */
@Injectable({ providedIn: "root" })
export class BatchAnalysisDialogService {
    private readonly request = signal<BatchDialogRequest | null>(null)
    private readonly startedBatches = new Subject<string>()

    readonly current = this.request.asReadonly()
    /** The id of each batch the dialog started, so the workspace status can show it in its activity. */
    readonly batchStarted$ = this.startedBatches.asObservable()

    show(request: BatchDialogRequest): void {
        this.request.set(request)
    }

    hide(): void {
        this.request.set(null)
    }

    announceStarted(batchId: string): void {
        this.startedBatches.next(batchId)
    }
}
