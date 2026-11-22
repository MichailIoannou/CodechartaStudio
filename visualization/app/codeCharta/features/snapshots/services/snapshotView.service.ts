import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { EnqueueResult } from "../../../model/coreApi/EnqueueResult"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { PreflightProblem } from "../../../model/coreApi/PreflightProblem"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { GitRepositoryService, isGitStatus } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { ToastService } from "../../shared/facade"
import { analysisTargetOf, SelectedTarget } from "../model/snapshotTarget"
import { targetName } from "../util/analysisWording"
import {
    analysisTargetFor,
    answersTarget,
    firstTargetOf,
    folderKeyOf,
    folderTargetKeyOf,
    isAnsweredBy,
    isFailureInNotice,
    isMapChangeFollowed,
    isNewTarget,
    isSameFolder,
    newestJobOf,
    noticeTextFor,
    refOf,
    resolutionKeyOf,
    settledOf,
    snapshotRefOf,
    visibleNoticeOf
} from "../util/snapshotViewRules"
import { AnalysisJobsService } from "./analysisJobs.service"
import { SnapshotCatalogService } from "./snapshotCatalog.service"

/** Where a refused analysis shows its preflight problems: the snapshots dialog, the workspace status or the notice. */
type ProblemsSurface = "dialog" | "status" | "notice"

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

type SnapshotViewStatus = "idle" | "resolving" | "loading" | "shown" | "empty" | "error"

/** One resolution of the working folder's target; `key` names the folder, the target and the HEAD it was asked for. */
interface ResolutionRequest {
    key: string
    folder: FolderRef
    target: SelectedTarget
}

interface ResolutionState {
    folderTargetKey: string
    resolution: SnapshotResolution | null
    status: SnapshotViewStatus
}

const IDLE_STATE: ResolutionState = { folderTargetKey: "", resolution: null, status: "idle" }
const FOLLOW_UP_TOASTS: Partial<Record<EnqueueResult["status"], string>> = {
    alreadyQueued: "This analysis is already queued.",
    alreadyAnalysed: "Already analysed"
}

/**
 * What the map shows in the working folder: the user's target (the current checkout, a commit, or one snapshot), its
 * exact or nearest snapshot, and the analyses that answer it. Selecting a target never starts an analysis.
 */
@Injectable({ providedIn: "root" })
export class SnapshotViewService {
    private readonly projects = inject(ProjectsFacade)
    private readonly jobs = inject(AnalysisJobsService)
    private readonly catalog = inject(SnapshotCatalogService)
    private readonly gitRepository = inject(GitRepositoryService)
    private readonly toastService = inject(ToastService)
    private readonly rejected = signal<RejectedRun | null>(null)
    private readonly targetsByFolder = signal<Readonly<Record<string, SelectedTarget>>>({})
    private readonly state = signal<ResolutionState>(IDLE_STATE)
    private readonly dismissedNoticeKey = signal<string | null>(null)
    private latestTicket = 0
    private showsMapAfterResolving = false

    readonly rejectedRun = this.rejected.asReadonly()
    readonly workingRef = computed(() => refOf(this.projects.activeProject()?.id, this.projects.workingFolder()?.id), {
        equal: isSameFolder
    })
    readonly target = computed(() => {
        const ref = this.workingRef()
        return ref ? (this.targetsByFolder()[folderKeyOf(ref)] ?? null) : null
    })
    readonly headCommit = computed(() => {
        const ref = this.workingRef()
        const status = ref ? this.gitRepository.statusOf(ref) : undefined
        return isGitStatus(status) ? status.head.commit : null
    })
    readonly resolution = computed(() => (this.state().folderTargetKey === this.folderTargetKey() ? this.state().resolution : null))
    readonly status = computed(() => this.state().status)
    readonly targetJob = computed(() => newestJobOf(this.jobs.jobs(), this.workingRef(), this.target()))
    readonly noticeText = computed(() => this.noticeTextOfTarget())
    readonly notice = computed(() => visibleNoticeOf(this.noticeText().notice, this.dismissedNoticeKey(), this.noticeKey()))

    constructor() {
        if (!inject(DesktopEnvironment).isDesktop()) {
            return
        }
        effect(() => {
            const ref = this.workingRef()
            untracked(() => this.chooseFirstTarget(ref))
        })
        const request = computed(() => this.resolutionRequest(), { equal: (first, second) => first?.key === second?.key })
        effect(() => {
            const next = request()
            untracked(() => void this.resolve(next))
        })
        effect(() => {
            const shown = this.projects.shownSnapshot()
            untracked(() => this.followMapChange(shown?.ref ?? null))
        })
        this.jobs.outcomes$.pipe(takeUntilDestroyed()).subscribe(job => void this.announceOutcome(job))
    }

    showCurrentCheckout(): void {
        this.showTarget({ kind: "workingTree" })
    }

    showCommit(sha: string): void {
        this.showTarget({ kind: "commit", sha })
    }

    async open(ref: SnapshotRef): Promise<void> {
        this.setTarget(ref, { kind: "snapshot", ref })
        try {
            await this.projects.showSnapshot(ref)
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        }
    }

    analyseTarget(surface: ProblemsSurface): Promise<void> {
        const folder = this.workingRef()
        const analysisTarget = analysisTargetFor(folder, this.target())
        return folder && analysisTarget ? this.analyse({ folder, target: analysisTarget, surface }) : Promise.resolve()
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

    retry(job: AnalysisJob, surface: ProblemsSurface = "status"): Promise<void> {
        return this.analyse({ folder: { projectId: job.projectId, folderId: job.folderId }, target: job.target, surface })
    }

    /** A comparison is about to take the map: a resolution in flight is dropped and the target becomes what is shown. */
    holdShownSnapshot(): void {
        this.latestTicket += 1
        this.state.update(settledOf)
        const folder = this.workingRef()
        const shown = this.projects.shownSnapshot()?.ref ?? null
        if (folder && shown && isSameFolder(shown, folder)) {
            this.setTarget(folder, { kind: "snapshot", ref: shown })
        }
    }

    dismissProblems(): void {
        this.rejected.set(null)
    }

    dismissNotice(): void {
        this.dismissedNoticeKey.set(this.noticeKey())
    }

    private showTarget(target: SelectedTarget): void {
        const ref = this.workingRef()
        if (ref && isNewTarget(this.target(), target)) {
            this.showsMapAfterResolving = true
            this.setTarget(ref, target)
        }
    }

    private setTarget(folder: FolderRef, target: SelectedTarget): void {
        this.targetsByFolder.update(targets => ({ ...targets, [folderKeyOf(folder)]: target }))
    }

    /** A restored folder shows its remembered snapshot; a folder without one shows its current checkout. */
    private chooseFirstTarget(ref: FolderRef | null): void {
        if (!ref || this.targetsByFolder()[folderKeyOf(ref)]) {
            return
        }
        const rememberedId = this.projects.activeProject()?.view.shownSnapshotIdByFolder[ref.folderId]
        this.setTarget(ref, firstTargetOf(ref, rememberedId))
    }

    private resolutionRequest(): ResolutionRequest | null {
        const folder = this.workingRef()
        const target = this.target()
        if (!(folder && target)) {
            return null
        }
        return { key: resolutionKeyOf(this.folderTargetKey(), target, this.headCommit()), folder, target }
    }

    private async resolve(request: ResolutionRequest | null): Promise<void> {
        const ticket = ++this.latestTicket
        const showsMap = this.showsMapAfterResolving
        this.showsMapAfterResolving = false
        const analysisTarget = request ? analysisTargetOf(request.target) : null
        if (!(request && analysisTarget)) {
            this.state.set(request ? { folderTargetKey: this.folderTargetKey(), resolution: null, status: "shown" } : IDLE_STATE)
            return
        }
        const folderTargetKey = this.folderTargetKey()
        this.state.set({ folderTargetKey, resolution: this.resolution(), status: "resolving" })
        try {
            const resolution = await this.catalog.resolve(request.folder, analysisTarget)
            if (ticket === this.latestTicket) {
                await this.show({ folderTargetKey, resolution, status: "loading" }, ticket, showsMap)
            }
        } catch (error) {
            this.failResolution(ticket, folderTargetKey, error)
        }
    }

    private async show(state: ResolutionState, ticket: number, showsMap: boolean): Promise<void> {
        const snapshotRef = snapshotRefOf(state.resolution)
        if (!snapshotRef) {
            this.state.set({ ...state, status: "empty" })
            return
        }
        if (this.projects.shownSnapshot()?.ref.snapshotId === snapshotRef.snapshotId) {
            this.state.set({ ...state, status: "shown" })
            this.showMapWhen(showsMap)
            return
        }
        this.state.set(state)
        const isLoaded = await this.projects.loadSnapshot(snapshotRef)
        if (ticket === this.latestTicket) {
            this.state.set({ ...state, status: isLoaded ? "shown" : "error" })
            this.showMapWhen(showsMap && isLoaded)
        }
    }

    private showMapWhen(isWanted: boolean): void {
        if (isWanted) {
            this.projects.showMap()
        }
    }

    private failResolution(ticket: number, folderTargetKey: string, error: unknown): void {
        if (ticket !== this.latestTicket) {
            return
        }
        this.state.set({ folderTargetKey, resolution: null, status: "error" })
        this.projects.toastUnlessSilent(error, (error as Error).message)
    }

    /** When something else puts a snapshot of the working folder on the map, the target becomes that snapshot. */
    private followMapChange(shown: SnapshotRef | null): void {
        const folder = this.workingRef()
        const target = this.target()
        if (!(shown && folder && isSameFolder(shown, folder)) || isAnsweredBy(shown, target, this.resolution())) {
            return
        }
        if (isMapChangeFollowed(target, this.state().status)) {
            this.setTarget(folder, { kind: "snapshot", ref: shown })
        }
    }

    private async followUp(request: AnalyseRequest, result: EnqueueResult): Promise<void> {
        if (result.status === "rejected") {
            this.rejected.set({ surface: request.surface, problems: result.problems })
            return
        }
        const toast = FOLLOW_UP_TOASTS[result.status]
        if (toast) {
            this.toastService.show(toast, "info")
        }
        if (result.status === "alreadyAnalysed") {
            await this.showIfTarget(request, result.snapshotId)
        }
    }

    private async showIfTarget(request: AnalyseRequest, snapshotId: string): Promise<void> {
        if (this.answersTarget(request.folder, request.target)) {
            await this.open({ ...request.folder, snapshotId })
        }
    }

    private async announceOutcome(job: AnalysisJob): Promise<void> {
        const name = targetName(job.target)
        const folder = { projectId: job.projectId, folderId: job.folderId }
        if (job.state === "failed") {
            this.toastFailureOutsideTheNotice(job, name)
            return
        }
        if (!(job.snapshotId && this.answersTarget(folder, job.target))) {
            this.toastService.show(`Analysis of ${name} finished`, "success")
            return
        }
        this.showsMapAfterResolving = true
        await this.resolve(this.resolutionRequest())
        if (this.status() === "shown") {
            this.toastService.show(`Showing the analysis of ${name}`, "success")
        }
    }

    private toastFailureOutsideTheNotice(job: AnalysisJob, name: string): void {
        if (!isFailureInNotice(this.notice(), this.targetJob(), job)) {
            this.toastService.show(`Analysis of ${name} failed: ${job.error?.message ?? ""}`, "error")
        }
    }

    private answersTarget(folder: FolderRef, analysed: AnalysisTarget): boolean {
        return answersTarget({ folder: this.workingRef(), target: this.target(), headCommit: this.headCommit() }, folder, analysed)
    }

    private noticeTextOfTarget() {
        return noticeTextFor({
            folderLabel: this.projects.workingFolder()?.label ?? null,
            target: this.target(),
            resolution: this.resolution(),
            job: this.targetJob(),
            shownSnapshotId: this.projects.shownSnapshot()?.ref.snapshotId ?? null
        })
    }

    private noticeKey(): string {
        return `${this.folderTargetKey()}|${this.projects.shownSnapshot()?.ref.snapshotId ?? ""}`
    }

    private folderTargetKey(): string {
        return folderTargetKeyOf(this.workingRef(), this.target())
    }
}
