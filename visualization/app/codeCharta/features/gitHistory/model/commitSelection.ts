import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../model/coreApi/GitStatus"

export type SelectionItem = { kind: "commit"; commit: GitCommitSummary } | { kind: "workingTree"; status: GitStatus }

export interface CommitSelection {
    repo: FolderRef
    /** One or two, in list order (the working tree first). */
    items: readonly SelectionItem[]
}

export const WORKING_TREE_KEY = "working-tree"

/** The working tree's key, or the commit's SHA: what a list row and a selection item are known by. */
export function selectionKeyOf(item: SelectionItem): string {
    return item.kind === "workingTree" ? WORKING_TREE_KEY : item.commit.sha
}
