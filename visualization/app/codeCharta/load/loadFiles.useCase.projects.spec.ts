import { MockStore } from "@ngrx/store/testing"
import stringify from "safe-stable-stringify"
import { FILE_STATES, TEST_DELTA_MAP_A, TEST_FILE_CONTENT } from "../mocks/dataMocks"
import { CcState } from "../model/codeCharta.model"
import { ProjectSnapshotOrigin } from "../model/projectSnapshot.model"
import { NO_FILES_LOADED_ERROR_MESSAGE } from "../stores/fileStore/fileStore.facade"
import { sampleFile1, sampleFile2 } from "../stores/fileStore/loaders/ccJson/sampleFiles"
import { LoadFileService } from "../stores/fileStore/loaders/ccJson/services/loadFile.service"
import { getNameDataPair } from "../stores/fileStore/loaders/ccJson/util/fileParser"
import { setFiles } from "../stores/fileStore/store/files.actions"
import { filesLoaded } from "../stores/fileStore/store/filesLoaded/filesLoaded.actions"
import { setIsLoadingFile } from "../stores/fileStore/store/isLoadingFile/isLoadingFile.actions"
import { defaultState } from "../stores/rootStore/state.manager"
import { ErrorDialogService } from "../util/errorDialog/errorDialog.service"
import { NO_URL_METRICS } from "../util/queryParameter/queryParameter"
import { LoadedSnapshotFacts, ProjectSnapshotsLoadResult, ProjectSnapshotToLoad } from "./load.facade"
import { LoadFilesUseCase } from "./loadFiles.useCase"
import { dispatchedTypes, loadFilesInputs, setUpLoadFilesUseCase } from "./loadFiles.useCase.testBed.mocks"

jest.mock("../stores/fileStore/loaders/ccJson/util/urlExtractor")
jest.mock("../model/files/files.helper")

const URL_LOAD_ERROR_TITLE = "File(s) could not be loaded from the given file URL parameter. Loaded sample files instead."
const SAVED_SETTINGS_ERROR_TITLE = "Saved settings could not be restored."

describe("LoadFilesUseCase with projects", () => {
    let store: MockStore
    let loadFileService: LoadFileService
    let loadFilesUseCase: LoadFilesUseCase
    let mockedErrorDialogService: ErrorDialogService
    let inputs: ReturnType<typeof loadFilesInputs>

    beforeEach(() => {
        const testBed = setUpLoadFilesUseCase()
        ;({ store, loadFileService, loadFilesUseCase } = testBed)
        mockedErrorDialogService = testBed.errorDialogService
        inputs = loadFilesInputs(testBed)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe("load project snapshots", () => {
        const originOf = (snapshotId: string): ProjectSnapshotOrigin => ({
            projectId: "p-1",
            folderId: "f-1",
            snapshotId,
            folderLabel: "billing"
        })

        const snapshotOf = (snapshotId: string, checksum: string): ProjectSnapshotToLoad => ({
            origin: originOf(snapshotId),
            displayName: `billing@${snapshotId}`,
            readBytes: async () => new TextEncoder().encode(JSON.stringify({ ...TEST_FILE_CONTENT, fileChecksum: checksum }))
        })

        const unreadableSnapshotOf = (snapshotId: string): ProjectSnapshotToLoad => ({
            origin: originOf(snapshotId),
            displayName: `billing@${snapshotId}`,
            readBytes: async () => new TextEncoder().encode("not a map")
        })

        it("should load a snapshot under its display name with source project", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")
            const expectedFacts: LoadedSnapshotFacts = { origin: originOf("abc1234"), checksum: "checksum-a", rootName: "root" }

            // Act
            const result: ProjectSnapshotsLoadResult = await loadFilesUseCase.loadProjectSnapshots([snapshotOf("abc1234", "checksum-a")])

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(
                [expect.objectContaining({ fileName: "billing@abc1234", projectSnapshot: originOf("abc1234") })],
                { replaceLoadedFiles: true }
            )
            expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: filesLoaded.type, source: "project" }))
            expect(result.loaded).toEqual([expectedFacts])
        })

        it("should drop a snapshot with identical content and report it", async () => {
            // Act
            const result = await loadFilesUseCase.loadProjectSnapshots([
                snapshotOf("abc1234", "same-checksum"),
                snapshotOf("def5678", "same-checksum")
            ])

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([expect.objectContaining({ fileName: "billing@abc1234" })], {
                replaceLoadedFiles: true
            })
            expect(result.identicalContent).toEqual([{ kept: originOf("abc1234"), dropped: originOf("def5678") }])
        })

        it("should report an unreadable snapshot and load the rest", async () => {
            // Act
            const result = await loadFilesUseCase.loadProjectSnapshots([
                unreadableSnapshotOf("broken"),
                snapshotOf("abc1234", "checksum-a")
            ])

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([expect.objectContaining({ fileName: "billing@abc1234" })], {
                replaceLoadedFiles: true
            })
            expect(result.unreadable).toEqual([originOf("broken")])
        })

        it("should report a snapshot whose bytes cannot be read as unreadable", async () => {
            // Arrange
            const failingSnapshot = { ...snapshotOf("gone", "checksum-a"), readBytes: () => Promise.reject(new Error("missing")) }

            // Act
            const result = await loadFilesUseCase.loadProjectSnapshots([failingSnapshot])

            // Assert
            expect(result.unreadable).toEqual([originOf("gone")])
        })

        it("should clear the loading indicator when nothing could be loaded", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadProjectSnapshots([unreadableSnapshotOf("broken")])

            // Assert
            expect(loadFileService.loadFiles).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenLastCalledWith(setIsLoadingFile({ value: false }))
        })

        it("should clear the loading indicator and report the maps as unreadable when the map rejects them all", async () => {
            // Arrange
            jest.mocked(loadFileService.loadFiles).mockImplementation(() => {
                throw new Error(NO_FILES_LOADED_ERROR_MESSAGE)
            })
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            const result = await loadFilesUseCase.loadProjectSnapshots([snapshotOf("abc1234", "checksum-a")])

            // Assert
            expect(dispatchSpy).toHaveBeenLastCalledWith(setIsLoadingFile({ value: false }))
            expect(result).toEqual({ loaded: [], identicalContent: [], unreadable: [originOf("abc1234")] })
        })

        it("should force default metrics when asked", async () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.loadProjectSnapshots([snapshotOf("abc1234", "checksum-a")], { discardMetricSelection: true })

            // Assert
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: filesLoaded.type, source: "project", forceDefaultMetrics: true })
            )
        })
    })

    describe("boot from a project", () => {
        const origin: ProjectSnapshotOrigin = { projectId: "p-1", folderId: "f-1", snapshotId: "abc1234", folderLabel: "billing" }
        const snapshot: ProjectSnapshotToLoad = {
            origin,
            displayName: "billing@abc1234",
            readBytes: async () => new TextEncoder().encode(JSON.stringify(TEST_FILE_CONTENT))
        }

        it("should restore saved settings and load the resolved snapshots", async () => {
            // Arrange
            const AMOUNT_OF_TOP_LABELS = 600
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.mapState.amountOfTopLabels = AMOUNT_OF_TOP_LABELS
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            const result = await loadFilesUseCase.bootFromProject(async () => [snapshot])

            // Assert
            expect(dispatchSpy).toHaveBeenCalledWith({ type: "SET_AMOUNT_OF_TOP_LABELS", value: AMOUNT_OF_TOP_LABELS })
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([expect.objectContaining({ projectSnapshot: origin })], {
                replaceLoadedFiles: true
            })
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: filesLoaded.type,
                    source: "project",
                    restoredSettings: expect.objectContaining({ sharedView: mockedState.sharedView })
                })
            )
            expect(result.loaded.map(facts => facts.origin)).toEqual([origin])
        })

        it("should ignore files of an older saved session", async () => {
            // Arrange
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = FILE_STATES
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.bootFromProject(async () => [snapshot])

            // Assert
            expect(dispatchedTypes(dispatchSpy)).not.toContain(setFiles.type)
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([expect.objectContaining({ fileName: "billing@abc1234" })], {
                replaceLoadedFiles: true
            })
        })

        it("should finish without files when nothing resolves", async () => {
            // Arrange
            const mockedState = JSON.parse(stringify(defaultState)) as CcState
            mockedState.files = FILE_STATES
            inputs.mockPersistedState(mockedState)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            const result = await loadFilesUseCase.bootFromProject(async () => [])

            // Assert
            expect(loadFileService.loadFiles).not.toHaveBeenCalled()
            expect(dispatchSpy).toHaveBeenLastCalledWith(setIsLoadingFile({ value: false }))
            expect(result).toEqual({ loaded: [], identicalContent: [], unreadable: [] })
        })

        it("should continue with defaults when the saved settings are unreadable", async () => {
            // Arrange
            inputs.mockPersistedReadError(new Error("Could not read cc-state"))
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.bootFromProject(async () => [snapshot])

            // Assert
            expect(mockedErrorDialogService.open).toHaveBeenCalledWith({
                title: SAVED_SETTINGS_ERROR_TITLE,
                message: "Could not read cc-state"
            })
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: filesLoaded.type, source: "project", restoredSettings: null })
            )
        })

        it("should show the sample files", () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            loadFilesUseCase.showSampleFiles()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: filesLoaded.type, source: "sample", areSampleFiles: true })
            )
        })

        it("should unload all files and clear the loading indicator", () => {
            // Arrange
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            loadFilesUseCase.unloadAllFiles()

            // Assert
            expect(dispatchSpy).toHaveBeenCalledWith(setFiles({ value: [] }))
            expect(dispatchSpy).toHaveBeenLastCalledWith(setIsLoadingFile({ value: false }))
        })
    })

    describe("reload after reset", () => {
        it("should load the sample files and discard the previous metric selection when no file parameter is present", async () => {
            // Arrange
            inputs.mockUrlWithoutFile()
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.reloadAfterReset()

            // Assert — a reset deliberately throws the previous selection away, so the reconciliation must
            // fall back to the computed default even when the old selection is still available.
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: filesLoaded.type, source: "reset", forceDefaultMetrics: true })
            )
        })

        it("should load the files from the url and honour its metrics when a file parameter is present", async () => {
            // Arrange
            const mockedNameDataPairs = [getNameDataPair(TEST_DELTA_MAP_A)]
            inputs.mockUrlWithFile({ metrics: { ...NO_URL_METRICS, areaMetric: "mcc" } })
            inputs.mockUrlFiles(mockedNameDataPairs)
            const dispatchSpy = jest.spyOn(store, "dispatch")

            // Act
            await loadFilesUseCase.reloadAfterReset()

            // Assert
            expect(loadFileService.loadFiles).toHaveBeenCalledWith(mockedNameDataPairs)
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: filesLoaded.type,
                    source: "reset",
                    urlMetrics: expect.objectContaining({ areaMetric: "mcc" })
                })
            )
        })

        it("should raise the error dialog and fall back to the sample files when the url load fails", async () => {
            // Arrange
            inputs.mockUrlWithFile()
            inputs.mockUrlLoadError(new Error("could not be loaded"))

            // Act
            await loadFilesUseCase.reloadAfterReset()

            // Assert — the old reset dialog swallowed this error silently
            expect(mockedErrorDialogService.open).toHaveBeenCalledWith(expect.objectContaining({ title: URL_LOAD_ERROR_TITLE }))
            expect(loadFileService.loadFiles).toHaveBeenCalledWith([sampleFile1, sampleFile2])
        })
    })
})
