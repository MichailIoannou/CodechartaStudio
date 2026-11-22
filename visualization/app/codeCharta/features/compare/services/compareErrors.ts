import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import type { CompareError, LoadedSide } from "../model/compare.model"
import { sideName } from "./comparisonText"

/** What the core answered as the comparison's error: a core that is not running, else its message. */
export function compareErrorOf(error: unknown): CompareError {
    if (error instanceof DesktopBridgeError && error.code === "CORE_UNAVAILABLE") {
        return { kind: "coreUnavailable", message: error.message }
    }
    return { kind: "coreError", message: (error as Error).message }
}

/** A failure while the maps load reads as a load failure. */
export function loadErrorOf(error: unknown): CompareError {
    const compareError = compareErrorOf(error)
    return compareError.kind === "coreError" ? { kind: "loadFailed", message: compareError.message } : compareError
}

export function unreadable(side: Pick<LoadedSide, "requested" | "snapshot">): CompareError {
    return { kind: "loadFailed", message: `the analysis of ${side.snapshot.shortCommit ?? sideName(side.requested)} could not be read.` }
}
