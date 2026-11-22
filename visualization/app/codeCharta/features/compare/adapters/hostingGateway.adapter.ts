import { Injectable, inject } from "@angular/core"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { valueOrThrow } from "../../../util/desktop/desktopResult"
import { ProjectsFacade } from "../../projects/facade"
import type { FetchChangeRequestHeadParams, FetchedHead, FolderRef, HostingOverride, HostingStatus } from "../model/compare.model"

/** `hosting.*` through the desktop bridge; the host override goes onto the folder record through the projects. */
@Injectable({ providedIn: "root" })
export class HostingGatewayAdapter {
    private readonly environment = inject(DesktopEnvironment)
    private readonly projects = inject(ProjectsFacade)

    async status(folder: FolderRef): Promise<HostingStatus> {
        return valueOrThrow(await this.environment.requireBridge().request("hosting.status", { folder }))
    }

    async fetchHead(params: FetchChangeRequestHeadParams, operationId: string): Promise<FetchedHead> {
        return valueOrThrow(await this.environment.requireBridge().request("hosting.fetchChangeRequestHead", params, { operationId }))
    }

    cancel(operationId: string): Promise<void> {
        return this.environment.requireBridge().cancel(operationId)
    }

    async removeFetchedRefs(folder: FolderRef): Promise<number> {
        return valueOrThrow(await this.environment.requireBridge().request("hosting.removeFetchedRefs", { folder })).removed
    }

    setOverride(folder: FolderRef, override: HostingOverride): Promise<void> {
        return this.projects.setFolderHosting(folder.folderId, override)
    }
}
