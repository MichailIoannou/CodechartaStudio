import { computed, DestroyRef, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitDistance } from "../../../model/coreApi/GitCommitDistance"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import type { GitRepositoryInfo } from "../../../model/coreApi/GitRepositoryInfo"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { RepositoryChanged } from "../../../model/coreApi/RepositoryChanged"
import { FolderGitStatus, GitProblem } from "../model/folderGitStatus"
import type { GitResult } from "../model/gitError"
import { IDLE, LOADING, LoadState, loadStateOf, readyValueOf } from "../model/loadState"
import { WORKING_FOLDER_SOURCE } from "../ports/workingFolderSource.port"
import { GitApiService } from "./gitApi.service"

export const FOCUS_REFRESH_THROTTLE_MS = 5000
export const RECENT_COMMIT_COUNT = 10

export type RefreshReason = "manual" | "focus" | "afterWrite"

interface OpenedFolder {
    ref: FolderRef
    /** A re-linked or reappeared folder keeps its id but needs reading again. */
    key: string
}

/** Git state of the working folder (the active repository), and the last known status of every other folder. */
@Injectable({ providedIn: "root" })
export class GitRepositoryService {
    private readonly api = inject(GitApiService)
    private readonly source = inject(WORKING_FOLDER_SOURCE)

    private readonly repositoryState = signal<LoadState<GitRepositoryInfo>>(IDLE)
    private readonly statusState = signal<LoadState<GitStatus>>(IDLE)
    private readonly refsState = signal<LoadState<GitRefs>>(IDLE)
    private readonly folderStatuses = signal<Record<string, GitStatus | GitProblem>>({})
    private readonly refreshCount = signal(0)
    /** Each read takes a ticket; an answer whose ticket was overtaken by a later read of the same part is dropped. */
    private readonly latestTicket = { repository: 0, status: 0, refs: 0 }
    private lastFocusRefreshAt = Number.NEGATIVE_INFINITY

    readonly activeProject = this.source.activeProject
    readonly workingFolder = this.source.workingFolder
    private readonly openedFolder = computed(() => openedFolderOf(this.activeProject()?.id, this.workingFolder()), {
        equal: (first, second) => first?.key === second?.key
    })
    readonly activeRepository = computed(() => this.openedFolder()?.ref ?? null)
    readonly repository = this.repositoryState.asReadonly()
    readonly status = this.statusState.asReadonly()
    readonly refs = this.refsState.asReadonly()
    readonly isRefreshing = computed(() => this.refreshCount() > 0)

    constructor() {
        effect(() => {
            const repo = this.activeRepository()
            untracked(() => this.open(repo))
        })
        const stopListening = this.api.onRepositoryChanged(change => this.applyChange(change))
        const refreshOnFocus = () => this.refresh("focus")
        globalThis.addEventListener("focus", refreshOnFocus)
        inject(DestroyRef).onDestroy(() => {
            stopListening()
            globalThis.removeEventListener("focus", refreshOnFocus)
        })
    }

    async refresh(reason: RefreshReason): Promise<void> {
        const repo = this.activeRepository()
        if (!repo || (reason === "focus" && !this.isFocusRefreshDue())) {
            return
        }
        this.refreshCount.update(count => count + 1)
        try {
            await (reason === "focus" && this.repositoryState().kind === "ready" ? this.refreshQuietly(repo) : this.readAll(repo))
        } finally {
            this.refreshCount.update(count => count - 1)
        }
    }

    statusOf(folder: FolderRef): FolderGitStatus {
        return this.folderStatuses()[keyOf(folder)]
    }

    async refreshFolders(folders: FolderRef[]): Promise<void> {
        await Promise.all(folders.map(async folder => this.rememberStatus(folder, await this.api.status(folder))))
    }

    async recentCommits(folder: FolderRef): Promise<GitCommitSummary[] | null> {
        const answer = await this.api.log({ repo: folder, scope: { kind: "head" }, filter: null, cursor: null })
        return "error" in answer ? null : answer.value.commits.slice(0, RECENT_COMMIT_COUNT)
    }

    /** `null` when the repository does not contain the candidate or git cannot answer. */
    async distanceOf(folder: FolderRef, target: string, candidate: string): Promise<GitCommitDistance | null> {
        const answer = await this.api.measureDistances(folder, target, [candidate])
        return answer.ok ? (answer.value.distances[0] ?? null) : null
    }

    private async open(repo: FolderRef | null): Promise<void> {
        const tickets = this.takeAllTickets()
        this.setAll(repo ? LOADING : IDLE)
        if (repo) {
            await this.readAll(repo, tickets)
        }
    }

    private async readAll(repo: FolderRef, tickets = this.takeAllTickets()): Promise<void> {
        const info = await this.api.repositoryInfo(repo)
        if (tickets.repository !== this.latestTicket.repository) {
            return
        }
        this.repositoryState.set(loadStateOf(info))
        if ("error" in info) {
            this.statusState.set({ kind: "failed", error: info.error })
            this.refsState.set({ kind: "failed", error: info.error })
        } else {
            await Promise.all([this.readStatus(repo, tickets.status), this.readRefs(repo, tickets.refs)])
        }
    }

    private async refreshQuietly(repo: FolderRef): Promise<void> {
        const refsTicket = ++this.latestTicket.refs
        const [fingerprint] = await Promise.all([this.api.refsFingerprint(repo), this.readStatus(repo)])
        const isRefsChanged = "error" in fingerprint || fingerprint.value !== readyValueOf(this.refsState())?.fingerprint
        if (isRefsChanged && refsTicket === this.latestTicket.refs) {
            await this.readRefs(repo, refsTicket)
        }
    }

    private async applyChange(change: RepositoryChanged): Promise<void> {
        const repo = this.activeRepository()
        if (!repo || keyOf(repo) !== keyOf(change.repo)) {
            return
        }
        const isStatusChanged = change.parts.includes("status") || change.parts.includes("workingTree")
        await Promise.all([
            isStatusChanged ? this.readStatus(repo) : Promise.resolve(),
            change.parts.includes("refs") ? this.readRefs(repo) : Promise.resolve()
        ])
    }

    private async readStatus(repo: FolderRef, ticket = ++this.latestTicket.status): Promise<void> {
        const status = await this.api.status(repo)
        if (ticket === this.latestTicket.status) {
            this.statusState.set(loadStateOf(status))
            this.rememberStatus(repo, status)
        }
    }

    private async readRefs(repo: FolderRef, ticket = ++this.latestTicket.refs): Promise<void> {
        const refs = await this.api.branches(repo)
        if (ticket === this.latestTicket.refs) {
            this.refsState.set(loadStateOf(refs))
        }
    }

    private rememberStatus(folder: FolderRef, answer: GitResult<GitStatus>) {
        const status = "error" in answer ? { problem: answer.error.message } : answer.value
        this.folderStatuses.update(statuses => ({ ...statuses, [keyOf(folder)]: status }))
    }

    private isFocusRefreshDue(): boolean {
        const now = Date.now()
        if (now - this.lastFocusRefreshAt < FOCUS_REFRESH_THROTTLE_MS) {
            return false
        }
        this.lastFocusRefreshAt = now
        return true
    }

    private takeAllTickets() {
        return { repository: ++this.latestTicket.repository, status: ++this.latestTicket.status, refs: ++this.latestTicket.refs }
    }

    private setAll(state: LoadState<never>) {
        this.repositoryState.set(state)
        this.statusState.set(state)
        this.refsState.set(state)
    }
}

function openedFolderOf(projectId: string | undefined, folder: { id: string; path: string; status: string } | null): OpenedFolder | null {
    if (!projectId || !folder) {
        return null
    }
    const ref = { projectId, folderId: folder.id }
    return { ref, key: `${keyOf(ref)}|${folder.path}|${folder.status}` }
}

function keyOf(folder: FolderRef): string {
    return `${folder.projectId}/${folder.folderId}`
}
