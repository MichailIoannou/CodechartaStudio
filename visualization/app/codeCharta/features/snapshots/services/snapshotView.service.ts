import { Injectable, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { EnqueueResult } from "../../../model/coreApi/EnqueueResult"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { PreflightProblem } from "../../../model/coreApi/PreflightProblem"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import { ProjectsFacade } from "../../projects/facade"
import { ToastService } from "../../shared/facade"
import { targetName } from "../util/analysisWording"
import { AnalysisJobsService } from "./analysisJobs.service"

/** Where a refused analysis shows its preflight problems: the snapshots dialog or the workspace status. */
type ProblemsSurface = "dialog" | "status"

export interface RejectedRun {
    surface: ProblemsSurface
    problems: PreflightProblem[]
}

export interface AnalyseRequest {
    folder: FolderRef
    target: AnalysisTarget
    surface: ProblemsSurface
    force?: boolean
}

/**
 * Starts analyses and opens snapshots. The analysis the user asked for last is awaited: when it finishes in the
 * working folder, its map is shown; any other finished analysis is only announced.
 */
@Injectable({ providedIn: "root" })
export class SnapshotViewService {
    private readonly projects = inject(ProjectsFacade)
    private readonly jobs = inject(AnalysisJobsService)
    private readonly toastService = inject(ToastService)
    private readonly rejected = signal<RejectedRun | null>(null)
    private awaitedJobId: string | null = null

    readonly rejectedRun = this.rejected.asReadonly()

    constructor() {
        this.jobs.outcomes$.pipe(takeUntilDestroyed()).subscribe(job => void this.announceOutcome(job))
    }

    async analyse(request: AnalyseRequest): Promise<void> {
        this.rejected.set(null)
        try {
            const result = await this.jobs.enqueue(request.folder, request.target, request.force ?? false)
            await this.followUp(request, result)
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        }
    }

    retry(job: AnalysisJob): Promise<void> {
        return this.analyse({ folder: { projectId: job.projectId, folderId: job.folderId }, target: job.target, surface: "status" })
    }

    async open(ref: SnapshotRef): Promise<void> {
        try {
            await this.projects.showSnapshot(ref)
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        }
    }

    dismissProblems(): void {
        this.rejected.set(null)
    }

    private async followUp(request: AnalyseRequest, result: EnqueueResult): Promise<void> {
        switch (result.status) {
            case "queued":
                this.awaitedJobId = result.job.id
                return
            case "alreadyQueued":
                this.awaitedJobId = result.job.id
                this.toastService.show("This analysis is already queued.", "info")
                return
            case "alreadyAnalysed":
                this.toastService.show("Already analysed", "info")
                await this.open({ ...request.folder, snapshotId: result.snapshotId })
                return
            case "rejected":
                this.rejected.set({ surface: request.surface, problems: result.problems })
        }
    }

    private async announceOutcome(job: AnalysisJob): Promise<void> {
        const name = targetName(job.target)
        if (job.state === "failed") {
            this.toastService.show(`Analysis of ${name} failed: ${job.error?.message ?? ""}`, "error")
            return
        }
        if (!(job.id === this.awaitedJobId && job.snapshotId && this.isInWorkingFolder(job))) {
            this.toastService.show(`Analysis of ${name} finished`, "success")
            return
        }
        this.awaitedJobId = null
        await this.open({ projectId: job.projectId, folderId: job.folderId, snapshotId: job.snapshotId })
        this.toastService.show(`Showing the analysis of ${name}`, "success")
    }

    private isInWorkingFolder(job: AnalysisJob): boolean {
        return job.projectId === this.projects.activeProject()?.id && job.folderId === this.projects.workingFolder()?.id
    }
}
