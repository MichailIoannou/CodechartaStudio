import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import { Router } from "@angular/router"
import { LoadedSnapshotFacts, LoadFilesUseCase, ProjectSnapshotsLoadResult, ProjectSnapshotToLoad } from "../../../load/load.facade"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { ProjectSummary } from "../../../model/coreApi/ProjectSummary"
import type { ResolveCommitResult } from "../../../model/coreApi/ResolveCommitResult"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { StoreProblemCode } from "../../../model/coreApi/StoreProblemCode"
import type { StoreUsage } from "../../../model/coreApi/StoreUsage"
import type { UpdateProjectParams } from "../../../model/coreApi/UpdateProjectParams"
import { ProjectSnapshotOrigin } from "../../../model/projectSnapshot.model"
import { projectRouteLink } from "../../../routing/projectRoute"
import { routeLinks } from "../../../routing/routePaths"
import type { BridgeMethod, BridgeParams, BridgeResult, DesktopBridge } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { DesktopBridgeError, valueOrThrow } from "../../../util/desktop/desktopResult"
import { StoreFolderService } from "../../desktopTools/facade"
import { ToastService } from "../../shared/facade"
import { candidatesOf, entriesOf, findSnapshot, folderLabelOf, ViewChange, viewWith, workingFolderOf } from "../util/projectSnapshots"
import { snapshotDisplayName, uniqueDisplayNames } from "../util/snapshotDisplayName"
import { readSnapshotBytes } from "./snapshotBytes"

const SILENT_ERRORS: ReadonlySet<ErrorCode> = new Set(["CANCELLED", "CORE_UNAVAILABLE"])

export interface NewProjectRequest {
    name: string
    description: string
    folders: NewFolder[]
}

export interface FolderChoice {
    projectId: string
    folderId: string
}

@Injectable({ providedIn: "root" })
export class ProjectsService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly loadFilesUseCase = inject(LoadFilesUseCase)
    private readonly toastService = inject(ToastService)
    private readonly router = inject(Router)
    private readonly unreadableSnapshotIds = new Set<string>()

    private readonly projectList = signal<ProjectSummary[]>([])
    private readonly project = signal<Project | null>(null)
    private readonly snapshots = signal<Record<string, SnapshotSummary[]>>({})
    private readonly shown = signal<SnapshotSummary | null>(null)
    private readonly problem = signal<StoreProblemCode | null>(null)
    private readonly busyFolder = signal<string | null>(null)
    private readonly folderMenuRequests = signal(0)

    readonly isDesktop = this.environment.isDesktop
    readonly projects = this.projectList.asReadonly()
    readonly activeProject = this.project.asReadonly()
    readonly snapshotsByFolder = this.snapshots.asReadonly()
    readonly shownSnapshot = this.shown.asReadonly()
    readonly storeProblem = this.problem.asReadonly()
    readonly busyFolderId = this.busyFolder.asReadonly()
    readonly isBusy = computed(() => this.busyFolder() !== null)
    readonly workingFolder = computed(() => workingFolderOf(this.project()))
    /** Counts the requests of other views to open the project menu for choosing the working folder. */
    readonly folderMenuRequest = this.folderMenuRequests.asReadonly()

    constructor() {
        const storeChanges = inject(StoreFolderService).changes
        effect(() => {
            if (storeChanges() > 0) {
                untracked(() => void this.reloadAfterStoreChange().catch(error => this.toastUnlessSilent(error, (error as Error).message)))
            }
        })
    }

    async initialise(): Promise<void> {
        await Promise.all([this.readStoreStatus(), this.refreshProjects()])
        const { activeProjectId } = await this.request("projects.getActive", {})
        if (activeProjectId) {
            await this.readProject(activeProjectId)
        }
    }

    async refreshProjects(): Promise<void> {
        const { projects } = await this.request("projects.list", {})
        this.projectList.set(projects)
    }

    async openProject(projectId: string | null): Promise<void> {
        await this.request("projects.setActive", { projectId })
        if (projectId === null) {
            this.closeActiveProject()
            return
        }
        await this.readProject(projectId)
        await this.showWorkingFolder()
    }

    async chooseFolder(choice: FolderChoice): Promise<void> {
        const isCurrent = choice.projectId === this.project()?.id && choice.folderId === this.workingFolder()?.id
        if (isCurrent || this.isBusy()) {
            return
        }
        this.busyFolder.set(choice.folderId)
        try {
            await this.switchTo(choice)
        } catch (error) {
            this.toastUnlessSilent(error, `Could not open '${this.labelOf(choice)}': ${(error as Error).message}`)
        } finally {
            this.busyFolder.set(null)
        }
    }

    requestFolderMenu(): void {
        this.folderMenuRequests.update(count => count + 1)
    }

    async showSnapshot(ref: SnapshotRef): Promise<void> {
        await this.request("projects.setActive", { projectId: ref.projectId })
        await this.readProject(ref.projectId)
        await this.rememberView({ workingFolderId: ref.folderId })
        await this.refreshProjects()
        const folder = this.workingFolder()
        const snapshot = this.findSnapshot(ref)
        const result = folder && snapshot ? await this.loadFilesUseCase.loadProjectSnapshots(this.toLoad([{ folder, snapshot }])) : null
        if (result && (await this.acceptLoadResult(result))) {
            this.showMap()
            return
        }
        await this.showWorkingFolder()
    }

    /** Loads a snapshot of the working folder into the map and stays on the current view. */
    async loadSnapshot(ref: SnapshotRef): Promise<boolean> {
        const folder = this.workingFolder()
        if (folder?.id !== ref.folderId || ref.projectId !== this.project()?.id) {
            return false
        }
        if (!this.hasSnapshot(ref)) {
            await this.refreshFolderSnapshots(ref)
        }
        const snapshot = this.findSnapshot(ref)
        return snapshot
            ? this.acceptLoadResult(await this.loadFilesUseCase.loadProjectSnapshots(this.toLoad([{ folder, snapshot }])))
            : false
    }

    /**
     * Replaces the loaded maps with snapshots of the active project in one step; the first is the one the map shows.
     * Snapshots of identical content are loaded once, as the earliest in the list.
     */
    async loadSnapshots(refs: SnapshotRef[]): Promise<ProjectSnapshotsLoadResult> {
        for (const ref of refs.filter(ref => !this.hasSnapshot(ref))) {
            await this.refreshFolderSnapshots(ref)
        }
        const entries = entriesOf(this.project(), this.snapshots(), refs)
        if (!entries) {
            return { loaded: [], identicalContent: [], unreadable: [] }
        }
        const result = await this.loadFilesUseCase.loadProjectSnapshots(this.toLoad(entries))
        this.reportUnreadable(result)
        await this.showLoaded(result.loaded)
        return result
    }

    snapshotsToShow(): Promise<ProjectSnapshotToLoad[]> {
        const folder = this.workingFolder()
        const snapshot = folder ? this.candidatesFor(folder)[0] : undefined
        return Promise.resolve(folder && snapshot ? this.toLoad([{ folder, snapshot }]) : [])
    }

    async showWorkingFolder(): Promise<void> {
        const folder = this.workingFolder()
        for (const snapshot of folder ? this.candidatesFor(folder) : []) {
            const result = await this.loadFilesUseCase.loadProjectSnapshots(this.toLoad([{ folder, snapshot }]))
            if (await this.acceptLoadResult(result)) {
                return
            }
        }
        this.showNothing()
    }

    async reloadAfterReset(): Promise<void> {
        const toLoad = await this.snapshotsToShow()
        if (toLoad.length === 0) {
            this.loadFilesUseCase.unloadAllFiles()
            return
        }
        const result = await this.loadFilesUseCase.loadProjectSnapshots(toLoad, { discardMetricSelection: true })
        if (!(await this.acceptLoadResult(result))) {
            await this.showWorkingFolder()
        }
    }

    async reloadAfterStoreChange(): Promise<void> {
        this.unreadableSnapshotIds.clear()
        this.project.set(null)
        this.snapshots.set({})
        await this.initialise()
        if (this.project()) {
            await this.showWorkingFolder()
        } else {
            this.showNothing()
        }
    }

    async acceptLoadResult(result: ProjectSnapshotsLoadResult): Promise<boolean> {
        this.toastIdenticalContent(result)
        this.reportUnreadable(result)
        return this.showLoaded(result.loaded)
    }

    private reportUnreadable(result: ProjectSnapshotsLoadResult): void {
        for (const origin of result.unreadable) {
            this.unreadableSnapshotIds.add(origin.snapshotId)
            this.toastService.show(`The analysis of '${origin.folderLabel}' could not be read`, "error")
        }
    }

    /** The first loaded snapshot becomes the shown one; the facts of every loaded map are recorded. */
    private async showLoaded(loaded: LoadedSnapshotFacts[]): Promise<boolean> {
        const [first] = loaded
        if (!first) {
            return false
        }
        this.shown.set(this.findSnapshot(first.origin))
        const recordings = loaded.map(facts => this.recordMapFacts(this.findSnapshot(facts.origin), facts))
        await Promise.all([...recordings, this.rememberShown(first.origin)])
        return true
    }

    showSampleFiles(): void {
        this.shown.set(null)
        this.loadFilesUseCase.showSampleFiles()
        void this.router.navigateByUrl(routeLinks.metrics)
    }

    showMap(): void {
        void this.router.navigateByUrl(routeLinks.metrics)
    }

    showOverview(): void {
        void this.router.navigateByUrl(projectRouteLink)
    }

    async createProject(request: NewProjectRequest): Promise<void> {
        const description = request.description.trim()
        const created = await this.request("projects.create", {
            name: request.name.trim(),
            ...(description ? { description } : {}),
            folders: request.folders
        })
        await this.refreshProjects()
        await this.openProject(created.id)
    }

    async updateProject(changes: Omit<UpdateProjectParams, "projectId">): Promise<void> {
        await this.applyProject(await this.request("projects.update", { projectId: this.requireProject().id, ...changes }))
    }

    async deleteProject(projectId: string): Promise<void> {
        await this.request("projects.delete", { projectId, permanently: false })
        if (projectId === this.project()?.id) {
            await this.openProject(null)
        }
        await this.refreshProjects()
    }

    resolveCommit(folder: FolderRef, hash: string): Promise<ResolveCommitResult> {
        return this.request("projects.resolveCommit", { ...folder, hash })
    }

    async moveSnapshot(ref: SnapshotRef, change: { toFolderId: string; bindToCommit: string | null }): Promise<void> {
        const moved = await this.request("snapshots.move", { ...ref, ...change })
        await this.showSnapshot(moved.ref)
    }

    async refreshFolderSnapshots(folder: FolderRef): Promise<void> {
        if (folder.projectId !== this.project()?.id) {
            return
        }
        const { snapshots } = await this.request("snapshots.list", folder)
        this.snapshots.update(byFolder => ({ ...byFolder, [folder.folderId]: snapshots }))
    }

    async readStoreUsage(): Promise<StoreUsage | null> {
        const project = this.project()
        return project ? this.request("snapshots.usage", { projectId: project.id }) : null
    }

    toastUnlessSilent(error: unknown, text: string): void {
        if (!(error instanceof DesktopBridgeError && SILENT_ERRORS.has(error.code))) {
            this.toastService.show(text, "error")
        }
    }

    private async switchTo(choice: FolderChoice): Promise<void> {
        if (choice.projectId !== this.project()?.id) {
            await this.request("projects.setActive", { projectId: choice.projectId })
            await this.readProject(choice.projectId)
        }
        await this.rememberView({ workingFolderId: choice.folderId })
        await this.showWorkingFolder()
    }

    private async readStoreStatus(): Promise<void> {
        const { problem } = await this.request("store.status", {})
        this.problem.set(problem)
    }

    private async readProject(projectId: string): Promise<void> {
        const project = await this.request("projects.get", { projectId })
        this.project.set(project)
        this.snapshots.set(await this.listSnapshots(project))
    }

    async applyProject(project: Project): Promise<void> {
        this.project.set(project)
        this.snapshots.set(await this.listSnapshots(project))
        await this.refreshProjects()
    }

    private async listSnapshots(project: Project): Promise<Record<string, SnapshotSummary[]>> {
        const lists = await Promise.all(
            project.folders.map(folder => this.request("snapshots.list", { projectId: project.id, folderId: folder.id }))
        )
        return Object.fromEntries(project.folders.map((folder, index) => [folder.id, lists[index].snapshots]))
    }

    private closeActiveProject(): void {
        this.project.set(null)
        this.snapshots.set({})
        this.showNothing()
    }

    private showNothing(): void {
        this.shown.set(null)
        this.loadFilesUseCase.unloadAllFiles()
        this.showOverview()
    }

    private candidatesFor(folder: ProjectFolder): SnapshotSummary[] {
        const rememberedId = this.project()?.view.shownSnapshotIdByFolder[folder.id]
        return candidatesOf(this.snapshots(), folder, this.unreadableSnapshotIds, rememberedId)
    }

    private toLoad(entries: { folder: ProjectFolder; snapshot: SnapshotSummary }[]): ProjectSnapshotToLoad[] {
        const names = uniqueDisplayNames(entries.map(({ folder, snapshot }) => snapshotDisplayName(folder.label, snapshot)))
        const bridge = this.bridge
        return entries.map(({ folder, snapshot }, index) => ({
            origin: { ...snapshot.ref, folderLabel: folder.label },
            displayName: names[index],
            readBytes: () => readSnapshotBytes(bridge, snapshot.ref)
        }))
    }

    private toastIdenticalContent(result: ProjectSnapshotsLoadResult): void {
        for (const { kept, dropped } of result.identicalContent) {
            this.toastService.show(`${this.nameOf(kept)} and ${this.nameOf(dropped)} have identical content: no differences`, "info")
        }
    }

    private nameOf(origin: ProjectSnapshotOrigin): string {
        return snapshotDisplayName(origin.folderLabel, this.findSnapshot(origin))
    }

    private hasSnapshot(ref: SnapshotRef): boolean {
        return findSnapshot(this.snapshots(), ref) !== undefined
    }

    private findSnapshot(origin: SnapshotRef): SnapshotSummary {
        return findSnapshot(this.snapshots(), origin) as SnapshotSummary
    }

    private async recordMapFacts(snapshot: SnapshotSummary, facts: { checksum: string; rootName: string }): Promise<void> {
        if (snapshot.checksum !== null) {
            return
        }
        try {
            await this.request("snapshots.recordMapFacts", { ...snapshot.ref, checksum: facts.checksum, rootName: facts.rootName })
        } catch {
            // The facts only spare a later re-read; the map is on screen either way.
        }
    }

    private async rememberShown(origin: ProjectSnapshotOrigin): Promise<void> {
        if (this.project()?.view.shownSnapshotIdByFolder[origin.folderId] === origin.snapshotId) {
            return
        }
        await this.rememberView({ shownSnapshotIdByFolder: { [origin.folderId]: origin.snapshotId } })
    }

    private async rememberView(change: ViewChange): Promise<void> {
        const project = this.requireProject()
        const view = viewWith(project.view, change)
        await this.request("projects.setView", { projectId: project.id, view })
        this.project.set({ ...project, view })
    }

    private labelOf(choice: FolderChoice): string {
        return folderLabelOf(this.projectList(), choice.projectId, choice.folderId)
    }

    requireProject(): Project {
        const project = this.project()
        if (!project) {
            throw new DesktopBridgeError({ code: "NOT_FOUND", message: "No project is open." })
        }
        return project
    }

    private get bridge(): DesktopBridge {
        return this.environment.requireBridge()
    }

    async request<Method extends BridgeMethod>(method: Method, params: BridgeParams<Method>): Promise<BridgeResult<Method>> {
        return valueOrThrow(await this.bridge.request(method, params))
    }
}
