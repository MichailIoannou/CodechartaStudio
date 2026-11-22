import { HttpClient } from "@angular/common/http"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { LoadFileService } from "../../../../stores/fileStore/fileStore.facade"
import { defaultMapState } from "../../../../stores/mapState/mapState.read.facade"
import { defaultPreferences } from "../../../../stores/preferences/preferences.read.facade"
import { defaultSharedView } from "../../../../stores/sharedView/sharedView.read.facade"
import { GlobalConfigurationDialogComponent } from "../../../globalSettings/components/globalConfigurationDialog/globalConfigurationDialog.component"
import { GlobalConfigurationOpener } from "../../../globalSettings/facade"
import { SettingsButtonComponent } from "./settingsButton.component"

describe("SettingsButtonComponent", () => {
    let fixture: ComponentFixture<SettingsButtonComponent>
    let component: SettingsButtonComponent
    let mockDialog: jest.Mocked<Partial<GlobalConfigurationDialogComponent>>

    beforeEach(() => {
        mockDialog = {
            open: jest.fn()
        }

        TestBed.configureTestingModule({
            imports: [SettingsButtonComponent],
            providers: [
                provideMockStore({
                    initialState: { preferences: defaultPreferences, mapState: defaultMapState, sharedView: defaultSharedView }
                }),
                { provide: State, useValue: { getValue: () => ({ preferences: defaultPreferences, mapState: defaultMapState }) } },
                { provide: LoadFileService, useValue: { loadFiles: jest.fn() } },
                { provide: HttpClient, useValue: {} }
            ]
        })

        fixture = TestBed.createComponent(SettingsButtonComponent)
        component = fixture.componentInstance

        Object.defineProperty(component, "dialog", {
            value: () => mockDialog,
            writable: false
        })

        fixture.detectChanges()
    })

    it("should render Settings button", () => {
        // Arrange & Act
        const button = screen.getByRole("button", { name: "Settings" })

        // Assert
        expect(button).toBeTruthy()
    })

    it("should call dialog open when button is clicked", async () => {
        // Arrange
        const button = screen.getByRole("button", { name: "Settings" })

        // Act
        await userEvent.click(button)

        // Assert
        expect(mockDialog.open).toHaveBeenCalledTimes(1)
    })

    it("should open the dialog at the place another feature asks for", () => {
        // Act
        TestBed.inject(GlobalConfigurationOpener).openGlobalConfiguration({ section: "desktopTools", tool: "git" })

        // Assert
        expect(mockDialog.open).toHaveBeenCalledWith({ section: "desktopTools", tool: "git" })
    })

    it("should stop opening the dialog once the button is gone", () => {
        // Arrange
        fixture.destroy()

        // Act
        TestBed.inject(GlobalConfigurationOpener).openGlobalConfiguration()

        // Assert
        expect(mockDialog.open).not.toHaveBeenCalled()
    })
})
