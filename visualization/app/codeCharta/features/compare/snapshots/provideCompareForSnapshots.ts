import type { Provider } from "@angular/core"
import { COMMIT_ACTIONS } from "../../gitHistory/facade"
import { SNAPSHOT_ACTIONS } from "../../snapshots/facade"
import { compareSnapshotWithOtherAction, compareWithWorkingTreeAction, compareWorkingTreeWithHeadAction } from "./compareSnapshotActions"

/** Plugs comparing against working-tree and imported analyses into the snapshots dialog and the History's uncommitted changes. */
export function provideCompareForSnapshots(): Provider[] {
    return [
        { provide: SNAPSHOT_ACTIONS, multi: true, useFactory: compareWithWorkingTreeAction },
        { provide: SNAPSHOT_ACTIONS, multi: true, useFactory: compareSnapshotWithOtherAction },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: compareWorkingTreeWithHeadAction }
    ]
}
