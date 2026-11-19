import { Injectable, inject, signal } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../../model/coreApi/PickedImportFile"
import type { Project } from "../../../model/coreApi/Project"
import type { ResolvedCommit } from "../../../model/coreApi/ResolvedCommit"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import type { BridgeMethod, BridgeParams, BridgeResult } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { valueOrThrow } from "../../../util/desktop/desktopResult"
import { defaultRoleFor } from "../util/folderRole"
import { ProjectsService } from "./projects.service"

const PICKER_FILTERS = [{ name: "cc.json files", extensions: ["json", "gz"] }]

export type OpenFileMode = "open" | "import"

export type OpenFileTarget = { kind: "newProject" } | ({ kind: "folder" } & FolderRef)

export interface PendingFile {
    mode: OpenFileMode
    picked: PickedImportFile
    importTarget: FolderRef | null
}

export interface CommitSearch {
    target: OpenFileTarget
    folderLabel: string
    commit: ResolvedCommit | null
}

@Injectable({ providedIn: "root" })
export class OpenFileService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly projects = inject(ProjectsService)
    private readonly pendingFile = signal<PendingFile | null>(null)

    readonly pending = this.pendingFile.asReadonly()

    async pickToOpen(): Promise<void> {
        await this.pick("open", null)
    }

    async pickToImport(target: FolderRef): Promise<void> {
        await this.pick("import", target)
    }

    async pickAgain(): Promise<void> {
        const pending = this.pendingFile()
        if (pending) {
            await this.pick(pending.mode, pending.importTarget)
        }
    }

    dismiss(): void {
        this.pendingFile.set(null)
    }

    open(target: OpenFileTarget, bindToCommit: string | null): Promise<SnapshotRef> {
        return this.openInto(target, bindToCommit)
    }

    async importSnapshot(target: FolderRef, bindToCommit: string | null): Promise<SnapshotRef> {
        const { importToken } = this.requirePending().picked
        const snapshot = await this.request("snapshots.import", { ...target, importToken, bindToCommit })
        return snapshot.ref
    }

    async show(ref: SnapshotRef): Promise<void> {
        this.dismiss()
        try {
            await this.projects.showSnapshot(ref)
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        }
    }

    async resolveHint(target: FolderRef): Promise<ResolvedCommit | null> {
        const hint = this.requirePending().picked.commitHint
        if (!hint) {
            return null
        }
        const { commit } = await this.projects.resolveCommit({ projectId: target.projectId, folderId: target.folderId }, hint.hash)
        return commit
    }

    async lookInAnotherFolder(target: OpenFileTarget, title: string): Promise<CommitSearch | null> {
        const folder = await this.projects.pickFolder(title)
        if (!folder) {
            return null
        }
        const project = await this.addToTarget(target, folder)
        const added = project.folders.find(candidate => candidate.path === folder.path) ?? project.folders[0]
        const found: OpenFileTarget = { kind: "folder", projectId: project.id, folderId: added.id }
        await this.projects.refreshProjects()
        return { target: found, folderLabel: added.label, commit: await this.resolveHint(found) }
    }

    private async pick(mode: OpenFileMode, importTarget: FolderRef | null): Promise<void> {
        const title = mode === "open" ? "Open cc.json" : "Import cc.json"
        const picked = await this.request("snapshots.pickImportFile", { title, filters: PICKER_FILTERS })
        if (picked) {
            this.pendingFile.set({ mode, picked, importTarget })
        }
    }

    private async openInto(target: OpenFileTarget, bindToCommit: string | null): Promise<SnapshotRef> {
        const { importToken, existingTarget } = this.requirePending().picked
        if (target.kind === "newProject" && existingTarget) {
            return this.importIntoNewProject(bindToCommit)
        }
        const folder = target.kind === "folder" ? { projectId: target.projectId, folderId: target.folderId } : null
        const opened = await this.request("snapshots.openFile", { importToken, target: folder, bindToCommit })
        return opened.snapshot.ref
    }

    private async importIntoNewProject(bindToCommit: string | null): Promise<SnapshotRef> {
        const project = await this.createProjectForContainingFolder([])
        const snapshot = await this.request("snapshots.import", {
            projectId: project.id,
            folderId: project.folders[0].id,
            importToken: this.requirePending().picked.importToken,
            bindToCommit
        })
        return snapshot.ref
    }

    private async addToTarget(target: OpenFileTarget, folder: PickedFolder): Promise<Project> {
        if (target.kind === "folder") {
            const project = await this.request("projects.get", { projectId: target.projectId })
            const role = defaultRoleFor(folder.git, project.folders)
            return this.request("projects.addFolder", {
                projectId: project.id,
                folder: { pickToken: folder.pickToken, label: folder.suggestedLabel, role }
            })
        }
        const containing = this.requirePending().picked.containingFolder
        const role = defaultRoleFor(folder.git, [{ role: "primary", git: containing.git }])
        return this.createProjectForContainingFolder([{ pickToken: folder.pickToken, label: folder.suggestedLabel, role }])
    }

    private createProjectForContainingFolder(others: NewFolder[]): Promise<Project> {
        const { pickToken, suggestedName } = this.requirePending().picked.containingFolder
        return this.request("projects.create", {
            name: suggestedName,
            folders: [{ pickToken, label: suggestedName, role: "primary" }, ...others]
        })
    }

    private requirePending(): PendingFile {
        const pending = this.pendingFile()
        if (!pending) {
            throw new Error("No file is waiting to be opened.")
        }
        return pending
    }

    private async request<Method extends BridgeMethod>(method: Method, params: BridgeParams<Method>): Promise<BridgeResult<Method>> {
        return valueOrThrow(await this.environment.requireBridge().request(method, params))
    }
}
