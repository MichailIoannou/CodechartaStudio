import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { Action, State, Store, StoreModule } from "@ngrx/store"
import { TEST_FILE_DATA } from "../../../mocks/dataMocks"
import { CCFile, CcState, LayoutAlgorithm } from "../../../model/codeCharta.model"
import { FileSelectionState } from "../../../model/files/files"
import { addFile, setStandard } from "../../../stores/fileStore/store/files.actions"
import { layoutAlgorithmSelector } from "../../../stores/mapState/mapState.read.facade"
import { setLayoutAlgorithm } from "../../../stores/mapState/mapState.write.facade"
import { appReducers, setStateMiddleware } from "../../../stores/rootStore/store"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { ToastService } from "../../shared/facade"
import { CORE_GATEWAY, SNAPSHOT_GATEWAY } from "../ports/compareGateways"
import {
    aCommitSnapshot,
    aComparedCommit,
    aResolvedComparison,
    BASE_SHA,
    FakeCoreGateway,
    FakeSnapshotGateway,
    FOLDER,
    HEAD_SHA
} from "../ports/compareGateways.mocks"
import { CompareStore } from "../stores/compare.store"
import { CompareService } from "./compare.service"

const BASE_CHECKSUM = `checksum-${BASE_SHA.slice(0, 7)}`
const HEAD_CHECKSUM = `checksum-${HEAD_SHA.slice(0, 7)}`
const COMPARED_FOLDER = { ref: FOLDER, label: "billing-api" }

function aMap(fileName: string, checksum: string, rootName = "root"): CCFile {
    return {
        ...TEST_FILE_DATA,
        fileMeta: { ...TEST_FILE_DATA.fileMeta, fileName, fileChecksum: checksum },
        map: { ...TEST_FILE_DATA.map, name: rootName }
    }
}

describe("CompareService", () => {
    let service: CompareService
    let store: Store<CcState>
    let state: State<CcState>
    let snapshots: FakeSnapshotGateway
    let core: FakeCoreGateway
    let compareStore: CompareStore
    let dispatched: string[]
    let toast: jest.SpyInstance

    beforeEach(() => {
        snapshots = new FakeSnapshotGateway()
        core = new FakeCoreGateway()
        TestBed.configureTestingModule({
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [provideRouter([]), { provide: SNAPSHOT_GATEWAY, useValue: snapshots }, { provide: CORE_GATEWAY, useValue: core }]
        })
        store = TestBed.inject(Store)
        state = TestBed.inject(State)
        service = TestBed.inject(CompareService)
        compareStore = TestBed.inject(CompareStore)
        toast = jest.spyOn(TestBed.inject(ToastService), "show")
        dispatched = []
        const dispatch = store.dispatch.bind(store) as (action: Action) => void
        jest.spyOn(store, "dispatch").mockImplementation(((action: Action) => {
            dispatched.push(action.type)
            dispatch(action)
        }) as Store["dispatch"])
        loadMapsOnLoad([aMap("billing-api@9f8e7d6", BASE_CHECKSUM), aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])
    })

    function loadMapsOnLoad(maps: CCFile[]) {
        snapshots.beforeLoad = () => {
            for (const map of maps) {
                store.dispatch(addFile({ file: map }))
            }
            store.dispatch(setStandard({ files: maps }))
        }
    }

    function selectionByChecksum() {
        return Object.fromEntries(state.getValue().files.map(fileState => [fileState.file.fileMeta.fileChecksum, fileState.selectedAs]))
    }

    it("should dispatch setDelta with the base as reference and the head as comparison", async () => {
        // Act
        await service.compareInputs(COMPARED_FOLDER, "main", "feature/x")

        // Assert
        expect(core.intents).toEqual([{ kind: "commits", folder: FOLDER, a: "refs/heads/main", b: "refs/heads/feature/x" }])
        expect(selectionByChecksum()).toEqual({
            [BASE_CHECKSUM]: FileSelectionState.Reference,
            [HEAD_CHECKSUM]: FileSelectionState.Comparison
        })
        expect(compareStore.state().phase).toBe("active")
        expect(compareStore.isActive()).toBe(true)
    })

    it("should find the files by checksum when their names sort head first", async () => {
        // Arrange
        loadMapsOnLoad([aMap("z-base", BASE_CHECKSUM), aMap("a-head", HEAD_CHECKSUM)])

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(state.getValue().files.map(fileState => fileState.selectedAs)).toEqual([
            FileSelectionState.Comparison,
            FileSelectionState.Reference
        ])
    })

    it("should dispatch setDelta only after the pair is loaded", async () => {
        // Arrange
        const loadFiles = snapshots.beforeLoad
        snapshots.beforeLoad = () => {
            dispatched.push("loaded")
            loadFiles()
        }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        const setDeltaIndex = dispatched.findIndex(type => type === "SET_DELTA")
        expect(setDeltaIndex).toBeGreaterThan(dispatched.indexOf("loaded"))
        expect(snapshots.calls).toEqual(["loadPair s-9f8e7d6 s-a1b2c3d"])
    })

    it("should load only the head and report no differences when checksums are equal", async () => {
        // Arrange
        core.resolution = aResolvedComparison({
            preflight: { identicalChecksums: true, profilesDiffer: false, combinedBytes: 10, sizeVerdict: "ok" }
        })
        loadMapsOnLoad([aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(snapshots.calls).toEqual(["loadAlone s-a1b2c3d"])
        expect(compareStore.state().phase).toBe("noDifferences")
        expect(compareStore.isShowingNoDifferences()).toBe(true)
    })

    it("should report no differences when the loader kept only the head of two equal maps", async () => {
        // Arrange
        snapshots.pairLoad = { base: null, head: HEAD_CHECKSUM }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().phase).toBe("noDifferences")
        expect(compareStore.state().base?.checksum).toBe(HEAD_CHECKSUM)
    })

    it("should fail with rootMismatch and show the head alone when root names differ", async () => {
        // Arrange
        loadMapsOnLoad([aMap("billing-api@9f8e7d6", BASE_CHECKSUM, "other"), aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error?.kind).toBe("rootMismatch")
        expect(selectionByChecksum()).toEqual({ [HEAD_CHECKSUM]: FileSelectionState.Partial })
    })

    it("should fail with loadFailed when a map could not be read", async () => {
        // Arrange
        snapshots.pairLoad = { base: BASE_CHECKSUM, head: null }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error).toEqual({ kind: "loadFailed", message: "the analysis of a1b2c3d could not be read." })
    })

    it("should fail with loadFailed when the loaded maps are not in the store", async () => {
        // Arrange
        snapshots.beforeLoad = () => undefined

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error?.kind).toBe("loadFailed")
    })

    it("should stop on a same-commit status", async () => {
        // Arrange
        core.resolution = aResolvedComparison({ status: { kind: "sameCommit" } })

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: HEAD_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().phase).toBe("stopped")
        expect(snapshots.calls).toEqual([])
    })

    it("should ask for a decision when a side has no snapshot and go on with the nearest one", async () => {
        // Arrange
        const nearest = aCommitSnapshot("3c4d5e6".padEnd(40, "0"), BASE_CHECKSUM)
        core.resolution = aResolvedComparison({
            base: {
                requested: aComparedCommit(BASE_SHA),
                status: { status: "missing", nearest: { snapshot: nearest, relation: "ancestor", staleBy: 2, behind: 2, ahead: 0 } }
            }
        })
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        const phaseBefore = compareStore.state().phase

        // Act
        await service.continueWithShownSnapshots()

        // Assert
        expect(phaseBefore).toBe("needsDecision")
        expect(snapshots.calls).toEqual(["loadPair s-3c4d5e6 s-a1b2c3d"])
        expect(compareStore.state().base?.staleBy).toBe(2)
    })

    it("should stay undecided when a missing side has no nearest snapshot", async () => {
        // Arrange
        core.resolution = aResolvedComparison({
            head: { requested: aComparedCommit(HEAD_SHA), status: { status: "missing", nearest: null } }
        })
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Act
        await service.continueWithShownSnapshots()

        // Assert
        expect(compareStore.state().phase).toBe("needsDecision")
        expect(snapshots.calls).toEqual([])
    })

    it("should fail with refNotFound for an input the folder does not have", async () => {
        // Act
        await service.compareInputs(COMPARED_FOLDER, "nope", "feature/x")

        // Assert
        expect(compareStore.state().error).toEqual({ kind: "refNotFound", message: "", input: "nope", folderLabel: "billing-api" })
        expect(core.intents).toEqual([])
    })

    it("should tell a stopped core from other core errors", async () => {
        // Arrange
        core.resolution = new DesktopBridgeError({ code: "CORE_UNAVAILABLE", message: "down" })
        await service.start({ kind: "withParent", folder: FOLDER, commit: HEAD_SHA })
        const unavailable = compareStore.state().error?.kind
        core.resolution = new DesktopBridgeError({ code: "UNKNOWN_REVISION", message: "The commit has no parent to compare with." })

        // Act
        await service.start({ kind: "withParent", folder: FOLDER, commit: HEAD_SHA })

        // Assert
        expect(unavailable).toBe("coreUnavailable")
        expect(compareStore.state().error).toEqual({ kind: "coreError", message: "The commit has no parent to compare with." })
    })

    it("should fail with loadFailed when loading throws", async () => {
        // Arrange
        snapshots.beforeLoad = () => {
            throw new Error("disk full")
        }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error).toEqual({ kind: "loadFailed", message: "disk full" })
    })

    it("should ask the core with the commit on the map", async () => {
        // Arrange
        snapshots.commitOnMap = BASE_SHA
        const resolve = jest.spyOn(core, "resolve")

        // Act
        await service.start({ kind: "withCurrent", folder: FOLDER, commit: HEAD_SHA })

        // Assert
        expect(resolve).toHaveBeenCalledWith({ kind: "withCurrent", folder: FOLDER, commit: HEAD_SHA }, BASE_SHA)
    })

    it("should navigate to the metric view", async () => {
        // Arrange
        const navigate = jest.spyOn(TestBed.inject(Router), "navigateByUrl")

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(navigate).toHaveBeenCalledWith("/")
        expect(toast).not.toHaveBeenCalled()
    })

    it("should tell the user when the comparison leaves the domain view", async () => {
        // Arrange
        jest.spyOn(TestBed.inject(Router), "url", "get").mockReturnValue("/domain")

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(toast).toHaveBeenCalledWith("Compare runs in the metric view — the domain and dependency views show a single map.")
    })

    it("should switch a radial layout to the treemap and tell the user", async () => {
        // Arrange
        store.dispatch(setLayoutAlgorithm({ value: LayoutAlgorithm.RadialTreeMap }))

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(layoutAlgorithmSelector(state.getValue())).toBe(LayoutAlgorithm.SquarifiedTreeMap)
        expect(toast).toHaveBeenCalledWith("Switched to the treemap layout — the radial layouts show a single map.")
    })

    it("should drop a resolution that arrives after the user cancelled", async () => {
        // Arrange
        const started = service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Act
        service.cancel()
        await started

        // Assert
        expect(compareStore.state().phase).toBe("idle")
        expect(snapshots.calls).toEqual([])
    })

    describe("swap and exit", () => {
        beforeEach(async () => {
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        })

        it("should switch reference and comparison and swap the sides", () => {
            // Act
            service.swap()

            // Assert
            expect(selectionByChecksum()).toEqual({
                [BASE_CHECKSUM]: FileSelectionState.Comparison,
                [HEAD_CHECKSUM]: FileSelectionState.Reference
            })
            expect(compareStore.state().base?.checksum).toBe(HEAD_CHECKSUM)
            expect(compareStore.isActive()).toBe(true)
        })

        it("should not swap a comparison that is no longer shown", () => {
            // Arrange
            store.dispatch(setStandard({ files: [state.getValue().files[0].file] }))

            // Act
            service.swap()

            // Assert
            expect(compareStore.state().base?.checksum).toBe(BASE_CHECKSUM)
        })

        it("should select the head before removing the base when leaving", () => {
            // Arrange
            dispatched = []

            // Act
            service.exit()

            // Assert
            expect(dispatched).toEqual(["SET_STANDARD", "REMOVE_FILES"])
            expect(selectionByChecksum()).toEqual({ [HEAD_CHECKSUM]: FileSelectionState.Partial })
        })

        it("should clear the comparison when leaving", () => {
            // Act
            service.exit()

            // Assert
            expect(compareStore.state().phase).toBe("idle")
            expect(compareStore.isActive()).toBe(false)
        })

        it("should leave the maps alone when the comparison is no longer shown", () => {
            // Arrange
            store.dispatch(setStandard({ files: [state.getValue().files[0].file] }))
            dispatched = []

            // Act
            service.exit()

            // Assert
            expect(dispatched).toEqual([])
            expect(state.getValue().files).toHaveLength(2)
        })
    })
})
