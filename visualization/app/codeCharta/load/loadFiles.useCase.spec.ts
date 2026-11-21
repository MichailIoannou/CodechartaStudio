import { MockStore } from "@ngrx/store/testing"
import stringify from "safe-stable-stringify"
import { EDGE_METRIC_DATA, FILE_STATES, METRIC_DATA, TEST_DELTA_MAP_A, TEST_DELTA_MAP_B } from "../mocks/dataMocks"
import {
    CcState,
    DependencyLensSource,
    MapState,
    MetricsLensSource,
    Preferences,
    SharedView,
    SortingOption
} from "../model/codeCharta.model"
import { FileSelectionState } from "../model/files/files"
import { getCCFiles } from "../model/files/files.helper"
import { metricDataSelector } from "../renderer/renderModel/accumulatedData/metricData/metricData.selector"
import { defaultDependencyLensSource } from "../stores/dependencyLensSource/dependencyLensSource.read.facade"
import { setEdgeAttributeTypes } from "../stores/dependencyLensSource/dependencyLensSource.write.facade"
import { NO_FILES_LOADED_ERROR_MESSAGE } from "../stores/fileStore/fileStore.facade"
import { sampleFile1, sampleFile2 } from "../stores/fileStore/loaders/ccJson/sampleFiles"
import { LoadFileService } from "../stores/fileStore/loaders/ccJson/services/loadFile.service"
import { getNameDataPair } from "../stores/fileStore/loaders/ccJson/util/fileParser"
import { setCurrentFilesAreSampleFiles } from "../stores/fileStore/store/currentFilesAreSampleFiles/currentFilesAreSampleFiles.actions"
import { setDelta, setFiles } from "../stores/fileStore/store/files.actions"
import { filesLoaded } from "../stores/fileStore/store/filesLoaded/filesLoaded.actions"
import { setIsLoadingFile } from "../stores/fileStore/store/isLoadingFile/isLoadingFile.actions"
import { defaultMapState } from "../stores/mapState/mapState.read.facade"
import { setAreaMetric, setColorRange, setLayoutAlgorithm } from "../stores/mapState/mapState.write.facade"
import { defaultMetricsLensSource } from "../stores/metricsLensSource/metricsLensSource.read.facade"
import { setAttributeDescriptors, setAttributeTypes } from "../stores/metricsLensSource/metricsLensSource.write.facade"
import { defaultPreferences } from "../stores/preferences/preferences.read.facade"
import { setSortingOption } from "../stores/preferences/preferences.write.facade"
import { defaultState } from "../stores/rootStore/state.manager"
import { defaultSharedView } from "../stores/sharedView/sharedView.read.facade"
import { ErrorDialogService } from "../util/errorDialog/errorDialog.service"
import { fileRoot } from "../util/fileRoot"
import { LoadFilesUseCase } from "./loadFiles.useCase"
import { dispatchedTypes, loadFilesInputs, setUpLoadFilesUseCase } from "./loadFiles.useCase.testBed.mocks"
import { CcStatePersistence } from "./services/ccStatePersistence"

jest.mock("../stores/fileStore/loaders/ccJson/util/urlExtractor")
jest.mock("../model/files/files.helper")

const URL_LOAD_ERROR_TITLE = "File(s) could not be loaded from the given file URL parameter. Loaded sample files instead."
const INDEXED_DB_LOAD_ERROR_TITLE = "Previously loaded files and settings could not be restored. Loaded sample files instead."
// Never restored, so a persisted value would be counted as a difference that is not dispatched.
const TRANSIENT_SHARED_VIEW: Partial<SharedView> = {
    hoveredFileExtensions: defaultSharedView.hoveredFileExtensions,
    keptHighlightPaths: defaultSharedView.keptHighlightPaths
}

const MISSING_PROPERTIES_ERROR_TITLE =
    "The previous state could not be fully restored after loading the page. The following properties were not restored."

// Every boot frames its settings-restore with exactly two dispatches that are not settings:
// the loading indicator going up, and the single `filesLoaded` provenance signal of the commit.
const FRAMING_DISPATCH_COUNT = 2

describe("LoadFilesUseCase", () => {
    let store: MockStore
    let loadFileService: LoadFileService
    let loadFilesUseCase: LoadFilesUseCase
    let mockedErrorDialogService: ErrorDialogService
    let mockedCcStatePersistence: jest.Mocked<CcStatePersistence>
    let inputs: ReturnType<typeof loadFilesInputs>

    beforeEach(() => {
        const testBed = setUpLoadFilesUseCase()
        ;({ store, loadFileService, loadFilesUseCase } = testBed)
        mockedErrorDialogService = testBed.errorDialogService
        mockedCcStatePersistence = testBed.ccStatePersistence
        inputs = loadFilesInputs(testBed)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe("load files from query params", () => {
        it("should load files from query params when files query params contain valid file parameter and files are not saved in indexeddb", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            inputs.mockPersistedState(null)

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
        })

        it("should dispatch filesLoaded last when files are loaded from query params", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles([getNameDataPair(TEST_DELTA_MAP_A)])
            inputs.mockPersistedState(null)

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(dispatchedTypes(dispatchSpy)).toEqual([setIsLoadingFile.type, filesLoaded.type])
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: filesLoaded.type, source: "url", areSampleFiles: false, restoredSettings: null })
            )
        })

        it("should load sample files when load files from query params throws error", async () => {
            // Arrange
            inputs.mockUrlWithFile()
            inputs.mockUrlLoadError(new Error("files could not be loaded from query param"))

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
            expect(mockedErrorDialogService.open).toHaveBeenCalledWith({
                title: URL_LOAD_ERROR_TITLE,
                message: "Error (files could not be loaded from query param)"
            })
        })

        it("should not open an error dialog when no files were loaded at all", async () => {
            // Arrange
            inputs.mockUrlWithFile()
            inputs.mockUrlLoadError(new Error(NO_FILES_LOADED_ERROR_MESSAGE))

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
        })

        it("should read the persisted state exactly once when a url load falls back to sample files", async () => {
            // Arrange
            inputs.mockUrlWithFile()
            inputs.mockPersistedState(JSON.parse(stringify(defaultState)) as CcState)
            inputs.mockUrlLoadError(new Error("files could not be loaded from query param"))

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(mockedCcStatePersistence.read).toHaveBeenCalledTimes(1)
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
        })

        it("should not reject when applying a broken persisted state fails while loading sample files", async () => {
            // Arrange
            const brokenState = JSON.parse(stringify(defaultState)) as CcState
            brokenState.preferences = 42 as unknown as Preferences
            inputs.mockUrlWithFile()
            inputs.mockPersistedState(brokenState)
            inputs.mockUrlLoadError(new Error("files could not be loaded from query param"))

            // Act
            const loading = loadFilesUseCase.loadOnBoot()

            // Assert
            await expect(loading).resolves.toBeUndefined()
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
        })

        it("should dispatch currentFilesAreSampleFiles when query param currentFilesAreSampleFiles is true", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")
            inputs.mockUrlWithFile({ areSampleFiles: true })
            inputs.mockUrlFiles([getNameDataPair(TEST_DELTA_MAP_A)])

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(dispatchSpy).toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: true }))
        })

        it("should not dispatch currentFilesAreSampleFiles when query param currentFilesAreSampleFiles is not existent", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles([getNameDataPair(TEST_DELTA_MAP_A)])

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(dispatchSpy).not.toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: true }))
            expect(dispatchSpy).not.toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: false }))
        })

        it("should set currentFilesAreSampleFiles to true if sample files are loaded", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")
            inputs.mockUrlWithFile()
            inputs.mockUrlLoadError(new Error("files could not be loaded from query param"))

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(dispatchSpy).toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: true }))
        })

        it("should apply preferences and map state, then set files, then apply the remaining settings when files in query params and indexeddb are equal", async () => {
            // Arrange
            const AMOUNT_OF_TOP_LABELS = 600
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            const savedFileStates = [{ file: TEST_DELTA_MAP_A, selectedAs: FileSelectionState.Partial }]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = savedFileStates
            mockedState.mapState.amountOfTopLabels = AMOUNT_OF_TOP_LABELS
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert — restored files are already parsed and decorated, so they are set directly
            expect(loadFileService.loadFiles).not.toHaveBeenCalled()
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            // asserted as a plain action literal (not the setAmountOfTopLabels creator): amountOfTopLabels
            // now lives in the appearance module, which fileStore must not import (filestore-has-no-upward-deps)
            expect(dispatchSpy).toHaveBeenCalledWith({ type: "SET_AMOUNT_OF_TOP_LABELS", value: AMOUNT_OF_TOP_LABELS })
            expect(dispatchSpy).toHaveBeenCalledWith(setFiles({ value: mockedState.files }))
            // the persisted map state is applied BEFORE the files, and filesLoaded stays last
            expect(dispatchedTypes(dispatchSpy)).toEqual([
                setIsLoadingFile.type,
                "SET_AMOUNT_OF_TOP_LABELS",
                setFiles.type,
                filesLoaded.type
            ])
        })

        it("should apply settings and then set files when files in query params differ from files in indexeddb", async () => {
            // Arrange
            const AMOUNT_OF_TOP_LABELS = 600
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = [{ file: TEST_DELTA_MAP_B, selectedAs: FileSelectionState.Partial }]
            mockedState.mapState.amountOfTopLabels = AMOUNT_OF_TOP_LABELS
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            // all settings are applied BEFORE the url files are committed, and the persisted files are never set
            expect(dispatchedTypes(dispatchSpy)).toEqual([setIsLoadingFile.type, "SET_AMOUNT_OF_TOP_LABELS", filesLoaded.type])
        })

        it("should only dispatch the framing actions when the persisted settings equal the current ones and the files differ", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = [{ file: TEST_DELTA_MAP_B, selectedAs: FileSelectionState.Partial }]
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchedTypes(dispatchSpy)).toEqual([setIsLoadingFile.type, filesLoaded.type])
        })

        it("should set files to delta mode when 'mode=delta' parameter is given", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A), getNameDataPair(TEST_DELTA_MAP_B)]
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = [
                {
                    file: TEST_DELTA_MAP_A,
                    selectedAs: FileSelectionState.Reference
                },
                {
                    file: TEST_DELTA_MAP_B,
                    selectedAs: FileSelectionState.Comparison
                }
            ]
            inputs.mockUrlWithFile({ renderMode: "Delta" })
            inputs.mockUrlFiles(mockedNameDataPairs)
            inputs.mockPersistedState(defaultState)
            jest.mocked(getCCFiles).mockImplementation(() => mockedState.files.map(state => state.file))
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(setDelta({ referenceFile: TEST_DELTA_MAP_A, comparisonFile: TEST_DELTA_MAP_B }))
        })

        it("should set metrics from query params if metrics are part of url", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A), getNameDataPair(TEST_DELTA_MAP_B)]
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = [
                {
                    file: TEST_DELTA_MAP_A,
                    selectedAs: FileSelectionState.Reference
                },
                {
                    file: TEST_DELTA_MAP_B,
                    selectedAs: FileSelectionState.Comparison
                }
            ]
            inputs.mockUrlFiles(mockedNameDataPairs)
            inputs.mockPersistedState(defaultState)
            jest.mocked(getCCFiles).mockImplementation(() => mockedState.files.map(state => state.file))
            inputs.mockUrlWithFile({
                metrics: { areaMetric: "mcc", heightMetric: "rloc", colorMetric: "functions", edgeMetric: "pairing_rate" }
            })
            const dispatchSpy = jest.spyOn(store, "dispatch")
            store.overrideSelector(metricDataSelector, {
                nodeMetricData: METRIC_DATA,
                edgeMetricData: EDGE_METRIC_DATA,
                nodeEdgeMetricsMap: null
            })
            store.refreshState()

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert — the use-case carries the url metrics on the provenance; applying them is the
            // reconciliation's job, where the precedence rule (url > persisted > default) lives.
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "FILES_LOADED",
                    urlMetrics: { areaMetric: "mcc", heightMetric: "rloc", colorMetric: "functions", edgeMetric: "pairing_rate" }
                })
            )
        })
    })

    describe("load files from indexeddb", () => {
        it("should load files from indexeddb when query params do not contain file parameter", async () => {
            // Arrange
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = FILE_STATES
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            // restored files are already parsed and decorated, so they go straight into the store
            expect(loadFileService.loadFiles).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(setFiles({ value: FILE_STATES }))
            // The persisted view slices travel on the provenance; the reconciliation applies them AFTER
            // its file-derived merge, because persisted beats file-derived.
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: filesLoaded.type,
                    source: "indexedDB",
                    restoredSettings: expect.objectContaining({ sharedView: mockedState.sharedView })
                })
            )
        })

        it("should load sample-files when indexeddb is empty", async () => {
            // Arrange
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedState(null)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: filesLoaded.type, source: "sample", areSampleFiles: true, restoredSettings: null })
            )
        })

        it("should load sample files when load files from indexeddb throws error", async () => {
            // Arrange
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedReadError(new Error("Could not read cc-state"))

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
            expect(mockedErrorDialogService.open).toHaveBeenCalledWith({
                title: INDEXED_DB_LOAD_ERROR_TITLE,
                message: "Could not read cc-state"
            })
        })

        it("should set currentFilesAreSampleFiles to true if sample files are loaded", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedReadError(new Error("Could not read cc-state"))

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(dispatchSpy).toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: true }))
        })

        it("should not set currentFilesAreSampleFiles if files from indexeddb are loaded", async () => {
            // Arrange
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = FILE_STATES
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(dispatchSpy).not.toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: true }))
            expect(dispatchSpy).not.toHaveBeenCalledWith(setCurrentFilesAreSampleFiles({ value: false }))
        })

        it("should point the file root at the restored map", async () => {
            // Arrange — LoadFileService does this from the file it parses, and a restore no longer parses
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = FILE_STATES
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedState(mockedState)
            const updateRootSpy = jest.spyOn(fileRoot, "updateRoot")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert — the root path keys the domain words, the exclusions and every node lookup
            expect(updateRootSpy).toHaveBeenCalledWith(FILE_STATES[0].file.map.name)
            updateRootSpy.mockRestore()
        })

        it("should show an error dialog when the persisted state misses properties the current state has", async () => {
            // Arrange
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            delete (mockedState.preferences as Partial<Preferences>).screenshotToClipboardEnabled
            inputs.mockUrlWithoutFile()
            inputs.mockPersistedState(mockedState)

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(mockedErrorDialogService.open).toHaveBeenCalledWith({
                title: MISSING_PROPERTIES_ERROR_TITLE,
                message: expect.stringContaining("screenshotToClipboardEnabled")
            })
        })

        // Slice 15e removed the fileSettings applier: edges is the only member that was left and it is now a
        // derived dependency-lens selector, not stored state — so there is nothing to apply on load anymore.

        it("should set all differing sharedView", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.sharedView = { ...nullifyObjectValues(defaultSharedView), ...TRANSIENT_SHARED_VIEW } as SharedView
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledTimes(countDifferences(mockedState.sharedView, defaultSharedView) + FRAMING_DISPATCH_COUNT)
        })

        it("should set all differing preferences, restoring the sort option but never the sort order", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.preferences = nullifyObjectValues(defaultPreferences) as Preferences
            // sorting is applied as one object; give it a real value differing from the default so the
            // applier restores the option (setSortingOption) but never the order (a file-explorer UI pref)
            mockedState.preferences.sorting = { option: SortingOption.NUMBER_OF_FILES, orderAscending: false }
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            // the sorting pref dispatches exactly one action (setSortingOption) — the order is never
            // restored on load, so the total equals the differing-key count with no extra sort-order dispatch
            expect(dispatchSpy).toHaveBeenCalledWith(setSortingOption({ value: SortingOption.NUMBER_OF_FILES }))
            expect(dispatchSpy).toHaveBeenCalledTimes(
                countDifferences(mockedState.preferences, defaultPreferences) + FRAMING_DISPATCH_COUNT
            )
        })

        it("should set all differing mapState values", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            // Make EVERY mapState value differ from its default, so every key of the applier is exercised
            // (an unmapped key would hit the "Unhandled key" default and fail this test).
            mockedState.mapState = makeAllValuesDiffer(defaultMapState) as MapState
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(setAreaMetric({ value: mockedState.mapState.areaMetric }))
            expect(dispatchSpy).toHaveBeenCalledWith(setColorRange({ value: mockedState.mapState.colorRange }))
            expect(dispatchSpy).toHaveBeenCalledWith(setLayoutAlgorithm({ value: mockedState.mapState.layoutAlgorithm }))
            expect(dispatchSpy).toHaveBeenCalledTimes(countDifferences(mockedState.mapState, defaultMapState) + FRAMING_DISPATCH_COUNT)
        })

        it("should set all differing metricsLensSource values", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.metricsLensSource = {
                attributeTypes: { rloc: "absolute" },
                attributeDescriptors: { rloc: { title: "Real Lines of Code" } }
            } as unknown as MetricsLensSource
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(setAttributeTypes({ value: mockedState.metricsLensSource.attributeTypes }))
            expect(dispatchSpy).toHaveBeenCalledWith(setAttributeDescriptors({ value: mockedState.metricsLensSource.attributeDescriptors }))
            expect(dispatchSpy).toHaveBeenCalledTimes(
                countDifferences(mockedState.metricsLensSource, defaultMetricsLensSource) + FRAMING_DISPATCH_COUNT
            )
        })

        it("should set all differing dependencyLensSource values", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile()
            inputs.mockUrlFiles(mockedNameDataPairs)
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.dependencyLensSource = {
                attributeTypes: { pairingRate: "absolute" }
            } as unknown as DependencyLensSource
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadOnBoot()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(mockedErrorDialogService.open).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenCalledWith(setEdgeAttributeTypes({ value: mockedState.dependencyLensSource.attributeTypes }))
            expect(dispatchSpy).toHaveBeenCalledTimes(
                countDifferences(mockedState.dependencyLensSource, defaultDependencyLensSource) + FRAMING_DISPATCH_COUNT
            )
        })
    })
})

function nullifyObjectValues(originalObject) {
    return Object.keys(originalObject).reduce((accumulator, key) => {
        accumulator[key] = null
        return accumulator
    }, {})
}

// Produces a shallow copy of the given state object in which every value is guaranteed to differ from
// the original — unlike nullifyObjectValues, this also exercises keys whose default is already null
// (e.g. the mapState metric keys), which nullifying would leave equal to their default.
function makeAllValuesDiffer<T extends object>(source: T): T {
    const result = {}
    for (const [key, value] of Object.entries(source)) {
        if (typeof value === "boolean") {
            result[key] = !value
        } else if (typeof value === "number") {
            result[key] = value + 1
        } else if (typeof value === "string") {
            result[key] = `${value}_changed`
        } else if (value === null) {
            result[key] = "changed"
        } else if (Array.isArray(value)) {
            result[key] = [...value, "changed"]
        } else {
            result[key] = { ...value, __changed: true }
        }
    }
    return result as T
}

function countDifferences<T>(object1: T, object2: T): number {
    let differences = 0

    for (const key of Object.keys(object1)) {
        if (object1[key] !== object2[key]) {
            differences++
        }
    }

    return differences
}
