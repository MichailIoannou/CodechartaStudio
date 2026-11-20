import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitDetails } from "../../../model/coreApi/GitCommitDetails"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { shortSha } from "../../../util/wording"
import { ToastService } from "../../shared/facade"
import { readyValueOf } from "../model/loadState"
import { CommitDraftRepo, CommitMessage, EMPTY_MESSAGE } from "../repos/commitDraft.repo"
import { WAITING_FOR_OPERATION } from "../util/branchMenu"
import { amendPushedConfirmation, commitResult } from "../util/effectText"
import { GitApiService } from "./gitApi.service"
import { GitConfirmationService } from "./gitConfirmation.service"
import { GitFailureReport } from "./gitFailureReport.service"
import { GitOperationService } from "./gitOperation.service"
import { GitRepositoryService } from "./gitRepository.service"

/** Design H12: the commit message, kept per repository, amend, and the commit itself. */
@Injectable({ providedIn: "root" })
export class CommitMessageService {
    private readonly api = inject(GitApiService)
    private readonly repository = inject(GitRepositoryService)
    private readonly operations = inject(GitOperationService)
    private readonly confirmations = inject(GitConfirmationService)
    private readonly failures = inject(GitFailureReport)
    private readonly toast = inject(ToastService)
    private readonly drafts = inject(CommitDraftRepo)

    private readonly draft = signal<CommitMessage>(EMPTY_MESSAGE)
    /** The last commit's message while amending fills an empty box; the draft returns when amend is switched off. */
    private readonly amendMessage = signal<CommitMessage | null>(null)
    private readonly isAmendState = signal(false)
    private amendRequest = 0

    private readonly repositoryId = computed(() => readyValueOf(this.repository.repository())?.repositoryId ?? null)
    private readonly status = computed(() => readyValueOf(this.repository.status()))
    readonly message = computed(() => this.amendMessage() ?? this.draft())
    readonly isAmend = this.isAmendState.asReadonly()
    readonly isMerging = computed(() => this.status()?.operationInProgress === "merge")
    readonly disabledReason = computed<string | null>(() => {
        const counts = this.status()?.counts
        if (this.operations.isBusy()) {
            return WAITING_FOR_OPERATION
        }
        if ((counts?.conflicted ?? 0) > 0) {
            return "Resolve conflicts first"
        }
        if ((counts?.staged ?? 0) === 0 && !this.isAmendState() && !this.isMerging()) {
            return "Stage files to commit"
        }
        return this.message().subject.trim() === "" ? "Write a summary" : null
    })

    constructor() {
        effect(() => {
            const repositoryId = this.repositoryId()
            untracked(() => this.open(repositoryId))
        })
    }

    edit(change: Partial<CommitMessage>): void {
        const amendMessage = this.amendMessage()
        if (amendMessage) {
            this.amendMessage.set({ ...amendMessage, ...change })
        } else {
            this.saveDraft({ ...this.draft(), ...change })
        }
    }

    async setAmend(isAmend: boolean): Promise<void> {
        const request = ++this.amendRequest
        this.isAmendState.set(isAmend)
        this.amendMessage.set(null)
        if (!isAmend || !isEmpty(this.draft())) {
            return
        }
        const last = await this.lastCommit()
        if (last && request === this.amendRequest) {
            this.amendMessage.set(messageOf(last.message))
        }
    }

    async commit(): Promise<void> {
        const repo = this.repository.activeRepository()
        if (!repo || this.disabledReason() !== null) {
            return
        }
        const amend = this.isAmendState()
        if (amend && !(await this.confirmAmendOfPushed(repo))) {
            return
        }
        const { subject, body } = this.message()
        const result = await this.operations.run({
            kind: "commit",
            repo,
            send: operationId => this.api.commit({ repo, subject: subject.trim(), body, amend }, operationId)
        })
        if (!result) {
            return
        }
        if ("error" in result) {
            this.failures.report(result.error, { operation: "commit" })
            return
        }
        this.toast.show(commitResult(shortSha(headCommitOf(result.value.status) ?? "")), "success")
        this.clear()
    }

    /** Design H15: only when the upstream already has the commit being replaced. */
    private async confirmAmendOfPushed(repo: FolderRef): Promise<boolean> {
        const upstream = this.status()?.upstream
        const head = headCommitOf(this.status())
        const remote = readyValueOf(this.repository.refs())?.remoteBranches.find(branch => branch.refName === upstream?.refName)
        if (!upstream || upstream.isGone || !head || !remote) {
            return true
        }
        const answer = await this.api.isAncestor({ repo, ancestor: head, descendant: remote.commit })
        if ("error" in answer || !answer.value) {
            return true
        }
        const subject = (await this.lastCommit())?.subject ?? ""
        return this.confirmations.ask(amendPushedConfirmation({ shortSha: shortSha(head), subject, upstream: upstream.name }))
    }

    private async lastCommit(): Promise<GitCommitDetails | null> {
        const repo = this.repository.activeRepository()
        const head = headCommitOf(this.status())
        if (!repo || !head) {
            return null
        }
        const answer = await this.api.commitDetails(repo, head)
        return "error" in answer ? null : answer.value
    }

    private saveDraft(message: CommitMessage) {
        this.draft.set(message)
        const repositoryId = this.repositoryId()
        if (repositoryId) {
            this.drafts.write(repositoryId, message)
        }
    }

    private clear() {
        this.saveDraft(EMPTY_MESSAGE)
        this.resetAmend()
    }

    private open(repositoryId: string | null) {
        this.draft.set(repositoryId ? this.drafts.read(repositoryId) : EMPTY_MESSAGE)
        this.resetAmend()
    }

    private resetAmend() {
        ++this.amendRequest
        this.isAmendState.set(false)
        this.amendMessage.set(null)
    }
}

function headCommitOf(status: GitStatus | null | undefined): string | null {
    return status?.head.commit ?? null
}

function isEmpty({ subject, body }: CommitMessage): boolean {
    return subject.trim() === "" && body.trim() === ""
}

/** git's message is the subject, a blank line and the body. */
function messageOf(message: string): CommitMessage {
    const [subject, ...rest] = message.split("\n")
    return { subject, body: rest.join("\n").replace(/^\n+/, "") }
}
