import { TestBed } from "@angular/core/testing"
import { State, StoreModule } from "@ngrx/store"
import { CcState } from "../../../model/codeCharta.model"
import { appReducers, setStateMiddleware } from "../../../stores/rootStore/store"
import { CORE_GATEWAY } from "../ports/compareGateways"
import { aResolvedComparison, FakeCoreGateway } from "../ports/compareGateways.mocks"
import { CompareStore } from "../stores/compare.store"
import { ChangedFilesService } from "./changedFiles.service"

const GIT_LIST = {
    source: "git" as const,
    files: [
        { change: "modified" as const, path: "src/a.ts", previousPath: null },
        { change: "renamed" as const, path: "src/b.ts", previousPath: "old.ts" },
        { change: "copied" as const, path: "src/c.ts", previousPath: "src/a.ts" }
    ]
}

describe("ChangedFilesService", () => {
    let service: ChangedFilesService
    let core: FakeCoreGateway
    let compareStore: CompareStore
    let state: State<CcState>

    beforeEach(() => {
        core = new FakeCoreGateway()
        TestBed.configureTestingModule({
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [{ provide: CORE_GATEWAY, useValue: core }]
        })
        service = TestBed.inject(ChangedFilesService)
        compareStore = TestBed.inject(CompareStore)
        state = TestBed.inject(State)
    })

    const filter = () => state.getValue().sharedView.changedFilesFilter
    const renames = () => state.getValue().fileRenames

    it("should hand the renames git listed to the map as node paths", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST

        // Act
        await service.load(aResolvedComparison(), () => true)

        // Assert
        expect(renames()).toEqual([{ from: "/root/old.ts", to: "/root/src/b.ts" }])
    })

    it("should keep the empty renames as they are when git cannot list the files", async () => {
        // Arrange
        const before = renames()

        // Act
        await service.load(aResolvedComparison(), () => true)

        // Assert
        expect(renames()).toBe(before)
    })

    it("should clear the filter and the renames of the comparison", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST
        await service.load(aResolvedComparison(), () => true)
        service.setOnlyChangedFiles(true)

        // Act
        service.clear()

        // Assert
        expect(filter()).toBeNull()
        expect(renames()).toEqual([])
    })

    it("should keep the empty renames as they are when there is nothing to clear", () => {
        // Arrange
        const before = renames()

        // Act
        service.clear()

        // Assert
        expect(renames()).toBe(before)
    })

    it("should set the git filter with node paths", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST
        await service.load(aResolvedComparison(), () => true)

        // Act
        service.setOnlyChangedFiles(true)

        // Assert
        expect(filter()).toEqual({ source: "git", paths: ["/root/src/a.ts", "/root/src/b.ts", "/root/src/c.ts"] })
    })

    it("should list changed files from metrics when a side has no commit", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST
        const resolved = aResolvedComparison()
        const workingTree = {
            ...resolved.head.requested,
            kind: "workingTree" as const,
            commit: null,
            shortCommit: null,
            snapshotId: "s-wt"
        }

        // Act
        await service.load({ ...resolved, head: { ...resolved.head, requested: workingTree } }, () => true)
        service.setOnlyChangedFiles(true)

        // Assert
        expect(core.changedFilesRequests).toEqual([])
        expect(compareStore.state().changedFiles).toEqual({ source: "unavailable", files: [] })
        expect(filter()).toEqual({ source: "metrics" })
    })

    it("should filter by metric changes while git cannot list the files", async () => {
        // Arrange
        await service.load(aResolvedComparison(), () => true)

        // Act
        service.setOnlyChangedFiles(true)

        // Assert
        expect(filter()).toEqual({ source: "metrics" })
    })

    it("should switch an active filter to the git list once it arrives", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST
        service.setOnlyChangedFiles(true)

        // Act
        await service.load(aResolvedComparison(), () => true)

        // Assert
        expect(filter()).toEqual({ source: "git", paths: ["/root/src/a.ts", "/root/src/b.ts", "/root/src/c.ts"] })
    })

    it("should drop a list that arrives for a comparison no longer current", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST

        // Act
        await service.load(aResolvedComparison(), () => false)

        // Assert
        expect(compareStore.state().changedFiles).toBe("loading")
    })

    it("should turn the filter off", () => {
        // Arrange
        service.setOnlyChangedFiles(true)

        // Act
        service.setOnlyChangedFiles(false)

        // Assert
        expect(filter()).toBeNull()
    })

    it("should clear the filter and the renames when no comparison is shown", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST
        await service.load(aResolvedComparison(), () => true)
        service.setOnlyChangedFiles(true)

        // Act
        TestBed.tick()

        // Assert
        expect(filter()).toBeNull()
        expect(renames()).toEqual([])
    })
})
