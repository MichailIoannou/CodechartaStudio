import { Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { FolderRole } from "../../../model/coreApi/FolderRole"
import type { HostingOverride } from "../../../model/coreApi/HostingOverride"
import type { NewFolder } from "../../../model/coreApi/NewFolder"
import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { ToastService } from "../../shared/facade"
import { defaultRoleFor } from "../util/folderRole"
import { ProjectsService } from "./projects.service"

@Injectable({ providedIn: "root" })
export class ProjectFoldersService {
    private readonly projects = inject(ProjectsService)
    private readonly environment = inject(DesktopEnvironment)
    private readonly toastService = inject(ToastService)

    async addFolder(folder: NewFolder): Promise<void> {
        const projectId = this.projects.requireProject().id
        await this.projects.applyProject(await this.projects.request("projects.addFolder", { projectId, folder }))
    }

    async addPickedFolder(title: string): Promise<void> {
        const picked = await this.pickFolder(title).catch((error: unknown) => {
            this.projects.toastUnlessSilent(error, (error as Error).message)
            return null
        })
        if (!picked) {
            return
        }
        try {
            const role = defaultRoleFor(picked.git, this.projects.requireProject().folders)
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
        this.projects.toastUnlessSilent(error, (error as Error).message)
    }

    async revealStoreFolder(): Promise<void> {
        const answer = await this.environment.requireBridge().reveal({ kind: "storeRoot" })
        if ("error" in answer) {
            this.projects.toastUnlessSilent(new DesktopBridgeError(answer.error), answer.error.message)
        }
    }

    async updateFolder(folderId: string, changes: { label?: string; role?: FolderRole; hosting?: HostingOverride }): Promise<void> {
        await this.projects.applyProject(await this.projects.request("projects.updateFolder", { ...this.folderRef(folderId), ...changes }))
    }

    async removeFolder(folderId: string): Promise<void> {
        const workingFolderId = this.projects.workingFolder()?.id
        const params = { ...this.folderRef(folderId), permanently: false }
        await this.projects.applyProject(await this.projects.request("projects.removeFolder", params))
        if (workingFolderId !== this.projects.workingFolder()?.id) {
            await this.projects.showWorkingFolder()
        }
    }

    async relinkFolder(folderId: string, pickToken: string, acceptDifferentHistory = false): Promise<void> {
        const params = { ...this.folderRef(folderId), pickToken, ...(acceptDifferentHistory ? { acceptDifferentHistory } : {}) }
        await this.projects.applyProject(await this.projects.request("projects.relinkFolder", params))
    }

    async refreshFolder(folderId: string): Promise<void> {
        await this.projects.applyProject(await this.projects.request("projects.refreshFolder", this.folderRef(folderId)))
    }

    pickFolder(title: string): Promise<PickedFolder | null> {
        return this.projects.request("projects.pickFolder", { title })
    }

    async readSourceFile(folder: FolderRef, relativePath: string): Promise<Uint8Array | null> {
        const sourceFile = await this.projects.request("projects.readSourceFile", { ...folder, relativePath })
        return sourceFile?.bytes ?? null
    }

    async revealFolder(folderId: string): Promise<void> {
        try {
            await this.projects.request("projects.revealFolder", this.folderRef(folderId))
        } catch (error) {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        }
    }

    private folderRef(folderId: string) {
        return { projectId: this.projects.requireProject().id, folderId }
    }
}
