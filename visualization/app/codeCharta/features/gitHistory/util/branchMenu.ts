import type { BranchRef } from "./branchTree"

export type BranchMenuAction = "switch" | "newBranch" | "rename" | "delete" | "setUpstream" | "checkOutAsNew" | "deleteRemote"

export interface BranchMenuItem {
    action: BranchMenuAction
    label: string
    icon: string
    hint: string
    /** Why the item cannot run now; it is then shown disabled with this as its hint. */
    disabledReason: string | null
}

export const WAITING_FOR_OPERATION = "Waiting for the previous git operation…"

type ItemTemplate = Omit<BranchMenuItem, "disabledReason">

const ITEMS: Readonly<Record<BranchMenuAction, ItemTemplate>> = {
    switch: { action: "switch", label: "Switch To", icon: "fa-solid fa-code-branch", hint: "Switch to this branch" },
    newBranch: { action: "newBranch", label: "New Branch from Here…", icon: "fa-solid fa-plus", hint: "Create a branch at this commit" },
    rename: { action: "rename", label: "Rename…", icon: "fa-solid fa-i-cursor", hint: "" },
    delete: { action: "delete", label: "Delete…", icon: "fa-solid fa-trash", hint: "" },
    setUpstream: { action: "setUpstream", label: "Set Upstream…", icon: "fa-solid fa-link", hint: "" },
    checkOutAsNew: {
        action: "checkOutAsNew",
        label: "Check Out as New Local Branch…",
        icon: "fa-solid fa-cloud",
        hint: "Create a local branch that tracks it"
    },
    deleteRemote: { action: "deleteRemote", label: "Delete from Remote…", icon: "fa-solid fa-trash", hint: "" }
}

/** Design H10 branch menu, without the entries of later milestones (Push, Force Push, Compare with…). */
const ACTIONS_BY_KIND: Readonly<Record<"current" | BranchRef["kind"], readonly BranchMenuAction[]>> = {
    current: ["rename", "setUpstream"],
    local: ["switch", "newBranch", "rename", "delete", "setUpstream"],
    remote: ["checkOutAsNew", "newBranch", "deleteRemote"],
    tag: ["newBranch"]
}

/** Actions that touch the checkout of the branch, which another worktree holds. */
const WORKTREE_BOUND: ReadonlySet<BranchMenuAction> = new Set(["switch", "delete"])

export function branchMenuItems(ref: BranchRef, isBusy: boolean): BranchMenuItem[] {
    const kind = ref.local?.isCurrent ? "current" : ref.kind
    const worktreePath = ref.local?.checkedOutInOtherWorktree ?? null
    return ACTIONS_BY_KIND[kind].map(action => {
        const worktreeReason = worktreePath && WORKTREE_BOUND.has(action) ? `Checked out in ${worktreePath}` : null
        const disabledReason = isBusy ? WAITING_FOR_OPERATION : worktreeReason
        return { ...ITEMS[action], disabledReason }
    })
}
