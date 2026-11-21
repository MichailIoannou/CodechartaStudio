import { HttpClient } from "@angular/common/http"
import { TestBed } from "@angular/core/testing"
import { StoreModule } from "@ngrx/store"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import { CcState } from "../model/codeCharta.model"
import { getCCFiles } from "../model/files/files.helper"
import { metricDataSelector } from "../renderer/renderModel/accumulatedData/metricData/metricData.selector"
import { DependencyLensSourceReadWindow } from "../stores/dependencyLensSource/dependencyLensSource.read.facade"
import { DomainLensSourceReadWindow } from "../stores/domainLensSource/domainLensSource.read.facade"
import { DomainStateReadWindow } from "../stores/domainState/domainState.read.facade"
import { FileStoreReadWindow } from "../stores/fileStore/fileStore.facade"
import { LoadFileService } from "../stores/fileStore/loaders/ccJson/services/loadFile.service"
import { getNameDataPair } from "../stores/fileStore/loaders/ccJson/util/fileParser"
import { UrlExtractor } from "../stores/fileStore/loaders/ccJson/util/urlExtractor"
import { MapStateReadWindow } from "../stores/mapState/mapState.read.facade"
import { MetricsLensSourceReadWindow } from "../stores/metricsLensSource/metricsLensSource.read.facade"
import { PreferencesReadWindow } from "../stores/preferences/preferences.read.facade"
import { CcStateSnapshot } from "../stores/rootStore/ccState.snapshot"
import { defaultState } from "../stores/rootStore/state.manager"
import { appReducers, setStateMiddleware } from "../stores/rootStore/store"
import { SharedViewReadWindow } from "../stores/sharedView/sharedView.read.facade"
import { ErrorDialogService } from "../util/errorDialog/errorDialog.service"
import { NO_URL_METRICS, UrlMetricSelection } from "../util/queryParameter/queryParameter"
import { QueryParamsService } from "../util/queryParameter/queryParams.service"
import { LoadFilesUseCase } from "./loadFiles.useCase"
import { CcStatePersistence, PersistedCcStateRead } from "./services/ccStatePersistence"

/** Needs `jest.mock` of the URL extractor and of `files.helper` in the spec that uses it. */
export function setUpLoadFilesUseCase() {
    const errorDialogService = { open: jest.fn() } as unknown as ErrorDialogService
    const queryParamsService = {
        hasFile: jest.fn(() => false),
        getFileNames: jest.fn(() => []),
        getRenderMode: jest.fn(() => null),
        getMetrics: jest.fn(() => NO_URL_METRICS),
        areSampleFilesFlagged: jest.fn(() => false),
        write: jest.fn()
    } as unknown as jest.Mocked<QueryParamsService>
    const ccStatePersistence = {
        read: jest.fn(async (): Promise<PersistedCcStateRead> => ({ state: null, error: null })),
        delete: jest.fn()
    } as unknown as jest.Mocked<CcStatePersistence>
    const urlExtractor = new UrlExtractor({} as HttpClient)

    TestBed.configureTestingModule({
        imports: [[StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })]],
        providers: [
            { provide: ErrorDialogService, useValue: errorDialogService },
            { provide: QueryParamsService, useValue: queryParamsService },
            { provide: CcStatePersistence, useValue: ccStatePersistence },
            { provide: UrlExtractor, useValue: urlExtractor },
            { provide: HttpClient, useValue: {} },
            { provide: LoadFileService, useValue: { loadFiles: jest.fn() } },
            ...defaultReadWindows(),
            provideMockStore({ selectors: [{ selector: metricDataSelector, value: { nodeMetricData: null, edgeMetricData: null } }] })
        ]
    })
    jest.mocked(getCCFiles).mockImplementation(() => defaultState.files.map(state => state.file))

    return {
        store: TestBed.inject(MockStore),
        loadFileService: TestBed.inject(LoadFileService),
        loadFilesUseCase: TestBed.inject(LoadFilesUseCase),
        errorDialogService,
        queryParamsService,
        ccStatePersistence,
        urlExtractor
    }
}

function defaultReadWindows() {
    return [
        { provide: CcStateSnapshot, useValue: { get: () => defaultState } },
        { provide: PreferencesReadWindow, useValue: { getPreferences: () => defaultState.preferences } },
        { provide: MetricsLensSourceReadWindow, useValue: { getMetricsLensSource: () => defaultState.metricsLensSource } },
        { provide: DependencyLensSourceReadWindow, useValue: { getDependencyLensSource: () => defaultState.dependencyLensSource } },
        { provide: DomainLensSourceReadWindow, useValue: { getDomainLensSource: () => defaultState.domainLensSource } },
        { provide: DomainStateReadWindow, useValue: { getDomainState: () => defaultState.domainState } },
        { provide: SharedViewReadWindow, useValue: { getSharedView: () => defaultState.sharedView } },
        { provide: MapStateReadWindow, useValue: { getMapState: () => defaultState.mapState } },
        { provide: FileStoreReadWindow, useValue: { getFiles: () => defaultState.files } }
    ]
}

export type LoadFilesTestBed = ReturnType<typeof setUpLoadFilesUseCase>

export function loadFilesInputs({ queryParamsService, urlExtractor, ccStatePersistence }: LoadFilesTestBed) {
    return {
        mockUrlWithFile(options: { renderMode?: string; areSampleFiles?: boolean; metrics?: UrlMetricSelection } = {}) {
            queryParamsService.hasFile.mockReturnValue(true)
            queryParamsService.getFileNames.mockReturnValue(["filename"])
            queryParamsService.getRenderMode.mockReturnValue(options.renderMode ?? null)
            queryParamsService.areSampleFilesFlagged.mockReturnValue(options.areSampleFiles ?? false)
            queryParamsService.getMetrics.mockReturnValue(options.metrics ?? NO_URL_METRICS)
        },
        mockUrlWithoutFile() {
            queryParamsService.hasFile.mockReturnValue(false)
            queryParamsService.getFileNames.mockReturnValue([])
            queryParamsService.getRenderMode.mockReturnValue(null)
            queryParamsService.areSampleFilesFlagged.mockReturnValue(false)
            queryParamsService.getMetrics.mockReturnValue(NO_URL_METRICS)
        },
        mockUrlFiles(nameDataPairs: ReturnType<typeof getNameDataPair>[]) {
            jest.mocked(urlExtractor.getFileDataFromFileNames).mockResolvedValue(nameDataPairs)
        },
        mockUrlLoadError(error: Error) {
            jest.mocked(urlExtractor.getFileDataFromFileNames).mockImplementation(() => {
                throw error
            })
        },
        mockPersistedState(state: CcState | null) {
            ccStatePersistence.read.mockResolvedValue({ state, error: null })
        },
        mockPersistedReadError(error: Error) {
            ccStatePersistence.read.mockResolvedValue({ state: null, error })
        }
    }
}

export const dispatchedTypes = (dispatchSpy: jest.SpyInstance) => dispatchSpy.mock.calls.map(call => call[0].type)
