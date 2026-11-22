import type { PruneResult } from "../../../model/coreApi/PruneResult"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { counted } from "../../../util/wording"
import { byteSize, shortDateTime } from "../../projects/facade"
import { snapshotCommitLabel } from "./analysisWording"

export const SHOWN_SNAPSHOT_DELETED = "The analysis shown in the map was deleted; it stays visible until you open another."
export const SNAPSHOT_BEING_WRITTEN = "This analysis is still being written. Try again when it has finished."
export const RECYCLE_FAILED_FOR_ONE = "Could not move the analysis to the recycle bin. Nothing was deleted."

/** Design S4: the delete confirmation names the analysis, or the file of an imported snapshot. */
export function deleteQuestion(snapshot: SnapshotSummary): string {
    if (snapshot.source === "imported") {
        const fileName = snapshot.originalFileName ?? snapshot.ref.snapshotId
        return `Move the imported snapshot '${fileName}' to the recycle bin? It can only be restored from the recycle bin.`
    }
    if (snapshot.target === "workingTree") {
        return `Move the analysis of ${workingTreeName(snapshot)} to the recycle bin?`
    }
    const label = snapshotCommitLabel(snapshot)
    const subject = snapshot.subject ? ` (${snapshot.subject})` : ""
    return `Move the analysis of ${label}${subject} to the recycle bin?`
}

function workingTreeName(snapshot: SnapshotSummary): string {
    const onCommit = snapshot.shortCommit ? ` on ${snapshot.shortCommit}` : ""
    return `the working tree${onCommit} (${shortDateTime(snapshot.createdAt)})`
}

export function analysesWithSize(count: number, bytes: number): string {
    return `${counted(count, "analysis", "analyses")} (${byteSize(bytes)})`
}

export function movedText(result: PruneResult): string {
    return `Moved ${analysesWithSize(result.deleted, result.freedBytes)} to the recycle bin.`
}

/** A clean-up stops at the first analysis the recycle bin refuses; the ones before it are already moved. */
export function recycleFailedForCleanup(moved: number, planned: number): string {
    return moved === 0
        ? "Could not move the analyses to the recycle bin. Nothing was deleted."
        : `Moved ${moved} of ${planned} analyses to the recycle bin; the rest were kept.`
}
