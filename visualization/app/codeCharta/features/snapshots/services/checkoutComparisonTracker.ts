import { computed, effect, Signal, signal, untracked } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitDistance } from "../../../model/coreApi/GitCommitDistance"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { SelectedTarget } from "../model/snapshotTarget"
import { CheckoutComparison, checkoutResolutionOf, folderKeyOf, isAnalysisOf } from "../util/snapshotViewRules"

export interface CheckoutSources {
    folder: Signal<FolderRef | null>
    target: Signal<SelectedTarget | null>
    shown: Signal<SnapshotSummary | null>
    headCommit: Signal<string | null>
    /** The resolution of a target that is not one snapshot. */
    resolution: Signal<SnapshotResolution | null>
}

interface CommitDistances {
    distanceOf(folder: FolderRef, target: string, candidate: string): Promise<GitCommitDistance | null>
}

interface FolderSnapshots {
    snapshots(folderId: string): SnapshotSummary[]
}

/** The commit of the snapshot target on the map, to be measured against HEAD. */
interface DistanceRequest {
    key: string
    folder: FolderRef
    head: string
    commit: string
}

interface MeasuredDistance {
    key: string
    distance: GitCommitDistance | null
}

/** Measures the snapshot target on the map against HEAD again whenever either of them moves. */
export class CheckoutComparisonTracker {
    private readonly measured = signal<MeasuredDistance | null>(null)
    private readonly request = computed(() => this.requestOfTarget(), { equal: (first, second) => first?.key === second?.key })
    /** How far the snapshot target is from the current checkout, as a resolution of the current checkout. */
    readonly resolution = computed(() => this.resolutionOfTarget())
    readonly comparison = computed(() => this.comparisonOfTarget())
    readonly comparedResolution = computed(() => this.sources.resolution() ?? this.resolution())
    /** The folder of a snapshot target away from the current checkout. */
    readonly folderAwayFromCheckout = computed(() => (this.resolution() ? (this.request()?.folder ?? null) : null))

    constructor(
        private readonly sources: CheckoutSources,
        private readonly git: CommitDistances,
        private readonly catalog: FolderSnapshots
    ) {}

    /** Starts measuring; call it in an injection context. */
    track(): void {
        effect(() => {
            const next = this.request()
            untracked(() => void this.measure(next))
        })
    }

    private requestOfTarget(): DistanceRequest | null {
        const folder = this.sources.folder()
        const target = this.sources.target()
        const shown = this.sources.shown()
        const head = this.sources.headCommit()
        const commit = shown?.commit
        if (!(folder && head && commit && target?.kind === "snapshot" && target.ref.snapshotId === shown.ref.snapshotId)) {
            return null
        }
        return { key: `${folderKeyOf(folder)}|${shown.ref.snapshotId}|${commit}|${head}`, folder, head, commit }
    }

    private async measure(request: DistanceRequest | null): Promise<void> {
        if (!request || request.head === request.commit) {
            return
        }
        const distance = await this.git.distanceOf(request.folder, request.head, request.commit)
        if (this.request()?.key === request.key) {
            this.measured.set({ key: request.key, distance })
        }
    }

    private resolutionOfTarget(): SnapshotResolution | null {
        const request = this.request()
        const shown = this.sources.shown()
        const measured = this.measured()
        return request && shown && measured?.key === request.key ? checkoutResolutionOf(shown, measured.distance) : null
    }

    private comparisonOfTarget(): CheckoutComparison | null {
        const resolution = this.resolution()
        const request = this.request()
        if (!(resolution && request)) {
            return null
        }
        return { resolution, isHeadAnalysed: isAnalysisOf(request.head, this.catalog.snapshots(request.folder.folderId)) }
    }
}
