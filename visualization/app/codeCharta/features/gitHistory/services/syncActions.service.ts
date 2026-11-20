import { computed, Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitPullMode } from "../../../model/coreApi/GitPullMode"
import type { GitPushParams } from "../../../model/coreApi/GitPushParams"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { GitUpstream } from "../../../model/coreApi/GitUpstream"
import { shortSha } from "../../../util/wording"
import { ToastService } from "../../shared/facade"
import type { GitError, GitResult } from "../model/gitError"
import { readyValueOf } from "../model/loadState"
import { abortConfirmation, Divergence, forcePushConfirmation, publishResult, pullChoice, pullResult, pushResult } from "../util/effectText"
import { forcePushReasonOf, publishRemoteOf, pullReasonOf, pushReasonOf, remoteOfUpstream } from "../util/syncState"
import { BranchActionsService } from "./branchActions.service"
import { GitApiService } from "./gitApi.service"
import { GitConfirmationService } from "./gitConfirmation.service"
import { GitFailureReport, GitFollowUpHandlers } from "./gitFailureReport.service"
import { GitOperationKind, GitOperationService } from "./gitOperation.service"
import { GitRepositoryService } from "./gitRepository.service"

type PushTarget = Pick<GitPushParams, "remote" | "setUpstream" | "forceWithLeaseExpected">

/** Pull, push, publish, force push and abort (design H5, H6, H15): confirmations first, then the write, then a toast. */
@Injectable({ providedIn: "root" })
export class SyncActionsService {
    private readonly api = inject(GitApiService)
    private readonly repository = inject(GitRepositoryService)
    private readonly operations = inject(GitOperationService)
    private readonly confirmations = inject(GitConfirmationService)
    private readonly toast = inject(ToastService)
    private readonly failures = inject(GitFailureReport)
    private readonly branchActions = inject(BranchActionsService)
    private readonly refs = computed(() => readyValueOf(this.repository.refs()))

    readonly currentBranch = computed(() => this.refs()?.localBranches.find(branch => branch.isCurrent) ?? null)
    readonly remotes = computed(() => this.refs()?.remotes ?? [])

    /** Fast-forward only; diverged branches ask how to combine them first, as does a refused fast-forward. */
    async pull(): Promise<void> {
        const upstream = this.currentBranch()?.upstream
        if (pullReasonOf(this.currentBranch()) || !upstream) {
            return
        }
        if (isDiverged(upstream)) {
            await this.pullAfterChoice()
            return
        }
        const failure = await this.runPull("ffOnly")
        if (failure?.code === "NOT_FAST_FORWARD") {
            await this.pullAfterChoice()
        }
    }

    async push(branch = this.currentBranch()): Promise<void> {
        const upstream = branch?.upstream
        const remote = upstream ? remoteOfUpstream(upstream, this.remotes()) : null
        if (pushReasonOf(branch) || !remote) {
            return
        }
        if (await this.sendPush(branch, { remote, setUpstream: false, forceWithLeaseExpected: null })) {
            this.toast.show(pushResult(upstream.ahead ?? 0, upstream.name), "success")
        }
    }

    async publish(branch = this.currentBranch()): Promise<void> {
        const remote = publishRemoteOf(this.remotes())
        if (!branch || !remote) {
            return
        }
        if (await this.sendPush(branch, { remote, setUpstream: true, forceWithLeaseExpected: null })) {
            this.toast.show(publishResult(branch.name, remote), "success")
        }
    }

    /** The lease is the remote commit the confirmation names: the push fails if the remote moved since. */
    async forcePush(branch = this.currentBranch()): Promise<void> {
        const upstream = branch?.upstream
        const remoteBranch = this.refs()?.remoteBranches.find(candidate => candidate.refName === upstream?.refName)
        if (forcePushReasonOf(branch) || !remoteBranch) {
            return
        }
        const effect = {
            upstream: upstream.name,
            remoteSha: shortSha(remoteBranch.commit),
            branch: branch.name,
            localSha: shortSha(branch.commit)
        }
        if (!(await this.confirmations.ask(forcePushConfirmation({ ...effect, removed: upstream.behind ?? 0 })))) {
            return
        }
        const target = { remote: remoteBranch.remote, setUpstream: false, forceWithLeaseExpected: remoteBranch.commit }
        if (await this.sendPush(branch, target)) {
            this.toast.show(pushResult(upstream.ahead ?? 0, upstream.name), "success")
        }
    }

    async abort(): Promise<void> {
        const status = readyValueOf(this.repository.status())
        const operation = status?.operationInProgress
        if (operation !== "merge" && operation !== "rebase") {
            return
        }
        const branch = status.head.kind === "branch" ? status.head.name : null
        if (!(await this.confirmations.ask(abortConfirmation(operation, branch)))) {
            return
        }
        const result = await this.write("abort", (repo, operationId) => this.api.abortOperation({ repo, operation }, operationId))
        if (result && "error" in result) {
            this.failures.report(result.error)
        }
    }

    private async pullAfterChoice(): Promise<void> {
        const divergence = divergenceOf(await this.freshStatus())
        const mode = divergence ? await this.confirmations.choose(pullChoice(divergence)) : null
        if (mode) {
            await this.runPull(mode)
        }
    }

    /** The failure, so a refused fast-forward can lead to the choice; null after success or when nothing ran. */
    private async runPull(mode: GitPullMode): Promise<GitError | null> {
        const before = this.currentBranch()
        const result = await this.write("pull", (repo, operationId) => this.api.pull({ repo, mode }, operationId))
        if (result && "error" in result) {
            const leadsToChoice = mode === "ffOnly" && result.error.code === "NOT_FAST_FORWARD"
            if (!leadsToChoice) {
                await this.reportPullFailure(result.error)
            }
            return result.error
        }
        if (result?.ok) {
            this.toast.show(pullResult(await this.pulledCommits(before, result.value.status)), "success")
        }
        return null
    }

    /** Counted from the commits, since the counts before the pull may date from an older fetch. */
    private async pulledCommits(before: GitLocalBranch | null, after: GitStatus): Promise<number> {
        const repo = this.repository.activeRepository()
        const fallback = before?.upstream?.behind ?? 0
        if (!repo || !before || !after.head.commit || after.head.commit === before.commit) {
            return 0
        }
        const answer = await this.api.measureDistances(repo, after.head.commit, [before.commit])
        return answer.ok ? (answer.value.distances[0]?.onlyInTarget ?? fallback) : fallback
    }

    private async reportPullFailure(error: GitError): Promise<void> {
        const conflictedFiles = error.code === "CONFLICTS" ? (await this.freshStatus())?.counts.conflicted : undefined
        const branch = this.currentBranch()
        const remote = branch?.upstream ? remoteOfUpstream(branch.upstream, this.remotes()) : null
        this.failures.report(error, { operation: "pull", conflictedFiles, branch: branch?.name, remote }, this.followUps())
    }

    private async sendPush(branch: GitLocalBranch, target: PushTarget): Promise<boolean> {
        const result = await this.write("push", (repo, operationId) =>
            this.api.push({ repo, branchRefName: branch.refName, ...target }, operationId)
        )
        if (result && "error" in result) {
            this.failures.report(result.error, { branch: branch.name, remote: target.remote }, this.followUps())
        }
        return result?.ok === true
    }

    private followUps(): GitFollowUpHandlers {
        return {
            pull: () => void this.pull(),
            fetch: () => void this.branchActions.fetch(false),
            publish: () => void this.publish()
        }
    }

    /** Read past the cached status: right after a write the repository service may not have re-read it yet. */
    private async freshStatus(): Promise<GitStatus | null> {
        const repo = this.repository.activeRepository()
        const answer = repo ? await this.api.status(repo) : null
        return answer?.ok ? answer.value : null
    }

    private async write<Value>(
        kind: GitOperationKind,
        send: (repo: FolderRef, operationId: string) => Promise<GitResult<Value>>
    ): Promise<GitResult<Value> | null> {
        const repo = this.repository.activeRepository()
        return repo ? this.operations.run({ kind, repo, send: operationId => send(repo, operationId) }) : null
    }
}

function isDiverged(upstream: GitUpstream): boolean {
    return (upstream.ahead ?? 0) > 0 && (upstream.behind ?? 0) > 0
}

function divergenceOf(status: GitStatus | null): Divergence | null {
    const upstream = status?.upstream
    if (status?.head.kind !== "branch" || !upstream) {
        return null
    }
    return { branch: status.head.name, upstream: upstream.name, ahead: upstream.ahead, behind: upstream.behind }
}
