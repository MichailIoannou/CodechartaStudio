import type { Provider } from "@angular/core"
import { BRANCH_ACTIONS, COMMIT_ACTIONS } from "../../gitHistory/facade"
import {
    compareBranchWithOtherAction,
    compareBranchWithTargetAction,
    compareTwoCommitsAction,
    compareWithCurrentAction,
    compareWithOtherCommitAction,
    compareWithParentAction
} from "./compareHistoryActions"

/** Plugs comparing into the History's menus through its ports; the dependency points from compare to gitHistory only. */
export function provideCompareForGitHistory(): Provider[] {
    return [
        { provide: COMMIT_ACTIONS, multi: true, useFactory: compareTwoCommitsAction },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: compareWithParentAction },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: compareWithCurrentAction },
        { provide: COMMIT_ACTIONS, multi: true, useFactory: compareWithOtherCommitAction },
        { provide: BRANCH_ACTIONS, multi: true, useFactory: compareBranchWithTargetAction },
        { provide: BRANCH_ACTIONS, multi: true, useFactory: compareBranchWithOtherAction }
    ]
}
