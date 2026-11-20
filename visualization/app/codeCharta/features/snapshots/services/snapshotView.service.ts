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
import { analysisTargetOf, isSameAnalysisTarget, SelectedTarget, targetKeyOf } from "../model/snapshotTarget"
import { isPendingJob, targetName } from "../util/analysisWording"
import { Notice, noticeText } from "../util/noticeText"
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
const IN_FLIGHT: ReadonlySet<SnapshotViewStatus> = new Set(["resolving", "loading"])

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
    readonly targetJob = computed(() => this.newestJobOfTarget())
    readonly noticeText = computed(() => this.noticeTextOfTarget())
    readonly notice = computed(() => this.visibleNotice())

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
        const target = this.target()
        const analysisTarget = target ? analysisTargetOf(target) : null
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
        this.state.update(state => (IN_FLIGHT.has(state.status) ? { ...state, status: "shown" } : state))
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
        const current = this.target()
        if (ref && !(current && targetKeyOf(current) === targetKeyOf(target))) {
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
        this.setTarget(ref, rememberedId ? { kind: "snapshot", ref: { ...ref, snapshotId: rememberedId } } : { kind: "workingTree" })
    }

    private resolutionRequest(): ResolutionRequest | null {
        const folder = this.workingRef()
        const target = this.target()
        if (!(folder && target)) {
            return null
        }
        const head = target.kind === "workingTree" ? (this.headCommit() ?? "") : ""
        return { key: `${this.folderTargetKey()}|${head}`, folder, target }
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
        const snapshot = state.resolution?.kind === "none" ? null : state.resolution?.snapshot
        if (!snapshot) {
            this.state.set({ ...state, status: "empty" })
            return
        }
        if (this.projects.shownSnapshot()?.ref.snapshotId === snapshot.ref.snapshotId) {
            this.state.set({ ...state, status: "shown" })
            this.showMapWhen(showsMap)
            return
        }
        this.state.set(state)
        const isLoaded = await this.projects.loadSnapshot(snapshot.ref)
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
        if (!(shown && folder && isSameFolder(shown, folder)) || this.isAnswered(shown, target)) {
            return
        }
        if (target?.kind !== "snapshot" && IN_FLIGHT.has(this.state().status)) {
            return
        }
        this.setTarget(folder, { kind: "snapshot", ref: shown })
    }

    private isAnswered(shown: SnapshotRef, target: SelectedTarget | null): boolean {
        if (target?.kind === "snapshot") {
            return target.ref.snapshotId === shown.snapshotId
        }
        return this.resolvedSnapshotId() === shown.snapshotId
    }

    private resolvedSnapshotId(): string | null {
        const resolution = this.resolution()
        return resolution && resolution.kind !== "none" ? resolution.snapshot.ref.snapshotId : null
    }

    private async followUp(request: AnalyseRequest, result: EnqueueResult): Promise<void> {
        switch (result.status) {
            case "queued":
                return
            case "alreadyQueued":
                this.toastService.show("This analysis is already queued.", "info")
                return
            case "alreadyAnalysed":
                this.toastService.show("Already analysed", "info")
                await this.showIfTarget(request, result.snapshotId)
                return
            case "rejected":
                this.rejected.set({ surface: request.surface, problems: result.problems })
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
        if (this.notice()?.kind !== "failed" || this.targetJob()?.id !== job.id) {
            this.toastService.show(`Analysis of ${name} failed: ${job.error?.message ?? ""}`, "error")
        }
    }

    /** An analysis answers the current checkout when it maps the working tree or the commit at HEAD. */
    private answersTarget(folder: FolderRef, analysed: AnalysisTarget): boolean {
        const ref = this.workingRef()
        const target = this.target()
        const wanted = target ? analysisTargetOf(target) : null
        if (!(ref && wanted && isSameFolder(ref, folder))) {
            return false
        }
        const head = this.headCommit()
        return (
            isSameAnalysisTarget(wanted, analysed) ||
            (wanted.kind === "workingTree" && head !== null && isSameAnalysisTarget({ kind: "commit", sha: head }, analysed))
        )
    }

    private newestJobOfTarget(): AnalysisJob | null {
        const ref = this.workingRef()
        const target = this.target()
        const wanted = target ? analysisTargetOf(target) : null
        if (!(ref && wanted)) {
            return null
        }
        const ofTarget = this.jobs.jobs().filter(job => isSameFolder(job, ref) && isSameAnalysisTarget(wanted, job.target))
        const newest = ofTarget.reduce<AnalysisJob | null>((latest, job) => (latest && latest.queuedAt > job.queuedAt ? latest : job), null)
        return newest && (isPendingJob(newest) || newest.state === "failed") ? newest : null
    }

    private noticeTextOfTarget() {
        const target = this.target()
        const folder = this.projects.workingFolder()
        if (!(target && folder)) {
            return { notice: null, badge: null }
        }
        const resolution = this.isShownTheResolution() ? this.resolution() : null
        return noticeText({ folderLabel: folder.label, target, resolution, job: this.targetJob() })
    }

    /** The notice speaks about the resolved snapshot only while it is the one on the map. */
    private isShownTheResolution(): boolean {
        const resolvedId = this.resolvedSnapshotId()
        return resolvedId === null || this.projects.shownSnapshot()?.ref.snapshotId === resolvedId
    }

    private visibleNotice(): Notice | null {
        const { notice } = this.noticeText()
        return notice && !(notice.isDismissible && this.dismissedNoticeKey() === this.noticeKey()) ? notice : null
    }

    private noticeKey(): string {
        return `${this.folderTargetKey()}|${this.projects.shownSnapshot()?.ref.snapshotId ?? ""}`
    }

    private folderTargetKey(): string {
        const ref = this.workingRef()
        const target = this.target()
        return ref && target ? `${folderKeyOf(ref)}|${targetKeyOf(target)}` : ""
    }
}

function refOf(projectId: string | undefined, folderId: string | undefined): FolderRef | null {
    return projectId && folderId ? { projectId, folderId } : null
}

function folderKeyOf(folder: FolderRef): string {
    return `${folder.projectId}/${folder.folderId}`
}

function isSameFolder(first: FolderRef | null, second: FolderRef | null): boolean {
    return first?.projectId === second?.projectId && first?.folderId === second?.folderId
}
