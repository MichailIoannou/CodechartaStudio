import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../model/coreApi/GitStatus"

export type SelectionItem = { kind: "commit"; commit: GitCommitSummary } | { kind: "workingTree"; status: GitStatus }

export interface CommitSelection {
    repo: FolderRef
    /** One or two, in list order (the working tree first). */
    items: readonly SelectionItem[]
}
