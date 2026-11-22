import type { OperationInProgress } from "../../../model/coreApi/OperationInProgress"

/** How a sentence names the operation git is in the middle of. */
export const OPERATION_NAMES: Readonly<Record<OperationInProgress, string>> = {
    merge: "merge",
    rebase: "rebase",
    cherryPick: "cherry-pick",
    revert: "revert",
    bisect: "bisect"
}
