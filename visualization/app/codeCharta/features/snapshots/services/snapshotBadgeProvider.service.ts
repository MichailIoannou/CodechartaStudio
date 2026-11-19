import { computed, Injectable, inject, Signal } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { AnalysedCommitMarker, AnalysedCommitsProvider } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { commitMarkersOf } from "../util/commitMarkers"
import { AnalysisJobsService } from "./analysisJobs.service"
import { SnapshotCatalogService } from "./snapshotCatalog.service"

/** The History's Analysis column, from the folder's snapshots and analysis jobs (design S10). */
@Injectable({ providedIn: "root" })
export class SnapshotBadgeProvider implements AnalysedCommitsProvider {
    private readonly catalog = inject(SnapshotCatalogService)
    private readonly jobs = inject(AnalysisJobsService)
    private readonly projects = inject(ProjectsFacade)
    private readonly markersByFolder = new Map<string, Signal<ReadonlyMap<string, AnalysedCommitMarker>>>()

    markersFor(repo: FolderRef): Signal<ReadonlyMap<string, AnalysedCommitMarker>> {
        const key = `${repo.projectId}/${repo.folderId}`
        const known = this.markersByFolder.get(key)
        if (known) {
            return known
        }
        const markers = computed(() =>
            commitMarkersOf({
                snapshots: this.catalog.snapshots(repo.folderId).filter(snapshot => snapshot.ref.projectId === repo.projectId),
                jobs: this.jobs.jobs().filter(job => job.projectId === repo.projectId && job.folderId === repo.folderId),
                shownSnapshotId: this.projects.shownSnapshot()?.ref.snapshotId ?? null
            })
        )
        this.markersByFolder.set(key, markers)
        return markers
    }

    markerOf(repo: FolderRef, sha: string): AnalysedCommitMarker | null {
        return this.markersFor(repo)().get(sha) ?? null
    }
}
