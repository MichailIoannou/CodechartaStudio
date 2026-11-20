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
        { change: "renamed" as const, path: "src/b.ts", previousPath: "old.ts" }
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

    it("should set the git filter with node paths", async () => {
        // Arrange
        core.changedFilesAnswer = GIT_LIST
        await service.load(aResolvedComparison(), () => true)

        // Act
        service.setOnlyChangedFiles(true)

        // Assert
        expect(filter()).toEqual({ source: "git", paths: ["/root/src/a.ts", "/root/src/b.ts"] })
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
        expect(filter()).toEqual({ source: "git", paths: ["/root/src/a.ts", "/root/src/b.ts"] })
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

    it("should clear the filter when no comparison is shown", () => {
        // Arrange
        service.setOnlyChangedFiles(true)

        // Act
        TestBed.tick()

        // Assert
        expect(filter()).toBeNull()
    })
})
