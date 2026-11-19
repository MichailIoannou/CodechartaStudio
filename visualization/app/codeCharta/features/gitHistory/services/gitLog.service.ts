import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitLogFilter } from "../../../model/coreApi/GitLogFilter"
import type { GitLogPage } from "../../../model/coreApi/GitLogPage"
import type { GitLogScope } from "../../../model/coreApi/GitLogScope"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { GitResult } from "../model/gitError"
import { IDLE, LOADING, LoadState, readyValueOf } from "../model/loadState"
import { EMPTY_GRAPH_STATE, GraphLayoutState, GraphRow, layoutGraph, stateWaitingForHead } from "../util/graphLayout"
import { refLabelsByCommit } from "../util/refLabels"
import { GitApiService } from "./gitApi.service"
import { GitRepositoryService } from "./gitRepository.service"

const ALL_BRANCHES: GitLogScope = { kind: "all" }
const READY: LoadState<void> = { kind: "ready", value: undefined }

export interface CommitFilter {
    text: string
    author: string
    path: string
}

const NO_FILTER: CommitFilter = { text: "", author: "", path: "" }

interface LogQuery {
    repo: FolderRef
    scope: GitLogScope
    filter: GitLogFilter | null
    refsFingerprint: string
}

/** The commit history of the active repository, page by page, with its graph rows and what it is limited to. */
@Injectable({ providedIn: "root" })
export class GitLogService {
    private readonly api = inject(GitApiService)
    private readonly repository = inject(GitRepositoryService)

    private readonly scopeState = signal<GitLogScope>(ALL_BRANCHES)
    private readonly filterState = signal<CommitFilter>(NO_FILTER)
    private readonly commitsState = signal<readonly GitCommitSummary[]>([])
    private readonly graphRowsState = signal<readonly GraphRow[]>([])
    private readonly isGraphAvailableState = signal(true)
    private readonly pageState = signal<LoadState<void>>(IDLE)
    private readonly cursor = signal<string | null>(null)
    private layoutState: GraphLayoutState = EMPTY_GRAPH_STATE
    private generation = 0
    private isPageInFlight = false
    private hasReloadedExpiredSession = false

    readonly scope = this.scopeState.asReadonly()
    readonly scopedRefNames = computed<readonly string[]>(() => {
        const scope = this.scopeState()
        return scope.kind === "refs" ? scope.refNames : []
    })
    readonly filter = this.filterState.asReadonly()
    private readonly filterParam = computed(() => filterParamOf(this.filterState()), { equal: isSameJson })
    readonly isFiltered = computed(() => this.filterParam() !== null)
    readonly commits = this.commitsState.asReadonly()
    readonly isGraphAvailable = computed(() => this.isGraphAvailableState() && !this.isFiltered())
    readonly graphRows = computed(() => (this.isGraphAvailable() ? this.graphRowsState() : []))
    readonly page = this.pageState.asReadonly()
    readonly hasMore = computed(() => this.cursor() !== null)
    readonly isLoadingFirstPage = computed(() => this.pageState().kind === "loading" && this.commitsState().length === 0)
    readonly refLabels = computed(() => {
        const refs = readyValueOf(this.repository.refs())
        return refs ? refLabelsByCommit(refs) : new Map()
    })
    readonly headSha = computed(() => headShaOf(readyValueOf(this.repository.status())))
    /** The number of changed files while the list shows them as a first row on top of HEAD, else null. */
    readonly uncommittedChangeCount = computed(() => {
        const status = readyValueOf(this.repository.status())
        const count = status ? changedFileCount(status) : 0
        return count > 0 && !this.isFiltered() && this.headSha() !== null && isHeadInScope(this.scopeState(), status) ? count : null
    })
    private readonly graphStart = computed(() => (this.uncommittedChangeCount() === null ? null : this.headSha()))
    private readonly query = computed(() => this.queryOf(), { equal: isSameJson })

    constructor() {
        effect(() => {
            this.repository.activeRepository()
            this.scopeState.set(ALL_BRANCHES)
        })
        effect(() => {
            const query = this.query()
            untracked(() => void this.restart(query))
        })
        effect(() => {
            this.graphStart()
            untracked(() => this.layOutAgain())
        })
    }

    showAllBranches(): void {
        this.scopeState.set(ALL_BRANCHES)
    }

    /** Adding keeps the refs already scoped; a ref added twice leaves the scope again. */
    scopeTo(refName: string, { isAdded = false } = {}): void {
        const current = isAdded ? this.scopedRefNames() : []
        const refNames = current.includes(refName) ? current.filter(name => name !== refName) : [...current, refName]
        this.scopeState.set(refNames.length > 0 ? { kind: "refs", refNames } : ALL_BRANCHES)
    }

    setFilter(filter: CommitFilter): void {
        this.filterState.set(filter)
    }

    clearFilter(): void {
        this.filterState.set(NO_FILTER)
    }

    /** Also the retry of a failed page: a failed first page starts over, a later one asks again for the same page. */
    async loadNextPage(): Promise<void> {
        const query = this.query()
        const cursor = this.cursor()
        if (this.isPageInFlight || !query) {
            return
        }
        if (this.commitsState().length === 0 && this.pageState().kind === "failed") {
            return this.restart(query)
        }
        if (cursor !== null) {
            await this.requestPage(query, cursor, this.generation)
        }
    }

    async reload(): Promise<void> {
        await this.restart(this.query())
    }

    private queryOf(): LogQuery | null {
        const repo = this.repository.activeRepository()
        const refs = readyValueOf(this.repository.refs())
        if (!repo || !refs) {
            return null
        }
        return { repo, scope: this.scopeState(), filter: this.filterParam(), refsFingerprint: refs.fingerprint }
    }

    private async restart(query: LogQuery | null, { isSilent = false } = {}): Promise<void> {
        const generation = ++this.generation
        this.isPageInFlight = false
        this.cursor.set(null)
        if (!isSilent) {
            this.hasReloadedExpiredSession = false
            this.commitsState.set([])
            this.graphRowsState.set([])
        }
        this.pageState.set(query ? LOADING : IDLE)
        if (query) {
            await this.requestPage(query, null, generation)
        }
    }

    private async requestPage(query: LogQuery, cursor: string | null, generation: number): Promise<void> {
        this.isPageInFlight = true
        this.pageState.set(LOADING)
        const answer = await this.api.log({ repo: query.repo, scope: query.scope, filter: query.filter, cursor })
        if (generation !== this.generation) {
            return
        }
        this.isPageInFlight = false
        this.applyPage(query, cursor, answer)
    }

    private applyPage(query: LogQuery, cursor: string | null, answer: GitResult<GitLogPage>) {
        if ("error" in answer) {
            const isExpired = answer.error.code === "LOG_SESSION_EXPIRED" && cursor !== null
            if (isExpired && !this.hasReloadedExpiredSession) {
                this.hasReloadedExpiredSession = true
                void this.restart(query, { isSilent: true })
                return
            }
            this.pageState.set({ kind: "failed", error: answer.error })
            return
        }
        const page = answer.value
        if (cursor === null) {
            this.commitsState.set([])
            this.graphRowsState.set([])
            this.layoutState = this.initialLayoutState()
            this.isGraphAvailableState.set(page.isGraphAvailable)
        } else {
            this.hasReloadedExpiredSession = false
        }
        this.appendCommits(page.commits)
        this.cursor.set(page.nextCursor)
        this.pageState.set(READY)
    }

    private appendCommits(commits: readonly GitCommitSummary[]) {
        const { rows, state } = layoutGraph(commits, this.layoutState)
        this.layoutState = state
        this.commitsState.update(loaded => [...loaded, ...commits])
        this.graphRowsState.update(loaded => [...loaded, ...rows])
    }

    private layOutAgain() {
        const { rows, state } = layoutGraph(this.commitsState(), this.initialLayoutState())
        this.layoutState = state
        this.graphRowsState.set(rows)
    }

    private initialLayoutState(): GraphLayoutState {
        const headSha = this.graphStart()
        return headSha ? stateWaitingForHead(headSha) : EMPTY_GRAPH_STATE
    }
}

function filterParamOf(filter: CommitFilter): GitLogFilter | null {
    const text = filter.text.trim() || null
    const author = filter.author.trim() || null
    const path = normalisedPath(filter.path) || null
    return text || author || path ? { text, author, path } : null
}

/** The core takes a path relative to the repository root with `/` separators. */
function normalisedPath(path: string): string {
    return path
        .trim()
        .replaceAll("\\", "/")
        .replace(/^(\.\/|\/)+/, "")
}

function headShaOf(status: GitStatus | null): string | null {
    return status?.head.commit ?? null
}

function changedFileCount({ counts }: GitStatus): number {
    return counts.staged + counts.unstaged + counts.untracked + counts.conflicted
}

function isHeadInScope(scope: GitLogScope, status: GitStatus): boolean {
    if (scope.kind !== "refs") {
        return true
    }
    return status.head.kind === "branch" && scope.refNames.includes(`refs/heads/${status.head.name}`)
}

function isSameJson(first: unknown, second: unknown): boolean {
    return JSON.stringify(first) === JSON.stringify(second)
}
