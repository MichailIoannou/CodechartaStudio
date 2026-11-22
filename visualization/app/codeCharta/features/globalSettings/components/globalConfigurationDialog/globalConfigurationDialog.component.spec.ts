import { HttpClient } from "@angular/common/http"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { LoadFileService } from "../../../../stores/fileStore/fileStore.facade"
import { defaultMapState } from "../../../../stores/mapState/mapState.read.facade"
import { defaultPreferences } from "../../../../stores/preferences/preferences.read.facade"
import { defaultSharedView } from "../../../../stores/sharedView/sharedView.read.facade"
import { createFakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { DesktopToolsPanelComponent } from "../../../desktopTools/facade"
import { GlobalSettingsWriteStore } from "../../stores/globalSettings.write.store"
import { GlobalConfigurationDialogComponent } from "./globalConfigurationDialog.component"

describe("GlobalConfigurationDialogComponent", () => {
    let fixture: ComponentFixture<GlobalConfigurationDialogComponent>
    let component: GlobalConfigurationDialogComponent
    let mockGlobalSettingsWriteStore: jest.Mocked<Partial<GlobalSettingsWriteStore>>
    let mockState: jest.Mocked<Partial<State<any>>>

    function configureDialog(desktopBridge: ReturnType<typeof createFakeDesktopBridge> | null = null) {
        TestBed.configureTestingModule({
            imports: [GlobalConfigurationDialogComponent],
            providers: [
                provideMockStore({
                    initialState: { preferences: defaultPreferences, mapState: defaultMapState, sharedView: defaultSharedView }
                }),
                { provide: State, useValue: mockState },
                { provide: GlobalSettingsWriteStore, useValue: mockGlobalSettingsWriteStore },
                { provide: LoadFileService, useValue: { loadFiles: jest.fn() } },
                { provide: HttpClient, useValue: {} },
                { provide: DESKTOP_BRIDGE, useValue: desktopBridge }
            ]
        })
    }

    beforeEach(() => {
        mockGlobalSettingsWriteStore = {
            setScreenshotToClipboard: jest.fn(),
            setLocalSourceEnabled: jest.fn(),
            setWhiteBackground: jest.fn(),
            setHideFlatBuildings: jest.fn(),
            setResetCameraIfNewFileIsLoaded: jest.fn()
        }

        mockState = {
            getValue: jest.fn().mockReturnValue({ preferences: defaultPreferences, mapState: defaultMapState })
        }

        configureDialog()

        fixture = TestBed.createComponent(GlobalConfigurationDialogComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    describe("initialization", () => {
        it("should create component", () => {
            // Assert
            expect(component).toBeTruthy()
        })

        it("should initialize screenshotToClipboardEnabled signal", () => {
            // Arrange & Act
            const value = component.screenshotToClipboardEnabled()

            // Assert
            expect(value).toBe(false)
        })

        it("should initialize isWhiteBackground signal", () => {
            // Arrange & Act
            const value = component.isWhiteBackground()

            // Assert
            expect(value).toBe(false)
        })

        it("should initialize hideFlatBuildings signal", () => {
            // Arrange & Act
            const value = component.hideFlatBuildings()

            // Assert
            expect(value).toBe(false)
        })

        it("should initialize resetCameraIfNewFileIsLoaded signal", () => {
            // Arrange & Act
            const value = component.resetCameraIfNewFileIsLoaded()

            // Assert
            expect(value).toBe(true)
        })
    })

    describe("rendering sub-components", () => {
        it("should leave the map layout to the metrics bar", () => {
            // Arrange & Act
            const mapLayoutSelect = fixture.nativeElement.querySelector("#mapLayoutSelect")

            // Assert
            expect(mapLayoutSelect).toBeNull()
        })

        it("should render ResetSettingsButton component", () => {
            // Arrange & Act
            const resetButtonComponent = fixture.nativeElement.querySelector("cc-reset-settings-button")

            // Assert
            expect(resetButtonComponent).toBeTruthy()
        })

        it("should render ResetMapButton component", () => {
            // Arrange & Act
            const resetMapButtonComponent = fixture.nativeElement.querySelector("cc-reset-map-button")

            // Assert
            expect(resetMapButtonComponent).toBeTruthy()
        })

        it("should render SettingToggle components for all settings", () => {
            // Arrange & Act
            const toggleComponents = fixture.nativeElement.querySelectorAll("cc-setting-toggle")

            // Assert
            expect(toggleComponents.length).toBeGreaterThan(0)
        })

        it("should render ExternalLinks component", () => {
            // Arrange & Act
            const externalLinksComponent = fixture.nativeElement.querySelector("cc-external-links")

            // Assert
            expect(externalLinksComponent).toBeTruthy()
        })
    })

    describe("desktop tools", () => {
        function panelOfAFreshDialog(desktopBridge: ReturnType<typeof createFakeDesktopBridge> | null) {
            TestBed.resetTestingModule()
            configureDialog(desktopBridge)
            const freshFixture = TestBed.createComponent(GlobalConfigurationDialogComponent)
            freshFixture.detectChanges()
            return freshFixture.nativeElement.querySelector("cc-desktop-tools-panel")
        }

        it("should not show desktop tools on the web", () => {
            // Act
            const panel = panelOfAFreshDialog(null)

            // Assert
            expect(panel).toBeNull()
        })

        it("should show the window section right after the desktop tools, and only on the desktop", () => {
            // Act
            const desktopPanel = panelOfAFreshDialog(createFakeDesktopBridge())
            TestBed.resetTestingModule()
            configureDialog(null)
            const webDialog = TestBed.createComponent(GlobalConfigurationDialogComponent)
            webDialog.detectChanges()

            // Assert
            expect(desktopPanel.nextElementSibling.tagName).toBe("CC-WINDOW-TITLE-BAR-SETTING")
            expect(webDialog.nativeElement.querySelector("cc-window-title-bar-setting")).toBeNull()
        })

        function aFreshDesktopDialog() {
            TestBed.resetTestingModule()
            configureDialog(createFakeDesktopBridge())
            const freshFixture = TestBed.createComponent(GlobalConfigurationDialogComponent)
            freshFixture.detectChanges()
            freshFixture.componentInstance.dialogElement().nativeElement.showModal = jest.fn()
            const panel: DesktopToolsPanelComponent = freshFixture.debugElement.query(
                By.directive(DesktopToolsPanelComponent)
            ).componentInstance
            const reveal = jest.spyOn(panel, "reveal").mockImplementation(() => {})
            return { dialog: freshFixture.componentInstance, reveal }
        }

        it("should open at the desktop tools with the failing tool when opened for it", () => {
            // Arrange
            const { dialog, reveal } = aFreshDesktopDialog()

            // Act
            dialog.open({ section: "desktopTools", tool: "git" })

            // Assert
            expect(dialog.dialogElement().nativeElement.showModal).toHaveBeenCalled()
            expect(reveal).toHaveBeenCalledWith("git")
        })

        it("should open at its top when opened without a section", () => {
            // Arrange
            const { dialog, reveal } = aFreshDesktopDialog()

            // Act
            dialog.open()

            // Assert
            expect(reveal).not.toHaveBeenCalled()
        })

        it("should show desktop tools in the desktop app", () => {
            // Arrange
            const desktopBridge = createFakeDesktopBridge()

            // Act
            const panel = panelOfAFreshDialog(desktopBridge)

            // Assert
            expect(panel).not.toBeNull()
        })
    })

    describe("dialog methods", () => {
        it("should have dialog element", () => {
            // Arrange & Act
            const dialogElement = component.dialogElement()

            // Assert
            expect(dialogElement).toBeTruthy()
        })

        it("should open dialog when open() is called", () => {
            // Arrange
            const mockShowModal = jest.fn()
            component.dialogElement().nativeElement.showModal = mockShowModal

            // Act
            component.open()

            // Assert
            expect(mockShowModal).toHaveBeenCalled()
        })

        it("should close dialog when close() is called", () => {
            // Arrange
            const mockClose = jest.fn()
            component.dialogElement().nativeElement.close = mockClose

            // Act
            component.close()

            // Assert
            expect(mockClose).toHaveBeenCalled()
        })
    })

    describe("setting change handlers", () => {
        it("should call setResetCameraIfNewFileIsLoaded when handleResetCameraIfNewFileIsLoadedChanged is called with true", () => {
            // Arrange & Act
            component.handleResetCameraIfNewFileIsLoadedChanged(true)

            // Assert
            expect(mockGlobalSettingsWriteStore.setResetCameraIfNewFileIsLoaded).toHaveBeenCalledWith(true)
        })

        it("should call setResetCameraIfNewFileIsLoaded when handleResetCameraIfNewFileIsLoadedChanged is called with false", () => {
            // Arrange & Act
            component.handleResetCameraIfNewFileIsLoadedChanged(false)

            // Assert
            expect(mockGlobalSettingsWriteStore.setResetCameraIfNewFileIsLoaded).toHaveBeenCalledWith(false)
        })

        it("should call setHideFlatBuildings when handleHideFlatBuildingsChanged is called with true", () => {
            // Arrange & Act
            component.handleHideFlatBuildingsChanged(true)

            // Assert
            expect(mockGlobalSettingsWriteStore.setHideFlatBuildings).toHaveBeenCalledWith(true)
        })

        it("should call setHideFlatBuildings when handleHideFlatBuildingsChanged is called with false", () => {
            // Arrange & Act
            component.handleHideFlatBuildingsChanged(false)

            // Assert
            expect(mockGlobalSettingsWriteStore.setHideFlatBuildings).toHaveBeenCalledWith(false)
        })

        it("should call setWhiteBackground when handleIsWhiteBackgroundChanged is called with true", () => {
            // Arrange & Act
            component.handleIsWhiteBackgroundChanged(true)

            // Assert
            expect(mockGlobalSettingsWriteStore.setWhiteBackground).toHaveBeenCalledWith(true)
        })

        it("should call setWhiteBackground when handleIsWhiteBackgroundChanged is called with false", () => {
            // Arrange & Act
            component.handleIsWhiteBackgroundChanged(false)

            // Assert
            expect(mockGlobalSettingsWriteStore.setWhiteBackground).toHaveBeenCalledWith(false)
        })

        it("should call setScreenshotToClipboard when handleScreenshotToClipboardEnabledChanged is called with true", () => {
            // Arrange & Act
            component.handleScreenshotToClipboardEnabledChanged(true)

            // Assert
            expect(mockGlobalSettingsWriteStore.setScreenshotToClipboard).toHaveBeenCalledWith(true)
        })

        it("should call setScreenshotToClipboard when handleScreenshotToClipboardEnabledChanged is called with false", () => {
            // Arrange & Act
            component.handleScreenshotToClipboardEnabledChanged(false)

            // Assert
            expect(mockGlobalSettingsWriteStore.setScreenshotToClipboard).toHaveBeenCalledWith(false)
        })

        it.each([true, false])("should switch local source files to %s when the toggle changes", checked => {
            // Act
            component.handleLocalSourceEnabledChanged(checked)

            // Assert
            expect(mockGlobalSettingsWriteStore.setLocalSourceEnabled).toHaveBeenCalledWith(checked)
        })

        describe("switch for local source files", () => {
            function toggleLabelsOfAFreshDialog(): string[] {
                const freshFixture = TestBed.createComponent(GlobalConfigurationDialogComponent)
                freshFixture.detectChanges()
                return [...freshFixture.nativeElement.querySelectorAll("cc-setting-toggle")].map(toggle => toggle.textContent.trim())
            }

            afterEach(() => {
                delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
            })

            it("should offer the switch, marked as experimental, where the browser can open folders", () => {
                // Arrange
                ;(window as unknown as { showDirectoryPicker: jest.Mock }).showDirectoryPicker = jest.fn()

                // Act
                const labels = toggleLabelsOfAFreshDialog()

                // Assert
                expect(labels).toContain("Open local source files (experimental)")
            })

            it("should not offer the switch where the browser cannot open folders, as in Firefox and Safari", () => {
                // Act
                const labels = toggleLabelsOfAFreshDialog()

                // Assert
                expect(labels.some(label => label.startsWith("Open local source files"))).toBe(false)
            })
        })

        it("should offer no switch for the dependency view, which a map with dependency data always shows", () => {
            // Arrange & Act
            const labels = [...fixture.nativeElement.querySelectorAll("cc-setting-toggle")].map(toggle => toggle.textContent.trim())

            // Assert
            expect(labels.some(label => label.includes("Dependency View"))).toBe(false)
        })
    })
})
