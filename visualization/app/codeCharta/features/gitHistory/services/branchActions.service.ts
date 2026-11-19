import { computed, Injectable, inject, signal } from "@angular/core"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitRemoteBranch } from "../../../model/coreApi/GitRemoteBranch"
import { shortSha } from "../../../util/wording"
import { ToastService } from "../../shared/facade"
import type { GitResult } from "../model/gitError"
import { readyValueOf } from "../model/loadState"
import {
    deleteLocalConfirmation,
    deleteRemoteConfirmation,
    deleteUnmergedConfirmation,
    fetchResult,
    quoted,
    switchConfirmation
} from "../util/effectText"
import type { GitErrorContext } from "../util/gitErrorText"
import { GitApiService } from "./gitApi.service"
import { GitConfirmationService } from "./gitConfirmation.service"
import { GitFailureReport } from "./gitFailureReport.service"
import { GitOperationKind, GitOperationService } from "./gitOperation.service"
import { GitRepositoryService } from "./gitRepository.service"

/** Design H14: the dialog a branch action needs before it can run. */
export type BranchDialogRequest =
    | { kind: "create"; startPoint: string; subject: string }
    | { kind: "rename"; branch: GitLocalBranch }
    | { kind: "setUpstream"; branch: GitLocalBranch }
    | { kind: "checkOutRemote"; remote: GitRemoteBranch }

export interface NewBranch {
    name: string
    startPoint: string
    checkout: boolean
}

interface Write<Value> {
    kind: GitOperationKind
    send: (repo: FolderRef, operationId: string) => Promise<GitResult<Value>>
    context: GitErrorContext
    /** A failure the caller answers itself instead of a toast. */
    handledCode?: ErrorCode
}

/** Fetch and the branch actions of the History: confirmations first, then the write, then a toast for the outcome. */
@Injectable({ providedIn: "root" })
export class BranchActionsService {
    private readonly api = inject(GitApiService)
    private readonly repository = inject(GitRepositoryService)
    private readonly operations = inject(GitOperationService)
    private readonly confirmations = inject(GitConfirmationService)
    private readonly toast = inject(ToastService)
    private readonly failures = inject(GitFailureReport)
    private readonly dialogRequest = signal<BranchDialogRequest | null>(null)

    readonly dialog = this.dialogRequest.asReadonly()
    readonly refs = computed(() => readyValueOf(this.repository.refs()))

    openDialog(request: BranchDialogRequest): void {
        this.dialogRequest.set(request)
    }

    closeDialog(): void {
        this.dialogRequest.set(null)
    }

    async fetch(prune: boolean): Promise<void> {
        const result = await this.write({
            kind: "fetch",
            send: (repo, operationId) => this.api.fetch({ repo, prune }, operationId),
            context: { remote: this.onlyRemote() }
        })
        if (result?.ok) {
            this.toast.show(fetchResult(result.value.updatedRefs), "success")
        }
    }

    async switchTo(branch: GitLocalBranch): Promise<void> {
        if (branch.isCurrent || !(await this.confirmSwitch(branch.name))) {
            return
        }
        await this.write({
            kind: "switch",
            send: (repo, operationId) => this.api.switchBranch({ repo, target: { kind: "local", refName: branch.refName } }, operationId),
            context: { branch: branch.name, worktreePath: branch.checkedOutInOtherWorktree }
        })
    }

    async checkOutRemote(remote: GitRemoteBranch, localName: string): Promise<void> {
        if (!(await this.confirmSwitch(localName))) {
            return
        }
        const target = { kind: "trackRemote" as const, remoteRefName: remote.refName, localName }
        await this.write({
            kind: "switch",
            send: (repo, operationId) => this.api.switchBranch({ repo, target }, operationId),
            context: { branch: localName }
        })
    }

    async createBranch({ name, startPoint, checkout }: NewBranch): Promise<void> {
        if (checkout && !(await this.confirmSwitch(name))) {
            return
        }
        await this.write({
            kind: "createBranch",
            send: (repo, operationId) => this.api.createBranch({ repo, name, startPoint, checkout }, operationId),
            context: { branch: name }
        })
    }

    async renameBranch(branch: GitLocalBranch, newName: string): Promise<void> {
        await this.write({
            kind: "renameBranch",
            send: (repo, operationId) => this.api.renameBranch({ repo, refName: branch.refName, newName }, operationId),
            context: { branch: newName }
        })
    }

    async setUpstream(branch: GitLocalBranch, upstreamRefName: string | null): Promise<void> {
        await this.write({
            kind: "setUpstream",
            send: (repo, operationId) => this.api.setUpstream({ repo, refName: branch.refName, upstreamRefName }, operationId),
            context: { branch: branch.name }
        })
    }

    async deleteLocal(branch: GitLocalBranch): Promise<void> {
        const keptBy = this.mergeTargetOf(branch)
        if (!(await this.confirmations.ask(deleteLocalConfirmation(branch.name, keptBy?.name ?? null)))) {
            return
        }
        const result = await this.deleteLocalBranch(branch, false)
        if (result && "error" in result && result.error.code === "BRANCH_NOT_FULLY_MERGED" && (await this.confirmUnmerged(branch))) {
            await this.deleteLocalBranch(branch, true)
        }
    }

    async deleteRemote(remote: GitRemoteBranch): Promise<void> {
        if (!(await this.confirmations.ask(deleteRemoteConfirmation(remote.branchName, remote.remote)))) {
            return
        }
        await this.write({
            kind: "deleteRemoteBranch",
            send: (repo, operationId) =>
                this.api.deleteBranch({ repo, target: { kind: "remote", remoteRefName: remote.refName } }, operationId),
            context: { branch: remote.name, remote: remote.remote }
        })
    }

    private deleteLocalBranch(branch: GitLocalBranch, force: boolean) {
        return this.write({
            kind: "deleteBranch",
            send: (repo, operationId) =>
                this.api.deleteBranch({ repo, target: { kind: "local", refName: branch.refName, force } }, operationId),
            context: { branch: branch.name, worktreePath: branch.checkedOutInOtherWorktree },
            handledCode: force ? undefined : "BRANCH_NOT_FULLY_MERGED"
        })
    }

    private async write<Value>(write: Write<Value>): Promise<GitResult<Value> | null> {
        const repo = this.repository.activeRepository()
        if (!repo) {
            return null
        }
        const result = await this.operations.run({ kind: write.kind, repo, send: operationId => write.send(repo, operationId) })
        if (result && "error" in result && result.error.code !== write.handledCode) {
            this.failures.report(result.error, write.context)
        }
        return result
    }

    /** Design H15: a clean switch runs at once; with changed files git may refuse, which the user hears first. */
    private confirmSwitch(to: string): Promise<boolean> {
        const status = readyValueOf(this.repository.status())
        const changedFiles = status ? Object.values(status.counts).reduce((sum, count) => sum + count, 0) : 0
        if (!status || changedFiles === 0) {
            return Promise.resolve(true)
        }
        const from = status.head.kind === "branch" ? quoted(status.head.name) : shortSha(status.head.commit)
        const folderLabel = this.repository.workingFolder()?.label ?? ""
        return this.confirmations.ask(switchConfirmation({ folderLabel, from, to, changedFiles }))
    }

    private async confirmUnmerged(branch: GitLocalBranch): Promise<boolean> {
        const into = this.mergeTargetOf(branch)
        const commits = into ? await this.countUnmerged(branch, into.commit) : null
        return this.confirmations.ask(deleteUnmergedConfirmation({ branch: branch.name, into: into?.name ?? "", commits }))
    }

    private async countUnmerged(branch: GitLocalBranch, intoCommit: string | null): Promise<number | null> {
        const repo = this.repository.activeRepository()
        if (!repo || !intoCommit) {
            return null
        }
        const answer = await this.api.measureDistances(repo, branch.commit, [intoCommit])
        return answer.ok ? (answer.value.distances[0]?.onlyInTarget ?? null) : null
    }

    /** What `git branch -d` checks the branch against: its upstream, else the current branch. */
    private mergeTargetOf(branch: GitLocalBranch): { name: string; commit: string | null } | null {
        const refs = this.refs()
        const upstream = branch.upstream && !branch.upstream.isGone ? branch.upstream : null
        if (upstream) {
            return { name: upstream.name, commit: refs?.remoteBranches.find(remote => remote.refName === upstream.refName)?.commit ?? null }
        }
        const head = refs?.head
        return head?.kind === "branch" ? { name: head.name, commit: head.commit } : null
    }

    /** The remote a fetch talks to, when there is exactly one. */
    private onlyRemote(): string | null {
        const remotes = this.refs()?.remotes ?? []
        return remotes.length === 1 ? remotes[0].name : null
    }
}
