import { Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitAbortOperationParams } from "../../../model/coreApi/GitAbortOperationParams"
import type { GitBranchCreateParams } from "../../../model/coreApi/GitBranchCreateParams"
import type { GitBranchDeleteParams } from "../../../model/coreApi/GitBranchDeleteParams"
import type { GitBranchRenameParams } from "../../../model/coreApi/GitBranchRenameParams"
import type { GitCreateCommitParams } from "../../../model/coreApi/GitCreateCommitParams"
import type { GitDiffFileParams } from "../../../model/coreApi/GitDiffFileParams"
import type { GitDiscardParams } from "../../../model/coreApi/GitDiscardParams"
import type { GitFetchParams } from "../../../model/coreApi/GitFetchParams"
import type { GitIsAncestorParams } from "../../../model/coreApi/GitIsAncestorParams"
import type { GitLogParams } from "../../../model/coreApi/GitLogParams"
import type { GitPullParams } from "../../../model/coreApi/GitPullParams"
import type { GitPushParams } from "../../../model/coreApi/GitPushParams"
import type { GitSetUpstreamParams } from "../../../model/coreApi/GitSetUpstreamParams"
import type { GitStageParams } from "../../../model/coreApi/GitStageParams"
import type { GitSwitchParams } from "../../../model/coreApi/GitSwitchParams"
import type { GitUnstageParams } from "../../../model/coreApi/GitUnstageParams"
import type { ProgressParams } from "../../../model/coreApi/ProgressParams"
import type { PromptClosed } from "../../../model/coreApi/PromptClosed"
import type { PromptRequested } from "../../../model/coreApi/PromptRequested"
import type { RepositoryChanged } from "../../../model/coreApi/RepositoryChanged"
import type { BridgeMethod, BridgeParams, BridgeResult, DesktopEventName, DesktopEventPayload } from "../../../util/desktop/desktopBridge"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { GitResult, gitErrorFromThrown, gitErrorOf } from "../model/gitError"

type GitMethod = Extract<BridgeMethod, `git.${string}` | `prompt.${string}`>

const WITHOUT_BRIDGE = "Git is only available in the desktop app."

/** The only caller of the desktop bridge for `git.*` and `prompt.*`; it never keeps or logs what it passes on. */
@Injectable({ providedIn: "root" })
export class GitApiService {
    private readonly bridge = inject(DESKTOP_BRIDGE)

    repositoryInfo(repo: FolderRef) {
        return this.call("git.repositoryInfo", { repo })
    }

    status(repo: FolderRef) {
        return this.call("git.status", { repo })
    }

    branches(repo: FolderRef) {
        return this.call("git.branches", { repo })
    }

    refsFingerprint(repo: FolderRef) {
        return this.call("git.refsFingerprint", { repo })
    }

    log(params: GitLogParams) {
        return this.call("git.log", params)
    }

    commitDetails(repo: FolderRef, sha: string) {
        return this.call("git.commitDetails", { repo, sha })
    }

    resolveCommit(repo: FolderRef, revision: string) {
        return this.call("git.resolveCommit", { repo, revision })
    }

    measureDistances(repo: FolderRef, target: string, candidates: string[]) {
        return this.call("git.measureDistances", { repo, target, candidates })
    }

    fetch(params: GitFetchParams, operationId: string) {
        return this.call("git.fetch", params, operationId)
    }

    switchBranch(params: GitSwitchParams, operationId: string) {
        return this.call("git.switch", params, operationId)
    }

    createBranch(params: GitBranchCreateParams, operationId: string) {
        return this.call("git.branchCreate", params, operationId)
    }

    renameBranch(params: GitBranchRenameParams, operationId: string) {
        return this.call("git.branchRename", params, operationId)
    }

    deleteBranch(params: GitBranchDeleteParams, operationId: string) {
        return this.call("git.branchDelete", params, operationId)
    }

    setUpstream(params: GitSetUpstreamParams, operationId: string) {
        return this.call("git.setUpstream", params, operationId)
    }

    workingTree(repo: FolderRef) {
        return this.call("git.workingTree", { repo })
    }

    diffFile(params: GitDiffFileParams) {
        return this.call("git.diffFile", params)
    }

    stage(params: GitStageParams, operationId: string) {
        return this.call("git.stage", params, operationId)
    }

    unstage(params: GitUnstageParams, operationId: string) {
        return this.call("git.unstage", params, operationId)
    }

    discard(params: GitDiscardParams, operationId: string) {
        return this.call("git.discard", params, operationId)
    }

    commit(params: GitCreateCommitParams, operationId: string) {
        return this.call("git.commit", params, operationId)
    }

    pull(params: GitPullParams, operationId: string) {
        return this.call("git.pull", params, operationId)
    }

    push(params: GitPushParams, operationId: string) {
        return this.call("git.push", params, operationId)
    }

    abortOperation(params: GitAbortOperationParams, operationId: string) {
        return this.call("git.abortOperation", params, operationId)
    }

    isAncestor(params: GitIsAncestorParams) {
        return this.call("git.isAncestor", params)
    }

    answerPrompt(promptId: string, answer: string) {
        return this.call("prompt.answer", { promptId, answer })
    }

    cancelPrompt(promptId: string) {
        return this.call("prompt.cancel", { promptId })
    }

    async cancel(operationId: string): Promise<void> {
        await this.bridge?.cancel(operationId)
    }

    onRepositoryChanged(handler: (change: RepositoryChanged) => void): () => void {
        return this.listen("repository.changed", handler)
    }

    onPromptRequested(handler: (prompt: PromptRequested) => void): () => void {
        return this.listen("prompt.requested", handler)
    }

    onPromptClosed(handler: (closed: PromptClosed) => void): () => void {
        return this.listen("prompt.closed", handler)
    }

    onProgress(handler: (progress: ProgressParams) => void): () => void {
        return this.listen("core.progress", handler)
    }

    private listen<Event extends DesktopEventName>(event: Event, handler: (payload: DesktopEventPayload<Event>) => void): () => void {
        return this.bridge?.subscribe(event, handler) ?? (() => undefined)
    }

    private async call<Method extends GitMethod>(
        method: Method,
        params: BridgeParams<Method>,
        operationId?: string
    ): Promise<GitResult<BridgeResult<Method>>> {
        if (!this.bridge) {
            return { ok: false, error: gitErrorFromThrown(new Error(WITHOUT_BRIDGE)) }
        }
        try {
            const answer = await (operationId === undefined
                ? this.bridge.request(method, params)
                : this.bridge.request(method, params, { operationId }))
            return "error" in answer ? { ok: false, error: gitErrorOf(answer.error) } : answer
        } catch (thrown) {
            return { ok: false, error: gitErrorFromThrown(thrown) }
        }
    }
}
