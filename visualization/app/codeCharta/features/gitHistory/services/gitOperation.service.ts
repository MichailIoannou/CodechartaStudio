import { computed, Injectable, inject, signal } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { ProgressParams } from "../../../model/coreApi/ProgressParams"
import type { GitResult } from "../model/gitError"
import { GitApiService } from "./gitApi.service"
import { GitRepositoryService } from "./gitRepository.service"

type GitOperationKind = "fetch" | "switch" | "createBranch" | "renameBranch" | "deleteBranch" | "deleteRemoteBranch" | "setUpstream"

interface GitOperationProgress {
    message: string
    done: number | null
    total: number | null
}

export interface RunningGitOperation {
    repo: FolderRef
    kind: GitOperationKind
    operationId: string
    progress: GitOperationProgress | null
}

export interface GitOperationRequest<Value> {
    kind: GitOperationKind
    repo: FolderRef
    send(operationId: string): Promise<GitResult<Value>>
}

const NETWORK_OPERATIONS: ReadonlySet<GitOperationKind> = new Set(["fetch", "deleteRemoteBranch"])

/** Runs one git write at a time under a fresh operation id, with its progress, and re-reads the repository afterwards. */
@Injectable({ providedIn: "root" })
export class GitOperationService {
    private readonly api = inject(GitApiService)
    private readonly repository = inject(GitRepositoryService)
    private readonly runningState = signal<RunningGitOperation | null>(null)
    private operationCount = 0

    readonly running = this.runningState.asReadonly()
    readonly isBusy = computed(() => this.runningState() !== null)
    readonly isCancellable = computed(() => {
        const running = this.runningState()
        return running !== null && NETWORK_OPERATIONS.has(running.kind)
    })

    /** Null when nothing ran because another operation was running. */
    async run<Value>(request: GitOperationRequest<Value>): Promise<GitResult<Value> | null> {
        return this.runningState() ? null : this.send(request)
    }

    cancel(): void {
        const running = this.runningState()
        if (running) {
            void this.api.cancel(running.operationId)
        }
    }

    private async send<Value>(request: GitOperationRequest<Value>): Promise<GitResult<Value>> {
        this.operationCount += 1
        const operationId = `git-operation-${this.operationCount}`
        this.runningState.set({ repo: request.repo, kind: request.kind, operationId, progress: null })
        const stopTracking = this.api.onProgress(progress => this.track(operationId, progress))
        try {
            return await request.send(operationId)
        } finally {
            stopTracking()
            this.runningState.set(null)
            void this.repository.refresh("afterWrite")
        }
    }

    private track(operationId: string, { requestId, message, done, total }: ProgressParams) {
        const running = this.runningState()
        if (running?.operationId === requestId) {
            this.runningState.set({ ...running, progress: { message, done, total } })
        }
    }
}
