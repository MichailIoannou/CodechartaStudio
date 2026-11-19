import { Injectable, inject } from "@angular/core"
import type { ProjectSnapshotsLoadResult } from "../../../load/load.facade"
import { ProjectsFacade } from "../../projects/facade"
import { SnapshotViewService } from "../../snapshots/facade"
import type { PairLoad, SnapshotSummary } from "../model/compare.model"

/** Loads compared snapshots through the projects' load path, which replaces the maps in one step and names them `<folder>@<short>`. */
@Injectable({ providedIn: "root" })
export class SnapshotGatewayAdapter {
    private readonly projects = inject(ProjectsFacade)
    private readonly snapshotView = inject(SnapshotViewService)

    async loadPair(base: SnapshotSummary, head: SnapshotSummary): Promise<PairLoad> {
        const result = await this.projects.loadSnapshots([head.ref, base.ref])
        return { base: checksumOf(result, base), head: checksumOf(result, head) }
    }

    async loadAlone(head: SnapshotSummary): Promise<string | null> {
        return checksumOf(await this.projects.loadSnapshots([head.ref]), head)
    }

    shownCommit(): string | null {
        return this.projects.shownSnapshot()?.commit ?? null
    }

    holdMap(): void {
        this.snapshotView.holdShownSnapshot()
    }
}

function checksumOf(result: ProjectSnapshotsLoadResult, snapshot: SnapshotSummary): string | null {
    return result.loaded.find(facts => facts.origin.snapshotId === snapshot.ref.snapshotId)?.checksum ?? null
}
