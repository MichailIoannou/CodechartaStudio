import { InjectionToken } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"

/** The branch or tag a branch-tree menu was opened on. */
export interface BranchMenuTarget {
    repo: FolderRef
    /** `refs/heads/…`, `refs/remotes/…` or `refs/tags/…`. */
    refName: string
    /** As git shows it: `feature/x`, `origin/main`, `v1.0`. */
    name: string
    kind: "local" | "remote" | "tag"
    isCurrent: boolean
}

/** An item other features add to the branch menu (plan 06: "Compare with…"); listed after the History's own items. */
export interface BranchAction {
    id: string
    /** Font Awesome classes, such as "fa-solid fa-code-compare". */
    icon: string
    /** Title Case, with names in single quotes: "Compare with 'main'". */
    labelFor(target: BranchMenuTarget): string
    hoverHintFor(target: BranchMenuTarget): string
    isOfferedFor(target: BranchMenuTarget): boolean
    run(target: BranchMenuTarget): void
}

/** Multi provider: each contribution provides one action; the menu lists them in the order they are provided. */
export const BRANCH_ACTIONS = new InjectionToken<readonly BranchAction[]>("BRANCH_ACTIONS")
