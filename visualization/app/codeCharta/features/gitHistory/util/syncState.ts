import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitRemote } from "../../../model/coreApi/GitRemote"
import type { GitUpstream } from "../../../model/coreApi/GitUpstream"
import type { OperationInProgress } from "../../../model/coreApi/OperationInProgress"
import { counted } from "../../../util/wording"
import { OPERATION_NAMES } from "./operationNames"

export type SyncActionKind = "fetch" | "publish" | "pull" | "push"

/** Design H5: the one thing the main part of the sync button does for the branch now. */
export interface SyncAction {
    kind: SyncActionKind
    label: string
    icon: string
    title: string
    /** The counts shown next to the label; null hides one. */
    ahead: number | null
    behind: number | null
    disabledReason: string | null
}

export interface SyncContext {
    /** The checked-out local branch; null while HEAD is detached. */
    branch: GitLocalBranch | null
    remotes: readonly GitRemote[]
    /** What git is in the middle of; pull, push and publish wait until it is finished or aborted. */
    inProgress?: OperationInProgress | null
}

const PREFERRED_REMOTE = "origin"
const DETACHED = "HEAD is detached: switch to a branch first."
const NO_REMOTE = "This repository has no remote."
const NOTHING_TO_PUSH = "Nothing to push"
const NOTHING_TO_REPLACE = "Nothing on the remote would be replaced."
const REMOTE_REF_PREFIX = "refs/remotes/"

const FETCH: SyncAction = {
    kind: "fetch",
    label: "Fetch",
    icon: "fa-solid fa-rotate",
    title: "Fetch from all remotes",
    ahead: null,
    behind: null,
    disabledReason: null
}

/** First match wins, as the table of design H5 orders the branch states. */
export function mainSyncAction({ branch, remotes, inProgress = null }: SyncContext): SyncAction {
    const upstream = branch?.upstream ?? null
    if (!branch || inProgress) {
        return FETCH
    }
    if (!upstream) {
        return publishAction(branch, remotes)
    }
    if (upstream.isGone) {
        return { ...FETCH, title: goneText(upstream) }
    }
    const ahead = upstream.ahead ?? 0
    const behind = upstream.behind ?? 0
    if (behind > 0) {
        return pullAction(upstream, ahead, behind)
    }
    return ahead > 0 ? pushAction(upstream, ahead) : FETCH
}

export type SyncMenuAction = "fetch" | "fetchPrune" | "pull" | "push" | "publish" | "forcePush" | "setUpstream"

export interface SyncMenuItem {
    action: SyncMenuAction
    label: string
    icon: string
    hint: string
    /** Why the item cannot run now; it is then shown disabled with this as its hint. */
    disabledReason: string | null
}

/** Design H5's caret menu; Publish Branch only without upstream, the branch items only on a branch. */
export function syncMenuItems({ branch, remotes, inProgress = null }: SyncContext): SyncMenuItem[] {
    const isUnpublished = branch !== null && !branch.upstream
    const items: (SyncMenuItem | null)[] = [
        menuItem("fetch", "Fetch", "fa-solid fa-rotate", FETCH.title),
        menuItem("fetchPrune", "Fetch and Remove Deleted Branches", "fa-solid fa-rotate"),
        menuItem("pull", "Pull", "fa-solid fa-arrow-down", "", pullReasonOf(branch, inProgress)),
        menuItem("push", "Push", "fa-solid fa-arrow-up", "", pushReasonOf(branch, inProgress)),
        isUnpublished
            ? menuItem("publish", "Publish Branch", "fa-solid fa-cloud-arrow-up", "", publishReasonOf(remotes, inProgress))
            : null,
        menuItem("forcePush", "Force Push (with Lease)…", "fa-solid fa-arrow-up", "", forcePushReasonOf(branch, inProgress)),
        branch ? menuItem("setUpstream", "Set Upstream…", "fa-solid fa-link") : null
    ]
    return items.filter(item => item !== null)
}

function menuItem(action: SyncMenuAction, label: string, icon: string, hint = "", disabledReason: string | null = null): SyncMenuItem {
    return { action, label, icon, hint, disabledReason }
}

export function pullReasonOf(branch: GitLocalBranch | null, inProgress: OperationInProgress | null = null): string | null {
    return blockingReasonOf(branch, inProgress)
}

export function pushReasonOf(branch: GitLocalBranch | null, inProgress: OperationInProgress | null = null): string | null {
    return blockingReasonOf(branch, inProgress) ?? ((branch?.upstream?.ahead ?? 0) > 0 ? null : NOTHING_TO_PUSH)
}

export function forcePushReasonOf(branch: GitLocalBranch | null, inProgress: OperationInProgress | null = null): string | null {
    return blockingReasonOf(branch, inProgress) ?? ((branch?.upstream?.behind ?? 0) > 0 ? null : NOTHING_TO_REPLACE)
}

export function publishReasonOf(remotes: readonly GitRemote[], inProgress: OperationInProgress | null = null): string | null {
    return unfinishedReasonOf(inProgress) ?? (publishRemoteOf(remotes) ? null : NO_REMOTE)
}

/** Where a branch without upstream is published: origin when it exists, else the first remote. */
export function publishRemoteOf(remotes: readonly GitRemote[]): string | null {
    return remotes.find(remote => remote.name === PREFERRED_REMOTE)?.name ?? remotes[0]?.name ?? null
}

/** Remote names may contain "/", so the longest configured name the upstream starts with wins. */
export function remoteOfUpstream(upstream: GitUpstream, remotes: readonly GitRemote[]): string | null {
    const branchPath = upstream.refName.slice(REMOTE_REF_PREFIX.length)
    const matching = remotes.filter(remote => branchPath.startsWith(`${remote.name}/`))
    return matching.reduce<string | null>((longest, remote) => (remote.name.length > (longest?.length ?? 0) ? remote.name : longest), null)
}

/** Why no pull, push or force push can run at all; the counts of an older fetch may be stale, so git answers "Already up to date". */
export function blockingReasonOf(branch: GitLocalBranch | null, inProgress: OperationInProgress | null = null): string | null {
    return unfinishedReasonOf(inProgress) ?? trackingReasonOf(branch)
}

function unfinishedReasonOf(inProgress: OperationInProgress | null): string | null {
    return inProgress ? `Finish or abort the ${OPERATION_NAMES[inProgress]} first.` : null
}

function trackingReasonOf(branch: GitLocalBranch | null): string | null {
    if (!branch) {
        return DETACHED
    }
    if (!branch.upstream) {
        return `'${branch.name}' has no upstream branch.`
    }
    return branch.upstream.isGone ? goneText(branch.upstream) : null
}

function goneText(upstream: GitUpstream): string {
    return `${upstream.name} no longer exists — set another upstream in the menu`
}

function publishAction(branch: GitLocalBranch, remotes: readonly GitRemote[]): SyncAction {
    const remote = publishRemoteOf(remotes)
    return {
        ...FETCH,
        kind: "publish",
        label: "Publish",
        icon: "fa-solid fa-cloud-arrow-up",
        title: remote ? `Publish '${branch.name}' to ${remote} and track it` : NO_REMOTE,
        disabledReason: publishReasonOf(remotes)
    }
}

function pullAction(upstream: GitUpstream, ahead: number, behind: number): SyncAction {
    const isDiverged = ahead > 0
    const title = isDiverged
        ? "The branch has diverged: pull first, then push"
        : `Pull ${counted(behind, "commit")} from ${upstream.name} (fast-forward only)`
    return { ...FETCH, kind: "pull", label: "Pull", icon: "fa-solid fa-arrow-down", title, ahead: isDiverged ? ahead : null, behind }
}

function pushAction(upstream: GitUpstream, ahead: number): SyncAction {
    const title = `Push ${counted(ahead, "commit")} to ${upstream.name}`
    return { ...FETCH, kind: "push", label: "Push", icon: "fa-solid fa-arrow-up", title, ahead, behind: null }
}
