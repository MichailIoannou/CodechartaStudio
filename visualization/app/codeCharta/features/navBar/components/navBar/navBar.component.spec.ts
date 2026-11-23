import { Component, input, output, signal } from "@angular/core"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { render } from "@testing-library/angular"
import { FILE_STATES } from "../../../../mocks/dataMocks"
import { isDeltaStateSelector } from "../../../../stores/fileStore/store/isDeltaState.selector"
import { defaultState } from "../../../../stores/rootStore/state.manager"
import { Export3DMapDialogComponent, Export3DMapDialogStore } from "../../../3dPrint/facade"
import { CompareFacade } from "../../../compare/facade"
import { ProjectSwitcherComponent, ProjectsFacade } from "../../../projects/facade"
import {
    BatchAnalysisDialogComponent,
    BatchAnalysisDialogService,
    SnapshotsDialogComponent,
    SnapshotsDialogService
} from "../../../snapshots/facade"
import { WindowControlsService } from "../../../windowControls/facade"
import { WorkspaceStatusComponent } from "../../../workspaceStatus/facade"
import { NavBarFit } from "../../services/navBarFit.service"
import { UploadFilesService } from "../../services/uploadFiles.service"
import { NavBarComponent } from "./navBar.component"

@Component({ selector: "cc-export-3D-map-dialog", template: "" })
class Export3DMapDialogStubComponent {
    readonly closed = output<void>()
}

@Component({ selector: "cc-project-switcher", template: "" })
class ProjectSwitcherStubComponent {
    readonly labelMaxWidth = input<number | null>(null)
    readonly iconOnly = input(false)
}

@Component({ selector: "cc-workspace-status", template: "" })
class WorkspaceStatusStubComponent {
    readonly iconOnly = input(false)
    readonly width = input<number | null>(null)
}

@Component({ selector: "cc-snapshots-dialog", template: "" })
class SnapshotsDialogStubComponent {}

@Component({ selector: "cc-batch-analysis-dialog", template: "" })
class BatchAnalysisDialogStubComponent {}

describe("NavBarComponent", () => {
    const providersFor = (isDeltaState: boolean) => [
        provideMockStore({ initialState: defaultState, selectors: [{ selector: isDeltaStateSelector, value: isDeltaState }] }),
        { provide: State, useValue: { getValue: () => defaultState } },
        { provide: UploadFilesService, useValue: { uploadFiles: jest.fn() } },
        provideRouter([])
    ]

    const stubTheExportDialog = () =>
        TestBed.overrideComponent(NavBarComponent, {
            remove: { imports: [Export3DMapDialogComponent] },
            add: { imports: [Export3DMapDialogStubComponent] }
        })

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [NavBarComponent],
            providers: providersFor(false)
        })
    })

    it("should render the file controls, the centered view switcher and the settings button", async () => {
        // Arrange & Act
        const { container } = await render(NavBarComponent, { providers: providersFor(false) })

        // Assert
        expect(container.querySelectorAll("cc-nav-bar-logo").length).toBe(1)
        expect(container.querySelectorAll("cc-nav-bar-folder-button").length).toBe(1)
        expect(container.querySelectorAll("cc-map-selector").length).toBe(1)
        expect(container.querySelectorAll("cc-delta-selector").length).toBe(0)
        expect(container.querySelectorAll(".navbar-center > cc-view-switcher").length).toBe(1)
        expect(container.querySelectorAll(".navbar-end > cc-settings-button").length).toBe(1)
    })

    it("should render no control other than the settings button on the trailing side", async () => {
        // Arrange & Act
        const { container } = await render(NavBarComponent, { providers: providersFor(false) })

        // Assert — the mode toggle and the 3D print action moved into the hover mode bar
        expect(container.querySelectorAll(".navbar-end > *").length).toBe(1)
        expect(container.querySelectorAll(".navbar-end cc-mode-toggle").length).toBe(0)
        expect(container.querySelectorAll(".navbar-end cc-print-3d-button").length).toBe(0)
    })

    it("should render the delta selector instead of the map selector in compare mode", async () => {
        // Arrange & Act
        const { container } = await render(NavBarComponent, { providers: providersFor(true) })

        // Assert
        expect(container.querySelectorAll("cc-map-selector").length).toBe(0)
        expect(container.querySelectorAll("cc-delta-selector").length).toBe(1)
    })

    it("should keep the view switcher in compare mode", async () => {
        // Arrange & Act
        const { container } = await render(NavBarComponent, { providers: providersFor(true) })

        // Assert — its mode bar is the only way back out of compare mode
        expect(container.querySelectorAll("cc-view-switcher").length).toBe(1)
    })

    it("should publish its own height as the shared bars-height variable", async () => {
        // Arrange & Act
        await render(NavBarComponent, { providers: providersFor(false) })

        // Assert — views that never mount the code map depend on this being set by the measured element
        expect(document.documentElement.style.getPropertyValue("--cc-bars-height")).toMatch(/^\d+px$/)
    })

    it("should host the 3D export dialog itself, so the mode bar can unmount under it", async () => {
        // Arrange — the print button lives in the hover mode bar, which disappears on mouse-out
        stubTheExportDialog()

        // Act
        const { container } = await render(NavBarComponent, {
            providers: [
                ...providersFor(false),
                { provide: Export3DMapDialogStore, useValue: { isDialogOpen: signal(true), closeDialog: jest.fn() } }
            ]
        })

        // Assert
        expect(container.querySelectorAll("cc-export-3D-map-dialog").length).toBe(1)
    })

    it("should not host the 3D export dialog while it is closed", async () => {
        // Arrange
        stubTheExportDialog()

        // Act
        const { container } = await render(NavBarComponent, {
            providers: [
                ...providersFor(false),
                { provide: Export3DMapDialogStore, useValue: { isDialogOpen: signal(false), closeDialog: jest.fn() } }
            ]
        })

        // Assert
        expect(container.querySelectorAll("cc-export-3D-map-dialog").length).toBe(0)
    })

    describe("in the desktop app", () => {
        const desktopProvidersFor = ({ hasFiles = false, isDeltaState = false, hasActiveProject = false } = {}) => [
            provideMockStore({
                initialState: { ...defaultState, files: hasFiles ? FILE_STATES : [] },
                selectors: [{ selector: isDeltaStateSelector, value: isDeltaState }]
            }),
            { provide: State, useValue: { getValue: () => defaultState } },
            { provide: ProjectsFacade, useValue: { isDesktop: signal(true), hasActiveProject: signal(hasActiveProject) } },
            { provide: SnapshotsDialogService, useValue: { isOpen: signal(false) } },
            provideRouter([])
        ]

        beforeEach(() => {
            TestBed.overrideComponent(NavBarComponent, {
                remove: {
                    imports: [ProjectSwitcherComponent, WorkspaceStatusComponent, SnapshotsDialogComponent, BatchAnalysisDialogComponent]
                },
                add: {
                    imports: [
                        ProjectSwitcherStubComponent,
                        WorkspaceStatusStubComponent,
                        SnapshotsDialogStubComponent,
                        BatchAnalysisDialogStubComponent
                    ]
                }
            })
        })

        it("should render the upload button in the web build", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: providersFor(false) })

            // Assert
            expect(container.querySelectorAll("cc-nav-bar-folder-button").length).toBe(1)
            expect(container.querySelectorAll("cc-project-switcher").length).toBe(0)
        })

        it("should render the project switcher in desktop", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, {
                providers: desktopProvidersFor({ hasFiles: true, hasActiveProject: true })
            })

            // Assert
            expect(container.querySelectorAll("cc-project-switcher").length).toBe(1)
            expect(container.querySelectorAll("cc-nav-bar-folder-button").length).toBe(0)
            expect(container.querySelectorAll("cc-map-selector").length).toBe(0)
            expect(container.querySelectorAll("cc-view-switcher").length).toBe(1)
        })

        it("should show the workspace status in the map slot while a project is open, also without a map", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: desktopProvidersFor({ hasActiveProject: true }) })

            // Assert
            expect(container.querySelectorAll(".navbar-start > cc-workspace-status").length).toBe(1)
            expect(container.querySelectorAll("cc-map-selector").length).toBe(0)
        })

        it("should host the snapshots dialog while it is open", async () => {
            // Arrange
            const isSnapshotsDialogOpen = signal(false)
            const { container, fixture } = await render(NavBarComponent, {
                providers: [
                    ...desktopProvidersFor({ hasActiveProject: true }),
                    { provide: SnapshotsDialogService, useValue: { isOpen: isSnapshotsDialogOpen } }
                ]
            })
            const closedCount = container.querySelectorAll("cc-snapshots-dialog").length

            // Act
            isSnapshotsDialogOpen.set(true)
            fixture.detectChanges()

            // Assert
            expect(closedCount).toBe(0)
            expect(container.querySelectorAll("cc-snapshots-dialog").length).toBe(1)
        })

        it("should host the batch analysis dialog while it has a folder", async () => {
            // Arrange
            const request = signal<{ folder: object } | null>(null)
            const { container, fixture } = await render(NavBarComponent, {
                providers: [
                    ...desktopProvidersFor({ hasActiveProject: true }),
                    { provide: BatchAnalysisDialogService, useValue: { current: request } }
                ]
            })
            const closedCount = container.querySelectorAll("cc-batch-analysis-dialog").length

            // Act
            request.set({ folder: { projectId: "p-1", folderId: "f-1" } })
            fixture.detectChanges()

            // Assert
            expect(closedCount).toBe(0)
            expect(container.querySelectorAll("cc-batch-analysis-dialog").length).toBe(1)
        })

        it("should hide the view switcher while no map is loaded", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: desktopProvidersFor() })

            // Assert
            expect(container.querySelectorAll("cc-view-switcher").length).toBe(0)
            expect(container.querySelectorAll("cc-map-selector").length).toBe(0)
        })

        it("should offer the map selector for the sample maps when no project is open", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: desktopProvidersFor({ hasFiles: true }) })

            // Assert
            expect(container.querySelectorAll("cc-map-selector").length).toBe(1)
        })

        it("should label a project comparison with the chip after the icon-only workspace status", async () => {
            // Arrange & Act
            const { container, fixture } = await render(NavBarComponent, {
                providers: [
                    ...desktopProvidersFor({ hasFiles: true, isDeltaState: true, hasActiveProject: true }),
                    { provide: CompareFacade, useValue: { isComparing: signal(true) } }
                ]
            })

            // Assert
            const mapSlot = [...container.querySelectorAll(".navbar-start > *")].map(element => element.tagName.toLowerCase())
            expect(mapSlot.slice(-2)).toEqual(["cc-workspace-status", "cc-comparison-chip"])
            expect(fixture.debugElement.query(element => element.name === "cc-workspace-status").componentInstance.iconOnly()).toBe(true)
            expect(container.querySelectorAll("cc-delta-selector").length).toBe(0)
        })

        describe("fitting navbar-start", () => {
            const fakeFit = () => ({
                projectLabelMaxWidth: signal<number | null>(64),
                isProjectIconOnly: signal(false),
                slotWidth: signal<number | null>(200),
                isSlotCompact: signal(true),
                observe: jest.fn(() => stopFitting)
            })
            let stopFitting: jest.Mock

            beforeEach(() => {
                stopFitting = jest.fn()
            })

            const instanceOf = (fixture: ComponentFixture<NavBarComponent>, name: string) =>
                fixture.debugElement.query(element => element.name === name).componentInstance

            it("should hand the fitted widths to the project menu and the workspace status", async () => {
                // Arrange & Act
                const { fixture } = await render(NavBarComponent, {
                    providers: desktopProvidersFor({ hasFiles: true, hasActiveProject: true }),
                    componentProviders: [{ provide: NavBarFit, useValue: fakeFit() }]
                })

                // Assert
                const switcher = instanceOf(fixture, "cc-project-switcher")
                const status = instanceOf(fixture, "cc-workspace-status")
                expect([switcher.labelMaxWidth(), switcher.iconOnly()]).toEqual([64, false])
                expect([status.width(), status.iconOnly()]).toEqual([200, true])
            })

            it("should hand the map slot's width to the comparison chip and keep the workspace status icon-only", async () => {
                // Arrange & Act
                const { fixture } = await render(NavBarComponent, {
                    providers: [
                        ...desktopProvidersFor({ hasFiles: true, isDeltaState: true, hasActiveProject: true }),
                        { provide: CompareFacade, useValue: { isComparing: signal(true) } }
                    ],
                    componentProviders: [{ provide: NavBarFit, useValue: fakeFit() }]
                })

                // Assert
                const chip = instanceOf(fixture, "cc-comparison-chip")
                expect([chip.width(), chip.labelsOnly()]).toEqual([200, true])
                expect(instanceOf(fixture, "cc-workspace-status").iconOnly()).toBe(true)
            })

            it("should watch navbar-start once rendered and stop when the nav bar goes", async () => {
                // Arrange
                const fit = fakeFit()
                const { fixture, container } = await render(NavBarComponent, {
                    providers: desktopProvidersFor({ hasActiveProject: true }),
                    componentProviders: [{ provide: NavBarFit, useValue: fit }]
                })

                // Act
                fixture.destroy()

                // Assert
                expect(fit.observe).toHaveBeenCalledWith(container.querySelector(".navbar-start"))
                expect(stopFitting).toHaveBeenCalled()
            })
        })

        it("should show the delta selector for uploaded files", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: providersFor(true) })

            // Assert
            expect(container.querySelectorAll("cc-delta-selector").length).toBe(1)
            expect(container.querySelectorAll("cc-comparison-chip").length).toBe(0)
            expect(container.querySelectorAll("cc-compare-host").length).toBe(0)
        })

        it("should offer the delta selector in compare mode", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, {
                providers: desktopProvidersFor({ hasFiles: true, isDeltaState: true, hasActiveProject: true })
            })

            // Assert
            expect(container.querySelectorAll("cc-delta-selector").length).toBe(1)
            expect(container.querySelectorAll("cc-workspace-status").length).toBe(0)
        })
    })
    describe("with CodeCharta's title bar", () => {
        const windowControlsFor = (platform: "linux" | "darwin" | "win32") => ({
            provide: WindowControlsService,
            useValue: {
                state: signal({ platform, buttonOrder: ["minimize", "maximize", "close"], isMaximized: false, isFocused: true }),
                menuAnchor: signal(null),
                openMenu: jest.fn(),
                usesAppTitleBar: signal(true),
                drawsOwnButtons: signal(platform === "linux"),
                reservesTrafficLights: signal(platform === "darwin"),
                reservesCaptionButtons: signal(platform === "win32")
            }
        })

        it("should move the window from its background and end with the window buttons on Linux", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: [...providersFor(false), windowControlsFor("linux")] })

            // Assert
            const navbar = container.querySelector(".navbar")
            const trailing = [...container.querySelectorAll(".navbar-end > *")].map(element => element.tagName.toLowerCase())
            expect(navbar.classList).toContain("cc-window-drag")
            expect(trailing).toEqual(["cc-settings-button", "div", "cc-window-controls"])
            expect(container.querySelector(".navbar-end > div").classList).toContain("cc-window-drag-area")
        })

        it("should open the window menu on a right-click on its empty space on Linux, but not on its controls", async () => {
            // Arrange
            const windowControls = windowControlsFor("linux")
            const { container } = await render(NavBarComponent, { providers: [...providersFor(false), windowControls] })
            const rightClickOn = (element: Element) => {
                const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 640, clientY: 20 })
                element.dispatchEvent(event)
                return event.defaultPrevented
            }

            // Act
            const isPreventedOnBackground = rightClickOn(container.querySelector(".navbar-end"))
            const isPreventedOnSettings = rightClickOn(container.querySelector("cc-settings-button"))

            // Assert
            expect(isPreventedOnBackground).toBe(true)
            expect(isPreventedOnSettings).toBe(false)
            expect(windowControls.useValue.openMenu).toHaveBeenCalledTimes(1)
            expect(windowControls.useValue.openMenu).toHaveBeenCalledWith({ x: 640, y: 20 })
        })

        it("should leave the right-click to the system on macOS and Windows", async () => {
            // Arrange
            const windowControls = windowControlsFor("win32")
            const { container } = await render(NavBarComponent, { providers: [...providersFor(false), windowControls] })

            // Act
            container.querySelector(".navbar-end").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))

            // Assert
            expect(windowControls.useValue.openMenu).not.toHaveBeenCalled()
        })

        it("should leave 80 px for the traffic lights and hide the logo below 1280 px on macOS", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: [...providersFor(false), windowControlsFor("darwin")] })

            // Assert
            const inset = container.querySelector("[data-testid='traffic-lights-inset']")
            expect(inset.classList).toContain("w-20")
            expect(container.querySelector(".navbar-start").firstElementChild).toBe(inset)
            expect(container.querySelector("cc-nav-bar-logo").classList).toContain("max-xl:hidden")
            expect(container.querySelector("cc-window-controls")).toBeNull()
        })

        it("should end where Windows draws its caption buttons", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: [...providersFor(false), windowControlsFor("win32")] })

            // Assert
            const navbar: HTMLElement = container.querySelector(".navbar")
            expect(navbar.getAttribute("style")).toContain("titlebar-area-width")
            expect(container.querySelector("cc-nav-bar-logo").classList).not.toContain("max-xl:hidden")
            expect(container.querySelector("cc-window-controls")).toBeNull()
        })

        it("should keep the system's title bar look while the setting is off", async () => {
            // Arrange & Act
            const { container } = await render(NavBarComponent, { providers: providersFor(false) })

            // Assert
            expect(container.querySelector(".navbar").classList).not.toContain("cc-window-drag")
            expect(container.querySelector("cc-window-controls")).toBeNull()
        })
    })
})
