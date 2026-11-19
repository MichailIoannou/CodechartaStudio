import { computed, Injectable, inject, signal } from "@angular/core"
import { Router } from "@angular/router"
import { LoadFilesUseCase, ProjectSnapshotsLoadResult, ProjectSnapshotToLoad } from "../../../load/load.facade"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { FolderRole } from "../../../model/coreApi/FolderRole"
import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { ProjectSummary } from "../../../model/coreApi/ProjectSummary"
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
import { ToastService } from "../../shared/facade"
import { defaultRoleFor } from "../util/folderRole"
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

    readonly isDesktop = this.environment.isDesktop
    readonly projects = this.projectList.asReadonly()
    readonly activeProject = this.project.asReadonly()
    readonly snapshotsByFolder = this.snapshots.asReadonly()
    readonly shownSnapshot = this.shown.asReadonly()
    readonly storeProblem = this.problem.asReadonly()
    readonly busyFolderId = this.busyFolder.asReadonly()
    readonly isBusy = computed(() => this.busyFolder() !== null)
    readonly workingFolder = computed(() => workingFolderOf(this.project()))

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

    async acceptLoadResult(result: ProjectSnapshotsLoadResult): Promise<boolean> {
        this.toastIdenticalContent(result)
        for (const origin of result.unreadable) {
            this.unreadableSnapshotIds.add(origin.snapshotId)
            this.toastService.show(`The analysis of '${origin.folderLabel}' could not be read`, "error")
        }
        const loaded = result.loaded[0]
        if (!loaded) {
            return false
        }
        const snapshot = this.findSnapshot(loaded.origin)
        this.shown.set(snapshot)
        await Promise.all([this.recordMapFacts(snapshot, loaded), this.rememberShown(loaded.origin)])
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

    async addFolder(folder: NewFolder): Promise<void> {
        await this.applyProject(await this.request("projects.addFolder", { projectId: this.requireProject().id, folder }))
    }

    async addPickedFolder(title: string): Promise<void> {
        const picked = await this.pickFolder(title).catch((error: unknown) => {
            this.toastUnlessSilent(error, (error as Error).message)
            return null
        })
        if (!picked) {
            return
        }
        try {
            const role = defaultRoleFor(picked.git, this.requireProject().folders)
            await this.addFolder({ pickToken: picked.pickToken, label: picked.suggestedLabel, role })
        } catch (error) {
            this.toastFolderRefusal(error, picked.path)
        }
    }

    toastFolderRefusal(error: unknown, path: string): void {
        if (error instanceof DesktopBridgeError && error.code === "DUPLICATE_FOLDER") {
            this.toastService.show(`'${path}' is already part of this project.`, "info")
            return
        }
        this.toastUnlessSilent(error, (error as Error).message)
    }

    async revealStoreFolder(): Promise<void> {
        const answer = await this.bridge.reveal({ kind: "storeRoot" })
        if ("error" in answer) {
            this.toastUnlessSilent(new DesktopBridgeError(answer.error), answer.error.message)
        }
    }

    async updateFolder(folderId: string, changes: { label?: string; role?: FolderRole }): Promise<void> {
        await this.applyProject(await this.request("projects.updateFolder", { ...this.folderRef(folderId), ...changes }))
    }

    async removeFolder(folderId: string): Promise<void> {
        const workingFolderId = this.workingFolder()?.id
        await this.applyProject(await this.request("projects.removeFolder", { ...this.folderRef(folderId), permanently: false }))
        if (workingFolderId !== this.workingFolder()?.id) {
            await this.showWorkingFolder()
        }
    }

    async relinkFolder(folderId: string, pickToken: string, acceptDifferentHistory = false): Promise<void> {
        const params = { ...this.folderRef(folderId), pickToken, ...(acceptDifferentHistory ? { acceptDifferentHistory } : {}) }
        await this.applyProject(await this.request("projects.relinkFolder", params))
    }

    async refreshFolder(folderId: string): Promise<void> {
        await this.applyProject(await this.request("projects.refreshFolder", this.folderRef(folderId)))
    }

    async pickFolder(title: string): Promise<PickedFolder | null> {
        return this.request("projects.pickFolder", { title })
    }

    async revealFolder(folderId: string): Promise<void> {
        try {
            await this.request("projects.revealFolder", this.folderRef(folderId))
        } catch (error) {
            this.toastUnlessSilent(error, (error as Error).message)
        }
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

    private async applyProject(project: Project): Promise<void> {
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
        const readable = (this.snapshots()[folder.id] ?? []).filter(snapshot => !this.unreadableSnapshotIds.has(snapshot.ref.snapshotId))
        const rememberedId = this.project()?.view.shownSnapshotIdByFolder[folder.id]
        const remembered = readable.find(snapshot => snapshot.ref.snapshotId === rememberedId)
        return remembered ? [remembered, ...readable.filter(snapshot => snapshot !== remembered)] : readable
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

    private findSnapshot(origin: ProjectSnapshotOrigin): SnapshotSummary {
        const snapshots = this.snapshots()[origin.folderId] ?? []
        return snapshots.find(snapshot => snapshot.ref.snapshotId === origin.snapshotId) as SnapshotSummary
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

    private async rememberView(change: { workingFolderId?: string; shownSnapshotIdByFolder?: Record<string, string> }): Promise<void> {
        const project = this.requireProject()
        const view = {
            workingFolderId: change.workingFolderId ?? project.view.workingFolderId,
            shownSnapshotIdByFolder: { ...project.view.shownSnapshotIdByFolder, ...change.shownSnapshotIdByFolder }
        }
        await this.request("projects.setView", { projectId: project.id, view })
        this.project.set({ ...project, view })
    }

    private labelOf(choice: FolderChoice): string {
        const summary = this.projectList().find(project => project.id === choice.projectId)
        return summary?.folders.find(folder => folder.id === choice.folderId)?.label ?? choice.folderId
    }

    private folderRef(folderId: string) {
        return { projectId: this.requireProject().id, folderId }
    }

    private requireProject(): Project {
        const project = this.project()
        if (!project) {
            throw new DesktopBridgeError({ code: "NOT_FOUND", message: "No project is open." })
        }
        return project
    }

    private get bridge(): DesktopBridge {
        return this.environment.requireBridge()
    }

    private async request<Method extends BridgeMethod>(method: Method, params: BridgeParams<Method>): Promise<BridgeResult<Method>> {
        return valueOrThrow(await this.bridge.request(method, params))
    }
}

function workingFolderOf(project: Project | null): ProjectFolder | null {
    if (!project) {
        return null
    }
    const working = project.folders.find(folder => folder.id === project.view.workingFolderId)
    return working ?? project.folders.find(folder => folder.role === "primary") ?? project.folders[0] ?? null
}
