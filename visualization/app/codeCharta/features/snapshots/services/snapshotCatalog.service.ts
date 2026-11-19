import { DestroyRef, Injectable, inject, signal } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { ProjectsFacade } from "../../projects/facade"

/** The snapshots of the active project's folders, kept current when an analysis writes a new one. */
@Injectable({ providedIn: "root" })
export class SnapshotCatalogService {
    private readonly projects = inject(ProjectsFacade)
    private readonly failures = signal<Readonly<Record<string, string>>>({})

    constructor() {
        const environment = inject(DesktopEnvironment)
        if (!environment.isDesktop()) {
            return
        }
        const unsubscribe = environment.requireBridge().subscribe("snapshots.changed", folder => void this.refresh(folder))
        inject(DestroyRef).onDestroy(unsubscribe)
    }

    snapshots(folderId: string): SnapshotSummary[] {
        return this.projects.snapshotsByFolder()[folderId] ?? []
    }

    failureOf(folderId: string): string | null {
        return this.failures()[folderId] ?? null
    }

    async refresh(folder: FolderRef): Promise<void> {
        try {
            await this.projects.refreshFolderSnapshots(folder)
            this.failures.update(({ [folder.folderId]: _cleared, ...rest }) => rest)
        } catch (error) {
            this.failures.update(failures => ({ ...failures, [folder.folderId]: (error as Error).message }))
        }
    }

    async refreshActiveProject(): Promise<void> {
        const project = this.projects.activeProject()
        await Promise.all((project?.folders ?? []).map(folder => this.refresh({ projectId: project?.id ?? "", folderId: folder.id })))
    }
}
