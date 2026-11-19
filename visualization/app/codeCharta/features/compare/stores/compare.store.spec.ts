import { TestBed } from "@angular/core/testing"
import { State, Store, StoreModule } from "@ngrx/store"
import { TEST_FILE_DATA, TEST_FILE_DATA_JAVA } from "../../../mocks/dataMocks"
import { CcState, LayoutAlgorithm } from "../../../model/codeCharta.model"
import { FileSelectionState } from "../../../model/files/files"
import { addFile, setStandard } from "../../../stores/fileStore/store/files.actions"
import { layoutAlgorithmSelector } from "../../../stores/mapState/mapState.read.facade"
import { appReducers, setStateMiddleware } from "../../../stores/rootStore/store"
import { LoadedSide } from "../model/compare.model"
import { aCommitSnapshot, aComparedCommit, BASE_SHA, HEAD_SHA } from "../ports/compareGateways.mocks"
import { CompareReadStore } from "./compare.read.store"
import { CompareStore } from "./compare.store"
import { CompareWriteStore } from "./compare.write.store"

function aLoadedSide(sha: string, checksum: string): LoadedSide {
    return { requested: aComparedCommit(sha), snapshot: aCommitSnapshot(sha, checksum), relation: null, staleBy: 0, checksum }
}

describe("CompareStore", () => {
    let store: Store<CcState>
    let state: State<CcState>
    let compareStore: CompareStore
    let writeStore: CompareWriteStore
    const baseChecksum = TEST_FILE_DATA.fileMeta.fileChecksum
    const headChecksum = TEST_FILE_DATA_JAVA.fileMeta.fileChecksum

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })] })
        store = TestBed.inject(Store)
        state = TestBed.inject(State)
        store.dispatch(addFile({ file: TEST_FILE_DATA }))
        store.dispatch(addFile({ file: TEST_FILE_DATA_JAVA }))
        compareStore = TestBed.inject(CompareStore)
        writeStore = TestBed.inject(CompareWriteStore)
    })

    function compareTheTwoFiles() {
        writeStore.setDelta(TEST_FILE_DATA, TEST_FILE_DATA_JAVA)
        compareStore.set({
            phase: "active",
            resolved: null,
            base: aLoadedSide(BASE_SHA, baseChecksum),
            head: aLoadedSide(HEAD_SHA, headChecksum),
            error: null
        })
    }

    it("should be active while the store selects the compared pair", () => {
        // Act
        compareTheTwoFiles()

        // Assert
        expect(compareStore.isActive()).toBe(true)
    })

    it("should be inactive when the selected checksums no longer match the comparison", () => {
        // Arrange
        compareTheTwoFiles()

        // Act
        writeStore.switchReferenceAndComparison()

        // Assert
        expect(compareStore.isActive()).toBe(false)
    })

    it("should show no differences only while the head is loaded", () => {
        // Arrange
        compareStore.update({ phase: "noDifferences", head: aLoadedSide(HEAD_SHA, headChecksum) })
        const isShownWhileLoaded = compareStore.isShowingNoDifferences()

        // Act
        writeStore.showAlone(TEST_FILE_DATA, [TEST_FILE_DATA_JAVA.fileMeta.fileName])

        // Assert
        expect(isShownWhileLoaded).toBe(true)
        expect(compareStore.isShowingNoDifferences()).toBe(false)
    })

    it("should select the kept file before removing the others", () => {
        // Arrange
        compareTheTwoFiles()

        // Act
        writeStore.showAlone(TEST_FILE_DATA_JAVA, [TEST_FILE_DATA.fileMeta.fileName])

        // Assert
        expect(state.getValue().files).toEqual([{ file: TEST_FILE_DATA_JAVA, selectedAs: FileSelectionState.Partial }])
    })

    it("should keep every file when nothing is to be removed", () => {
        // Act
        writeStore.showAlone(TEST_FILE_DATA, [])

        // Assert
        expect(state.getValue().files).toHaveLength(2)
    })

    it("should switch to the treemap layout", () => {
        // Act
        writeStore.useTreemapLayout()

        // Assert
        expect(layoutAlgorithmSelector(state.getValue())).toBe(LayoutAlgorithm.SquarifiedTreeMap)
    })

    it("should find files by checksum and tell delta state", () => {
        // Arrange
        const readStore = TestBed.inject(CompareReadStore)
        store.dispatch(setStandard({ files: [TEST_FILE_DATA] }))
        const wasDelta = readStore.isDeltaState()

        // Act
        compareTheTwoFiles()

        // Assert
        expect(readStore.fileWithChecksum(headChecksum)).toBe(TEST_FILE_DATA_JAVA)
        expect(readStore.fileWithChecksum("unknown")).toBeUndefined()
        expect(wasDelta).toBe(false)
        expect(readStore.isDeltaState()).toBe(true)
    })

    it("should open the dialog with its prefill, close it and reset the comparison", () => {
        // Arrange
        compareTheTwoFiles()
        compareStore.openDialog({ head: "HEAD" })
        const prefill = compareStore.dialogPrefill()

        // Act
        compareStore.closeDialog()
        compareStore.reset()

        // Assert
        expect(prefill).toEqual({ head: "HEAD" })
        expect(compareStore.dialogPrefill()).toBeNull()
        expect(compareStore.state().phase).toBe("idle")
    })
})
