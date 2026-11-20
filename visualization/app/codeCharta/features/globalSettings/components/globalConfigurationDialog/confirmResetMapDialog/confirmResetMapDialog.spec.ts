import { TestBed } from "@angular/core/testing"
import { State } from "@ngrx/store"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import "fake-indexeddb/auto"
import { CcStatePersistence } from "../../../../../load/load.facade"
import { METRIC_DATA } from "../../../../../mocks/dataMocks"
import { nodeMetricDataSelector } from "../../../../../renderer/renderModel/nodeMetricData/nodeMetricData.selector"
import { setState } from "../../../../../stores/rootStore/state.actions"
import { defaultState } from "../../../../../stores/rootStore/state.manager"
import { LocalSourceService } from "../../../../localSource/facade"
import { ProjectsBootService } from "../../../../projects/facade"
import { ConfirmResetMapDialogComponent } from "./confirmResetMapDialog.component"

describe("ConfirmResetMapDialogComponent", () => {
    let mockedCcStatePersistence: { read: jest.Mock; delete: jest.Mock }
    let mockedProjectsBoot: { reloadAfterReset: jest.Mock }
    const mockedLocalSource = { forgetAllFolders: jest.fn().mockResolvedValue(undefined) }

    beforeEach(() => {
        mockedCcStatePersistence = { read: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) }
        mockedProjectsBoot = { reloadAfterReset: jest.fn().mockResolvedValue(undefined) }

        TestBed.configureTestingModule({
            imports: [ConfirmResetMapDialogComponent],
            providers: [
                { provide: State, useValue: { getValue: () => defaultState } },
                { provide: CcStatePersistence, useValue: mockedCcStatePersistence },
                { provide: ProjectsBootService, useValue: mockedProjectsBoot },
                { provide: LocalSourceService, useValue: mockedLocalSource },
                provideMockStore({
                    selectors: [
                        {
                            selector: nodeMetricDataSelector,
                            value: METRIC_DATA
                        }
                    ]
                })
            ]
        })

        // jsdom stubs for native <dialog>
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    async function renderAndOpen() {
        const renderResult = await render(ConfirmResetMapDialogComponent)
        renderResult.fixture.componentInstance.open()
        renderResult.fixture.detectChanges()
        return renderResult
    }

    it("should delete the persisted state, reset the map and reload through the projects boot when confirm is selected", async () => {
        // Arrange
        await renderAndOpen()
        const store = TestBed.inject(MockStore)
        const dispatchSpy = jest.spyOn(store, "dispatch")

        // Act
        await userEvent.click(screen.getByText("Yes"))

        // Assert
        expect(mockedCcStatePersistence.delete).toHaveBeenCalled()
        expect(mockedLocalSource.forgetAllFolders).toHaveBeenCalled()
        expect(dispatchSpy).toHaveBeenCalledWith(setState({ value: defaultState }))
        expect(mockedProjectsBoot.reloadAfterReset).toHaveBeenCalled()
    })

    it("should close dialog when abort is selected", async () => {
        // Arrange
        await renderAndOpen()

        // Act
        await userEvent.click(screen.getByText("No"))

        // Assert
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
        expect(mockedProjectsBoot.reloadAfterReset).not.toHaveBeenCalled()
    })
})
