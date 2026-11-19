import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { SelectionItem } from "../model/commitSelection"
import { CommitSelectionService } from "./commitSelection.service"
import { aLogCommit, aStatusOn } from "./gitApi.mocks"
import { GitLogService } from "./gitLog.service"
import { GitRepositoryService } from "./gitRepository.service"

const API: FolderRef = { projectId: "p-billing", folderId: "f-api" }
const WEB: FolderRef = { projectId: "p-billing", folderId: "f-web" }
const NEWEST = aLogCommit("3", "Newest", ["2"])
const MIDDLE = aLogCommit("2", "Middle", ["1"])
const OLDEST = aLogCommit("1", "Oldest")
const DIRTY = aStatusOn("main", { counts: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 } })

function commitItem(commit: GitCommitSummary): SelectionItem {
    return { kind: "commit", commit }
}

function workingTreeItem(status: GitStatus = DIRTY): SelectionItem {
    return { kind: "workingTree", status }
}

describe("CommitSelectionService", () => {
    const activeRepository = signal<FolderRef | null>(API)
    const commits = signal<readonly GitCommitSummary[]>([NEWEST, MIDDLE, OLDEST])
    const hasMore = signal(false)
    const firstPageLoads = signal(1)
    const uncommittedChangeCount = signal<number | null>(3)
    const status = signal({ kind: "ready", value: DIRTY })

    function createService() {
        activeRepository.set(API)
        commits.set([NEWEST, MIDDLE, OLDEST])
        hasMore.set(false)
        firstPageLoads.set(1)
        uncommittedChangeCount.set(3)
        status.set({ kind: "ready", value: DIRTY })
        TestBed.configureTestingModule({
            providers: [
                { provide: GitRepositoryService, useValue: { activeRepository, status } },
                { provide: GitLogService, useValue: { commits, hasMore, firstPageLoads, uncommittedChangeCount } }
            ]
        })
        const service = TestBed.inject(CommitSelectionService)
        TestBed.tick()
        return service
    }

    it("should hold one item on click", () => {
        // Arrange
        const service = createService()

        // Act
        service.select(commitItem(MIDDLE))
        service.select(commitItem(OLDEST))

        // Assert
        expect(service.selection()).toEqual({ repo: API, items: [commitItem(OLDEST)] })
        expect(service.selectedSha()).toBe(OLDEST.sha)
        expect(service.focusedKey()).toBe(OLDEST.sha)
    })

    it("should add a second item on ctrl+click in list order, the working tree first, then the newest", () => {
        // Arrange
        const service = createService()

        // Act
        service.select(commitItem(OLDEST))
        service.extend(commitItem(NEWEST))
        const twoCommits = service.selection()?.items
        service.select(commitItem(MIDDLE))
        service.extend(workingTreeItem())

        // Assert
        expect(twoCommits).toEqual([commitItem(NEWEST), commitItem(OLDEST)])
        expect(service.selection()?.items).toEqual([workingTreeItem(), commitItem(MIDDLE)])
        expect(service.selectedSha()).toBeNull()
        expect(service.secondKey()).toBe("working-tree")
        expect(service.selectedKeys()).toEqual(new Set(["working-tree", MIDDLE.sha]))
    })

    it("should replace the second item on a third ctrl+click", () => {
        // Arrange
        const service = createService()
        service.select(commitItem(NEWEST))
        service.extend(commitItem(MIDDLE))

        // Act
        service.extend(commitItem(OLDEST))

        // Assert
        expect(service.selection()?.items).toEqual([commitItem(NEWEST), commitItem(OLDEST)])
        expect(service.secondKey()).toBe(OLDEST.sha)
    })

    it("should drop a selected item on ctrl+click while two are selected", () => {
        // Arrange
        const service = createService()
        service.select(commitItem(NEWEST))
        service.extend(commitItem(MIDDLE))

        // Act
        service.extend(commitItem(NEWEST))

        // Assert
        expect(service.selection()?.items).toEqual([commitItem(MIDDLE)])
        expect(service.secondKey()).toBeNull()
    })

    it("should set the second item from the keyboard and drop it again", () => {
        // Arrange
        const service = createService()
        service.select(commitItem(NEWEST))

        // Act
        service.setSecond(commitItem(MIDDLE))
        const withSecond = service.selection()?.items
        service.setSecond(commitItem(NEWEST))
        const backOnFirst = service.selection()?.items
        service.setSecond(commitItem(OLDEST))
        service.dropSecond()

        // Assert
        expect(withSecond).toEqual([commitItem(NEWEST), commitItem(MIDDLE)])
        expect(backOnFirst).toEqual([commitItem(NEWEST)])
        expect(service.selection()?.items).toEqual([commitItem(NEWEST)])
        expect(service.focusedKey()).toBe(NEWEST.sha)
    })

    it("should be cleared on a repository change", () => {
        // Arrange
        const service = createService()
        service.select(commitItem(NEWEST))
        service.extend(commitItem(OLDEST))

        // Act
        activeRepository.set(WEB)
        TestBed.tick()

        // Assert
        expect(service.selection()).toBeNull()
        expect(service.focusedKey()).toBeNull()
    })

    it("should keep the selection across a refresh when it is still listed", () => {
        // Arrange
        const service = createService()
        service.select(commitItem(NEWEST))
        service.extend(commitItem(OLDEST))
        const renamedNewest = { ...NEWEST, subject: "Newest, re-read" }

        // Act
        commits.set([renamedNewest, MIDDLE])
        firstPageLoads.set(2)
        TestBed.tick()

        // Assert
        expect(service.selection()?.items).toEqual([commitItem(renamedNewest)])
    })

    it("should keep an unlisted commit after a refresh while more pages may list it", () => {
        // Arrange
        const service = createService()
        service.select(commitItem(OLDEST))

        // Act
        commits.set([NEWEST])
        hasMore.set(true)
        firstPageLoads.set(2)
        TestBed.tick()

        // Assert
        expect(service.selection()?.items).toEqual([commitItem(OLDEST)])
    })

    it("should select the working tree with its status and follow the status while it stays dirty", () => {
        // Arrange
        const service = createService()
        const dirtier = aStatusOn("main", { counts: { staged: 1, unstaged: 3, untracked: 0, conflicted: 0 } })
        service.select(workingTreeItem())

        // Act
        status.set({ kind: "ready", value: dirtier })
        uncommittedChangeCount.set(4)
        TestBed.tick()
        const followed = service.selection()?.items
        uncommittedChangeCount.set(null)
        TestBed.tick()

        // Assert
        expect(followed).toEqual([workingTreeItem(dirtier)])
        expect(service.selection()).toBeNull()
    })

    it("should clear everything on request", () => {
        // Arrange
        const service = createService()
        service.select(workingTreeItem())

        // Act
        service.clear()

        // Assert
        expect(service.selection()).toBeNull()
    })
})
