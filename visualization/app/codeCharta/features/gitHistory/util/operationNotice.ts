import type { GitAbortableOperation } from "../../../model/coreApi/GitAbortableOperation"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { counted, shortSha } from "../../../util/wording"
import { OPERATION_NAMES } from "./operationNames"

/** Design H6: the lasting notice of an operation git is in the middle of; only a merge or rebase can be aborted here. */
export interface OperationNotice {
    text: string
    abortable: GitAbortableOperation | null
}

export function operationNoticeOf(status: GitStatus): OperationNotice | null {
    switch (status.operationInProgress) {
        case null:
            return null
        case "merge":
            return { text: mergeText(status), abortable: "merge" }
        case "rebase":
            return { text: rebaseText(status), abortable: "rebase" }
        default:
            return {
                text: `A ${OPERATION_NAMES[status.operationInProgress]} is in progress. Finish or abort it in a terminal.`,
                abortable: null
            }
    }
}

function mergeText({ head, counts }: GitStatus): string {
    const target = head.kind === "branch" ? `'${head.name}'` : shortSha(head.commit)
    const conflicts =
        counts.conflicted > 0 ? ` ${counted(counts.conflicted, "file")} ${counts.conflicted === 1 ? "has" : "have"} conflicts.` : ""
    return `Merging into ${target}. Resolve the conflicts in your editor, stage the files, then commit.${conflicts}`
}

/** git detaches HEAD while it rebases, so the branch is only known when the core still reports one. */
function rebaseText({ head }: GitStatus): string {
    const opening = head.kind === "branch" ? `Rebasing '${head.name}'.` : "A rebase is in progress."
    return `${opening} Resolve the conflicts in your editor, stage the files, then continue the rebase in a terminal.`
}
