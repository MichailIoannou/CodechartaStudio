import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import { GitLogService } from "./gitLog.service"
import { GitRepositoryService } from "./gitRepository.service"

describe("GitLogService", () => {
    const activeRepository = signal<FolderRef | null>({ projectId: "p-billing", folderId: "f-api" })

    function createService() {
        TestBed.configureTestingModule({ providers: [{ provide: GitRepositoryService, useValue: { activeRepository } }] })
        const service = TestBed.inject(GitLogService)
        TestBed.tick()
        return service
    }

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
        activeRepository.set({ projectId: "p-billing", folderId: "f-web" })
        TestBed.tick()

        // Assert
        expect(service.scope()).toEqual({ kind: "all" })
    })
})
