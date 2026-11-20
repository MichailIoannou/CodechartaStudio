import { InjectionToken } from "@angular/core"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"

/** An action other features add to a row of the snapshots dialog (plan 06: compare against a snapshot). */
export interface SnapshotAction {
    id: string
    /** Sentence case, as the row's buttons read: "Compare with working tree". */
    label: string
    hoverHint: string
    isOfferedFor(snapshot: SnapshotSummary): boolean
    run(snapshot: SnapshotSummary): void
}

/** Multi provider: each contribution provides one action; a row lists them in the order they are provided. */
export const SNAPSHOT_ACTIONS = new InjectionToken<readonly SnapshotAction[]>("SNAPSHOT_ACTIONS")
