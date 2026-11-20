import { Injectable, inject } from "@angular/core"
import { AnalysisJobsService } from "../../snapshots/facade"
import type { EnqueueResult, FolderRef } from "../model/compare.model"

/** Queues the analyses of missing comparison sides in the snapshots' queue, which reports their progress. */
@Injectable({ providedIn: "root" })
export class AnalysisGatewayAdapter {
    private readonly analyses = inject(AnalysisJobsService)

    readonly jobs = this.analyses.jobs

    enqueue(folder: FolderRef, commit: string): Promise<EnqueueResult> {
        return this.analyses.enqueue(folder, { kind: "commit", sha: commit })
    }

    cancel(jobId: string): Promise<void> {
        return this.analyses.cancel(jobId)
    }
}
