import { Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { PrunePlan } from "../../../model/coreApi/PrunePlan"
import type { PrunePolicy } from "../../../model/coreApi/PrunePolicy"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { StoreUsage } from "../../../model/coreApi/StoreUsage"
import type { DesktopBridge } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { DesktopBridgeError, valueOrThrow } from "../../../util/desktop/desktopResult"
import { ProjectsFacade } from "../../projects/facade"
import { ToastService } from "../../shared/facade"
import {
    movedText,
    RECYCLE_FAILED_FOR_ONE,
    recycleFailedForCleanup,
    SHOWN_SNAPSHOT_DELETED,
    SNAPSHOT_BEING_WRITTEN
} from "../util/retentionWording"
import { SnapshotCatalogService } from "./snapshotCatalog.service"

/** Whether a clean-up ran, or the recycle bin refused it (already told in a toast). */
export type PruneOutcome = "pruned" | "recycleFailed"

/**
 * Measures, deletes and cleans up snapshots. Everything goes to the recycle bin (owner decision); when the recycle
 * bin fails nothing is deleted for good, the user only learns what happened.
 */
@Injectable({ providedIn: "root" })
export class SnapshotRetentionService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly projects = inject(ProjectsFacade)
    private readonly catalog = inject(SnapshotCatalogService)
    private readonly toastService = inject(ToastService)

    async usage(projectId: string): Promise<StoreUsage> {
        return valueOrThrow(await this.bridge.request("snapshots.usage", { projectId }))
    }

    async delete(snapshot: SnapshotSummary): Promise<void> {
        const isShown = this.projects.shownSnapshot()?.ref.snapshotId === snapshot.ref.snapshotId
        try {
            valueOrThrow(await this.bridge.request("snapshots.delete", { ...snapshot.ref, permanently: false }))
        } catch (error) {
            this.reportDeleteFailure(error)
            return
        }
        if (isShown) {
            this.toastService.show(SHOWN_SNAPSHOT_DELETED, "info")
        }
    }

    async planPrune(folder: FolderRef, policy: PrunePolicy): Promise<PrunePlan> {
        return valueOrThrow(await this.bridge.request("snapshots.planPrune", { ...folder, policy }))
    }

    /** Throws every failure but the recycle bin's, which the dialog shows itself. */
    async prune(folder: FolderRef, plan: PrunePlan): Promise<PruneOutcome> {
        const snapshotIds = plan.delete.map(snapshot => snapshot.ref.snapshotId)
        try {
            const result = valueOrThrow(await this.bridge.request("snapshots.prune", { ...folder, snapshotIds, permanently: false }))
            this.toastService.show(movedText(result), "success")
            return "pruned"
        } catch (error) {
            if (!isCode(error, "RECYCLE_FAILED")) {
                throw error
            }
            await this.reportPartialPrune(folder, snapshotIds, error as DesktopBridgeError)
            return "recycleFailed"
        }
    }

    private reportDeleteFailure(error: unknown) {
        if (isCode(error, "SNAPSHOT_BEING_WRITTEN")) {
            this.toastService.show(SNAPSHOT_BEING_WRITTEN, "warning")
        } else if (isCode(error, "RECYCLE_FAILED")) {
            this.toastService.show(RECYCLE_FAILED_FOR_ONE, "error", { details: (error as Error).message })
        } else {
            this.projects.toastUnlessSilent(error, (error as Error).message)
        }
    }

    private async reportPartialPrune(folder: FolderRef, snapshotIds: string[], error: DesktopBridgeError) {
        await this.catalog.refresh(folder)
        const remaining = new Set(this.catalog.snapshots(folder.folderId).map(snapshot => snapshot.ref.snapshotId))
        const moved = snapshotIds.filter(snapshotId => !remaining.has(snapshotId)).length
        this.toastService.show(recycleFailedForCleanup(moved, snapshotIds.length), "error", { details: error.message })
    }

    private get bridge(): DesktopBridge {
        return this.environment.requireBridge()
    }
}

function isCode(error: unknown, code: DesktopBridgeError["code"]): boolean {
    return error instanceof DesktopBridgeError && error.code === code
}
