import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitDetails } from "../../../model/coreApi/GitCommitDetails"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitResult } from "../model/gitError"
import { CommitDetailsService } from "./commitDetails.service"
import { CommitSelectionService } from "./commitSelection.service"
import { aLogCommit } from "./gitApi.mocks"
import { GitApiService } from "./gitApi.service"
import { GitLogService } from "./gitLog.service"
import { GitRepositoryService } from "./gitRepository.service"

const API: FolderRef = { projectId: "p-billing", folderId: "f-api" }
const CHILD = aLogCommit("c", "Child", ["p"])
const PARENT = aLogCommit("p", "Parent")

function detailsOf(commit: GitCommitSummary): GitResult<GitCommitDetails> {
    const value = {
        ...commit,
        committerName: commit.authorName,
        committerEmail: commit.authorEmail,
        message: commit.subject,
        comparedToParent: commit.parents[0] ?? null,
        files: [],
        areFilesTruncated: false,
        totals: { filesChanged: 0, insertions: 0, deletions: 0 }
    }
    return { ok: true, value }
}

describe("CommitDetailsService", () => {
    let pending: { sha: string; resolve: (answer: GitResult<GitCommitDetails>) => void }[]
    const commits = signal<GitCommitSummary[]>([CHILD])
    const resolveCommit = jest.fn()

    function createService() {
        pending = []
        TestBed.configureTestingModule({
            providers: [
                { provide: GitRepositoryService, useValue: { activeRepository: signal(API) } },
                { provide: GitLogService, useValue: { commits } },
                {
                    provide: GitApiService,
                    useValue: {
                        commitDetails: (_repo: FolderRef, sha: string) => new Promise(resolve => pending.push({ sha, resolve })),
                        resolveCommit
                    }
                }
            ]
        })
        const service = TestBed.inject(CommitDetailsService)
        TestBed.tick()
        return { service, selection: TestBed.inject(CommitSelectionService) }
    }

    async function answer(index: number, details: GitResult<GitCommitDetails>) {
        pending[index].resolve(details)
        await new Promise(resolve => setTimeout(resolve))
    }

    it("should read nothing while nothing is selected", () => {
        // Arrange & Act
        const { service } = createService()

        // Assert
        expect(service.details()).toEqual({ kind: "idle" })
        expect(pending).toHaveLength(0)
    })

    it("should keep the latest answer when the selection changes fast", async () => {
        // Arrange
        const { service, selection } = createService()

        // Act
        selection.select({ kind: "commit", commit: CHILD })
        TestBed.tick()
        selection.select({ kind: "commit", commit: PARENT })
        TestBed.tick()
        await answer(1, detailsOf(PARENT))
        await answer(0, detailsOf(CHILD))

        // Assert
        expect(pending.map(request => request.sha)).toEqual([CHILD.sha, PARENT.sha])
        expect(service.details()).toEqual({ kind: "ready", value: expect.objectContaining({ sha: PARENT.sha }) })
    })

    it("should show a failure and read again on retry", async () => {
        // Arrange
        const { service, selection } = createService()
        selection.select({ kind: "commit", commit: CHILD })
        TestBed.tick()
        await answer(0, { ok: false, error: { code: "TIMEOUT", message: "Slow.", detail: null, repositoryPath: null } })
        const failed = service.details().kind

        // Act
        service.retry()
        await answer(1, detailsOf(CHILD))

        // Assert
        expect(failed).toBe("failed")
        expect(service.details().kind).toBe("ready")
    })

    it("should select a parent from the loaded list", async () => {
        // Arrange
        commits.set([CHILD, PARENT])
        const { service, selection } = createService()
        selection.select({ kind: "commit", commit: CHILD })

        // Act
        await service.selectCommit(PARENT.sha)

        // Assert
        expect(selection.selectedSha()).toBe(PARENT.sha)
        expect(resolveCommit).not.toHaveBeenCalled()
    })

    it("should resolve a parent the list has not loaded", async () => {
        // Arrange
        commits.set([CHILD])
        resolveCommit.mockResolvedValue({ ok: true, value: PARENT })
        const { service, selection } = createService()
        selection.select({ kind: "commit", commit: CHILD })

        // Act
        await service.selectCommit(PARENT.sha)

        // Assert
        expect(resolveCommit).toHaveBeenCalledWith(API, PARENT.sha)
        expect(selection.selectedSha()).toBe(PARENT.sha)
    })

    it("should keep the selection when a parent cannot be resolved", async () => {
        // Arrange
        commits.set([CHILD])
        resolveCommit.mockResolvedValue({
            ok: false,
            error: { code: "UNKNOWN_REVISION", message: "No.", detail: null, repositoryPath: null }
        })
        const { service, selection } = createService()
        selection.select({ kind: "commit", commit: CHILD })

        // Act
        await service.selectCommit(PARENT.sha)

        // Assert
        expect(selection.selectedSha()).toBe(CHILD.sha)
    })
})
