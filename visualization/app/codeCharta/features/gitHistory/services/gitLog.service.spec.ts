import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitLogPage } from "../../../model/coreApi/GitLogPage"
import type { GitLogParams } from "../../../model/coreApi/GitLogParams"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { GitResult } from "../model/gitError"
import { LOADING, LoadState } from "../model/loadState"
import { aLocalBranch, aLogCommit, aRefs, aStatusOn } from "./gitApi.mocks"
import { GitApiService } from "./gitApi.service"
import { GitLogService } from "./gitLog.service"
import { GitRepositoryService } from "./gitRepository.service"

const API: FolderRef = { projectId: "p-billing", folderId: "f-api" }
const WEB: FolderRef = { projectId: "p-billing", folderId: "f-web" }

interface PendingPage {
    params: GitLogParams
    resolve: (answer: GitResult<GitLogPage>) => void
}

function aPage(commits: GitCommitSummary[], nextCursor: string | null = null, isGraphAvailable = true): GitResult<GitLogPage> {
    return { ok: true, value: { commits, nextCursor, isGraphAvailable } }
}

function failed(code: "LOG_SESSION_EXPIRED" | "TIMEOUT"): GitResult<GitLogPage> {
    return { ok: false, error: { code, message: "No.", detail: null, repositoryPath: null } }
}

function readyOf<Value>(value: Value): LoadState<Value> {
    return { kind: "ready", value }
}

/** a ← b ← c on main, with d branching off a. */
const C = aLogCommit("c", "Third", ["b"])
const B = aLogCommit("b", "Second", ["a"])
const D = aLogCommit("d", "Side", ["a"])
const A = aLogCommit("a", "First")

describe("GitLogService", () => {
    const activeRepository = signal<FolderRef | null>(API)
    const refs = signal<LoadState<GitRefs>>(readyOf(aRefs()))
    const status = signal<LoadState<GitStatus>>(readyOf(aStatusOn("main", { head: { kind: "branch", name: "main", commit: C.sha } })))
    let pending: PendingPage[]

    function createService() {
        pending = []
        const api = {
            log: (params: GitLogParams) => new Promise<GitResult<GitLogPage>>(resolve => pending.push({ params, resolve }))
        }
        TestBed.configureTestingModule({
            providers: [
                { provide: GitRepositoryService, useValue: { activeRepository, refs, status } },
                { provide: GitApiService, useValue: api }
            ]
        })
        const service = TestBed.inject(GitLogService)
        TestBed.tick()
        return service
    }

    async function answer(index: number, page: GitResult<GitLogPage>) {
        pending[index].resolve(page)
        await new Promise(resolve => setTimeout(resolve))
        TestBed.tick()
    }

    beforeEach(() => {
        activeRepository.set(API)
        refs.set(readyOf(aRefs()))
        status.set(readyOf(aStatusOn("main", { head: { kind: "branch", name: "main", commit: C.sha } })))
    })

    describe("scope", () => {
        it("should show all branches at first", () => {
            // Arrange & Act
            const service = createService()

            // Assert
            expect(service.scope()).toEqual({ kind: "all" })
            expect(service.scopedRefNames()).toEqual([])
        })

        it("should scope to one ref and replace it with the next one", () => {
            // Arrange
            const service = createService()

            // Act
            service.scopeTo("refs/heads/main")
            service.scopeTo("refs/heads/feature/x")

            // Assert
            expect(service.scope()).toEqual({ kind: "refs", refNames: ["refs/heads/feature/x"] })
        })

        it("should add refs to the scope and drop one added again", () => {
            // Arrange
            const service = createService()
            service.scopeTo("refs/heads/main")

            // Act
            service.scopeTo("refs/tags/v1", { isAdded: true })
            service.scopeTo("refs/remotes/origin/main", { isAdded: true })
            service.scopeTo("refs/tags/v1", { isAdded: true })

            // Assert
            expect(service.scopedRefNames()).toEqual(["refs/heads/main", "refs/remotes/origin/main"])
        })

        it("should show all branches again when the only scoped ref is added again", () => {
            // Arrange
            const service = createService()
            service.scopeTo("refs/heads/main")

            // Act
            service.scopeTo("refs/heads/main", { isAdded: true })

            // Assert
            expect(service.scope()).toEqual({ kind: "all" })
        })

        it("should show all branches on request", () => {
            // Arrange
            const service = createService()
            service.scopeTo("refs/heads/main")

            // Act
            service.showAllBranches()

            // Assert
            expect(service.scope()).toEqual({ kind: "all" })
        })

        it("should show all branches of another repository", () => {
            // Arrange
            const service = createService()
            service.scopeTo("refs/heads/main")

            // Act
            activeRepository.set(WEB)
            TestBed.tick()

            // Assert
            expect(service.scope()).toEqual({ kind: "all" })
        })
    })

    describe("pages", () => {
        it("should load the first page on open", async () => {
            // Arrange
            const service = createService()

            // Act
            await answer(0, aPage([C, B], "cursor-1"))

            // Assert
            expect(pending[0].params).toEqual({ repo: API, scope: { kind: "all" }, filter: null, cursor: null })
            expect(service.commits()).toEqual([C, B])
            expect(service.hasMore()).toBe(true)
            expect(service.page().kind).toBe("ready")
        })

        it("should show the first page as loading while nothing is listed", () => {
            // Arrange & Act
            const service = createService()

            // Assert
            expect(service.isLoadingFirstPage()).toBe(true)
            expect(service.page()).toEqual(LOADING)
        })

        it("should load nothing without a repository or before the refs are read", () => {
            // Arrange
            refs.set(LOADING)

            // Act
            const service = createService()

            // Assert
            expect(pending).toHaveLength(0)
            expect(service.page().kind).toBe("idle")
        })

        it("should carry the graph state into the next page", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([C, D], "cursor-1"))

            // Act
            void service.loadNextPage()
            await answer(1, aPage([B, A]))

            // Assert
            expect(pending[1].params.cursor).toBe("cursor-1")
            expect(service.commits()).toEqual([C, D, B, A])
            expect(service.graphRows().map(row => row.lane)).toEqual([0, 1, 0, 0])
            expect(service.graphRows()[3].incoming).toHaveLength(2)
            expect(service.hasMore()).toBe(false)
        })

        it("should not request two pages at once", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([C], "cursor-1"))

            // Act
            void service.loadNextPage()
            void service.loadNextPage()

            // Assert
            expect(pending).toHaveLength(2)
        })

        it("should not request a page after the last one", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([C, B, A]))

            // Act
            await service.loadNextPage()

            // Assert
            expect(pending).toHaveLength(1)
        })

        it("should start over on a new scope and drop the late page of the old one", async () => {
            // Arrange
            const service = createService()

            // Act
            service.scopeTo("refs/heads/main")
            TestBed.tick()
            await answer(1, aPage([B, A]))
            await answer(0, aPage([C]))

            // Assert
            expect(pending[1].params.scope).toEqual({ kind: "refs", refNames: ["refs/heads/main"] })
            expect(service.commits()).toEqual([B, A])
        })

        it("should start over when the refs change", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([B, A]))

            // Act
            refs.set(readyOf(aRefs({ fingerprint: "fingerprint-2" })))
            TestBed.tick()
            await answer(1, aPage([C, B, A]))

            // Assert
            expect(service.commits()).toEqual([C, B, A])
        })

        it("should not start over when the refs are read again unchanged", async () => {
            // Arrange
            createService()
            await answer(0, aPage([B, A]))

            // Act
            refs.set(readyOf(aRefs()))
            TestBed.tick()

            // Assert
            expect(pending).toHaveLength(1)
        })

        it("should keep the failure of a page and ask again for it on retry", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([C], "cursor-1"))
            void service.loadNextPage()
            await answer(1, failed("TIMEOUT"))
            const failedPage = service.page()

            // Act
            void service.loadNextPage()

            // Assert
            expect(failedPage).toEqual({ kind: "failed", error: expect.objectContaining({ code: "TIMEOUT" }) })
            expect(service.commits()).toEqual([C])
            expect(pending[2].params.cursor).toBe("cursor-1")
        })

        it("should start over on retry after a failed first page", async () => {
            // Arrange
            const service = createService()
            await answer(0, failed("TIMEOUT"))

            // Act
            void service.loadNextPage()

            // Assert
            expect(pending[1].params.cursor).toBeNull()
        })

        it("should start over once, silently, when the log session expired", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([C], "cursor-1"))
            void service.loadNextPage()

            // Act
            await answer(1, failed("LOG_SESSION_EXPIRED"))

            // Assert
            expect(service.commits()).toEqual([C])
            expect(pending[2].params.cursor).toBeNull()
            await answer(2, aPage([C], "cursor-2"))
            void service.loadNextPage()
            await answer(3, failed("LOG_SESSION_EXPIRED"))
            void service.loadNextPage()
            await answer(4, failed("LOG_SESSION_EXPIRED"))
            expect(pending).toHaveLength(5)
            expect(service.page().kind).toBe("failed")
        })

        it("should start over on reload", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([C]))

            // Act
            void service.reload()

            // Assert
            expect(pending[1].params.cursor).toBeNull()
            expect(service.commits()).toEqual([])
        })
    })

    describe("filter", () => {
        it("should send the trimmed filter with a repository-relative path and hide the graph", async () => {
            // Arrange
            const service = createService()

            // Act
            service.setFilter({ text: " rounding ", author: "", path: ".\\src\\billing" })
            TestBed.tick()
            await answer(1, aPage([C], null, false))

            // Assert
            expect(pending[1].params.filter).toEqual({ text: "rounding", author: null, path: "src/billing" })
            expect(service.isFiltered()).toBe(true)
            expect(service.isGraphAvailable()).toBe(false)
            expect(service.graphRows()).toEqual([])
        })

        it("should not start over for a filter of only spaces", () => {
            // Arrange
            const service = createService()

            // Act
            service.setFilter({ text: "  ", author: "", path: "" })
            TestBed.tick()

            // Assert
            expect(pending).toHaveLength(1)
            expect(service.isFiltered()).toBe(false)
        })

        it("should start over without the filter when it is cleared", () => {
            // Arrange
            const service = createService()
            service.setFilter({ text: "x", author: "", path: "" })
            TestBed.tick()

            // Act
            service.clearFilter()
            TestBed.tick()

            // Assert
            expect(pending[2].params.filter).toBeNull()
        })
    })

    describe("uncommitted changes", () => {
        const dirty = aStatusOn("main", {
            head: { kind: "branch", name: "main", commit: B.sha },
            counts: { staged: 1, unstaged: 2, untracked: 1, conflicted: 0 }
        })

        it("should count the changed files and lead the graph from them into HEAD", async () => {
            // Arrange
            status.set(readyOf(dirty))
            const service = createService()

            // Act
            await answer(0, aPage([C, B, A]))

            // Assert
            expect(service.uncommittedChangeCount()).toBe(4)
            expect(service.headSha()).toBe(B.sha)
            expect(service.graphRows()[0].lane).toBe(1)
            expect(service.graphRows()[1].incoming).toContainEqual({ fromLane: 0, toLane: 0, color: -1 })
        })

        it("should lay the graph out again when the changes appear", async () => {
            // Arrange
            const service = createService()
            await answer(0, aPage([B, A]))

            // Act
            status.set(readyOf(dirty))
            TestBed.tick()

            // Assert
            expect(service.graphRows()[0].incoming).toEqual([{ fromLane: 0, toLane: 0, color: -1 }])
        })

        it("should not show them for a clean working tree, a filter or a scope without the current branch", () => {
            // Arrange
            const service = createService()
            const clean = service.uncommittedChangeCount()

            // Act
            status.set(readyOf(dirty))
            service.scopeTo("refs/heads/other")
            const otherScope = service.uncommittedChangeCount()
            service.scopeTo("refs/heads/main")
            const currentScope = service.uncommittedChangeCount()
            service.setFilter({ text: "x", author: "", path: "" })

            // Assert
            expect([clean, otherScope, currentScope, service.uncommittedChangeCount()]).toEqual([null, null, 4, null])
        })
    })

    it("should give the ref labels by commit", () => {
        // Arrange
        refs.set(readyOf(aRefs({ localBranches: [aLocalBranch("main", { commit: C.sha, isCurrent: true })] })))

        // Act
        const service = createService()

        // Assert
        expect(service.refLabels().get(C.sha)).toEqual([{ kind: "currentBranch", name: "main", refName: "refs/heads/main" }])
    })
})
