import type { Provider } from "@angular/core"
import { ANALYSED_COMMITS, COMMIT_ACTIONS, LOADED_MAP_LOCATOR } from "../../gitHistory/facade"
import { SnapshotBadgeProvider } from "../services/snapshotBadgeProvider.service"
import { SnapshotMapLocator } from "../services/snapshotMapLocator.service"
import { analyseThisCommitAction, analyseWorkingTreeAction } from "./analyseCommitActions"
import { showInMapAction } from "./showInMapAction"

/** Plugs the analyses into the History through its ports; the dependency points from snapshots to gitHistory only. */
export function provideSnapshotsForGitHistory(): Provider[] {
    return [
        { provide: ANALYSED_COMMITS, useExisting: SnapshotBadgeProvider },
        { provide: LOADED_MAP_LOCATOR, useExisting: SnapshotMapLocator },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: showInMapAction },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: analyseThisCommitAction },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: analyseWorkingTreeAction }
    ]
}
