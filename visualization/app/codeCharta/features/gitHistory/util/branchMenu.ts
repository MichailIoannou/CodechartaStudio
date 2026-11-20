import type { BranchRef } from "./branchTree"
import { forcePushReasonOf, pushReasonOf } from "./syncState"

export type BranchMenuAction =
    | "switch"
    | "newBranch"
    | "rename"
    | "delete"
    | "setUpstream"
    | "push"
    | "forcePush"
    | "checkOutAsNew"
    | "deleteRemote"

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
    push: { action: "push", label: "Push", icon: "fa-solid fa-arrow-up", hint: "" },
    forcePush: { action: "forcePush", label: "Force Push (with Lease)…", icon: "fa-solid fa-arrow-up", hint: "" },
    checkOutAsNew: {
        action: "checkOutAsNew",
        label: "Check Out as New Local Branch…",
        icon: "fa-solid fa-cloud",
        hint: "Create a local branch that tracks it"
    },
    deleteRemote: { action: "deleteRemote", label: "Delete from Remote…", icon: "fa-solid fa-trash", hint: "" }
}

/** Design H10 branch menu, without Compare with… of area 06. */
const ACTIONS_BY_KIND: Readonly<Record<"current" | BranchRef["kind"], readonly BranchMenuAction[]>> = {
    current: ["rename", "push", "setUpstream"],
    local: ["switch", "newBranch", "rename", "delete", "setUpstream", "push", "forcePush"],
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
        const disabledReason = isBusy ? WAITING_FOR_OPERATION : (worktreeReason ?? syncReasonOf(action, ref))
        return { ...ITEMS[action], disabledReason }
    })
}

function syncReasonOf(action: BranchMenuAction, ref: BranchRef): string | null {
    if (action === "push") {
        return pushReasonOf(ref.local)
    }
    return action === "forcePush" ? forcePushReasonOf(ref.local) : null
}
