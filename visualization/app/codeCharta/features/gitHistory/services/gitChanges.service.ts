import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitDiff } from "../../../model/coreApi/GitDiff"
import type { GitWorkingTree } from "../../../model/coreApi/GitWorkingTree"
import { ChangeRow, changeGroupsOf, discardEntryOf, isDiscardable, isStageable } from "../model/changeRows"
import type { GitResult } from "../model/gitError"
import { IDLE, LOADING, LoadState, loadStateOf, readyValueOf } from "../model/loadState"
import { discardConfirmation } from "../util/effectText"
import { GitApiService } from "./gitApi.service"
import { GitConfirmationService } from "./gitConfirmation.service"
import { GitFailureReport } from "./gitFailureReport.service"
import { GitOperationKind, GitOperationService } from "./gitOperation.service"
import { GitRepositoryService } from "./gitRepository.service"
import { HistoryTabService } from "./historyTab.service"

/** The core takes at most this many paths or rows per request. */
export const MAX_ROWS_PER_REQUEST = 1000

export type RowSelectionMode = "only" | "toggle" | "range"

type WorkingTreeWrite = (repo: FolderRef, operationId: string) => Promise<GitResult<GitWorkingTree>>

/** The Changes tab: the working-tree listing, the selected rows, the diff of the one shown, and stage / unstage / discard. */
@Injectable({ providedIn: "root" })
export class GitChangesService {
    private readonly api = inject(GitApiService)
    private readonly repository = inject(GitRepositoryService)
    private readonly operations = inject(GitOperationService)
    private readonly confirmations = inject(GitConfirmationService)
    private readonly failures = inject(GitFailureReport)
    private readonly tabs = inject(HistoryTabService)

    private readonly workingTreeState = signal<LoadState<GitWorkingTree>>(IDLE)
    private readonly diffState = signal<LoadState<GitDiff>>(IDLE)
    private readonly selectedKeysState = signal<ReadonlySet<string>>(new Set())
    private readonly shownKey = signal<string | null>(null)
    private anchorKey: string | null = null
    /** Each read takes a ticket; an answer overtaken by a later read of the same part is dropped. */
    private readonly latestTicket = { workingTree: 0, diff: 0 }

    readonly workingTree = this.workingTreeState.asReadonly()
    readonly diff = this.diffState.asReadonly()
    readonly selectedKeys = this.selectedKeysState.asReadonly()
    readonly groups = computed(() => changeGroupsOf(readyValueOf(this.workingTreeState())?.entries ?? []))
    readonly rows = computed(() => this.groups().flatMap(group => group.rows))
    readonly shownRow = computed(() => this.rows().find(row => row.key === this.shownKey()) ?? null)
    readonly selectedRows = computed(() => this.rows().filter(row => this.selectedKeysState().has(row.key)))
    readonly isBusy = this.operations.isBusy

    constructor() {
        effect(() => {
            this.repository.activeRepository()
            untracked(() => this.forget())
        })
        effect(() => {
            const isRead = this.repository.status().kind === "ready" && this.tabs.tab() === "changes"
            if (isRead) {
                untracked(() => void this.reload())
            }
        })
    }

    async reload(): Promise<void> {
        const repo = this.repository.activeRepository()
        if (!repo) {
            return
        }
        const ticket = ++this.latestTicket.workingTree
        if (this.workingTreeState().kind !== "ready") {
            this.workingTreeState.set(LOADING)
        }
        const answer = await this.api.workingTree(repo)
        if (ticket === this.latestTicket.workingTree) {
            this.apply(loadStateOf(answer))
        }
    }

    select(key: string, mode: RowSelectionMode = "only"): void {
        this.selectedKeysState.set(this.selectionAfter(key, mode))
        if (mode !== "range") {
            this.anchorKey = key
        }
        this.show(key)
    }

    show(key: string): void {
        this.shownKey.set(key)
        void this.loadDiff(false)
    }

    retryDiff(): void {
        void this.loadDiff(false)
    }

    async stage(rows: readonly ChangeRow[]): Promise<void> {
        const paths = rows.filter(isStageable).map(row => row.entry.path)
        await this.writeInChunks("stage", paths, (repo, chunk, operationId) =>
            this.api.stage({ repo, target: { kind: "paths", paths: chunk } }, operationId)
        )
    }

    async stageAll(): Promise<void> {
        await this.write("stage", (repo, operationId) => this.api.stage({ repo, target: { kind: "all" } }, operationId))
    }

    async unstage(rows: readonly ChangeRow[]): Promise<void> {
        const paths = rows.filter(row => row.entry.kind === "staged").map(row => row.entry.path)
        await this.writeInChunks("unstage", paths, (repo, chunk, operationId) => this.api.unstage({ repo, paths: chunk }, operationId))
    }

    /** Sends exactly the rows the confirmation named. */
    async discard(rows: readonly ChangeRow[]): Promise<void> {
        const discardable = rows.filter(isDiscardable)
        if (discardable.length === 0 || !(await this.confirmations.ask(discardConfirmation(discardable.map(row => row.entry.path))))) {
            return
        }
        await this.writeInChunks("discard", discardable.map(discardEntryOf), (repo, chunk, operationId) =>
            this.api.discard({ repo, entries: chunk }, operationId)
        )
    }

    private async writeInChunks<Item>(
        kind: GitOperationKind,
        items: Item[],
        send: (repo: FolderRef, chunk: Item[], operationId: string) => Promise<GitResult<GitWorkingTree>>
    ): Promise<void> {
        if (items.length === 0) {
            return
        }
        const [firstChunk, ...laterChunks] = chunksOf(items)
        await this.write(kind, async (repo, operationId) => {
            let answer = await send(repo, firstChunk, operationId)
            for (const chunk of laterChunks) {
                if (!answer.ok) {
                    break
                }
                answer = await send(repo, chunk, operationId)
            }
            return answer
        })
    }

    private async write(kind: GitOperationKind, send: WorkingTreeWrite): Promise<void> {
        const repo = this.repository.activeRepository()
        if (!repo) {
            return
        }
        const result = await this.operations.run({ kind, repo, send: operationId => send(repo, operationId) })
        if (!result) {
            return
        }
        if ("error" in result) {
            this.failures.report(result.error)
        } else {
            ++this.latestTicket.workingTree
            this.apply({ kind: "ready", value: result.value })
        }
    }

    private apply(state: LoadState<GitWorkingTree>) {
        this.workingTreeState.set(state)
        const keys = new Set(this.rows().map(row => row.key))
        this.selectedKeysState.update(selected => new Set([...selected].filter(key => keys.has(key))))
        const shown = this.shownKey()
        if (shown === null) {
            return
        }
        const followed = keys.has(shown) ? shown : this.sameFileElsewhere(shown)
        this.shownKey.set(followed)
        if (followed === null) {
            this.forgetDiff()
        } else {
            void this.loadDiff(followed === shown)
        }
    }

    /** A staged or unstaged file moves to the other group; its diff follows it there. */
    private sameFileElsewhere(key: string): string | null {
        const path = key.slice(key.indexOf(":") + 1)
        return this.rows().find(row => row.entry.path === path)?.key ?? null
    }

    private async loadDiff(isQuiet: boolean): Promise<void> {
        const row = this.shownRow()
        const repo = this.repository.activeRepository()
        if (!row || !repo) {
            return
        }
        const ticket = ++this.latestTicket.diff
        if (!isQuiet) {
            this.diffState.set(LOADING)
        }
        const answer = await this.api.diffFile({ repo, path: row.entry.path, kind: row.entry.kind })
        if (ticket === this.latestTicket.diff) {
            this.diffState.set(loadStateOf(answer))
        }
    }

    private selectionAfter(key: string, mode: RowSelectionMode): ReadonlySet<string> {
        if (mode === "toggle") {
            const next = new Set(this.selectedKeysState())
            if (!next.delete(key)) {
                next.add(key)
            }
            return next
        }
        if (mode === "range") {
            return new Set(this.keysBetween(this.anchorKey ?? key, key))
        }
        return new Set([key])
    }

    private keysBetween(firstKey: string, secondKey: string): string[] {
        const keys = this.rows().map(row => row.key)
        const first = Math.max(0, keys.indexOf(firstKey))
        const second = keys.indexOf(secondKey)
        return keys.slice(Math.min(first, second), Math.max(first, second) + 1)
    }

    private forget() {
        ++this.latestTicket.workingTree
        this.workingTreeState.set(IDLE)
        this.selectedKeysState.set(new Set())
        this.shownKey.set(null)
        this.anchorKey = null
        this.forgetDiff()
    }

    private forgetDiff() {
        ++this.latestTicket.diff
        this.diffState.set(IDLE)
    }
}

function chunksOf<Item>(items: Item[]): Item[][] {
    const chunks: Item[][] = []
    for (let start = 0; start < items.length; start += MAX_ROWS_PER_REQUEST) {
        chunks.push(items.slice(start, start + MAX_ROWS_PER_REQUEST))
    }
    return chunks
}
