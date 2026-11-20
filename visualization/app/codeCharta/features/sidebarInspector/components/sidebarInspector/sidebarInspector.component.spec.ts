import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import { render, screen, waitFor } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { provideMockState } from "../../../../mocks/state.mocks"
import { CodeMapNode } from "../../../../model/codeCharta.model"
import { selectedNodeSelector } from "../../../../renderer/renderModel/selectedNode.selector"
import { ThreeRendererService, ThreeSceneService } from "../../../../renderer/threeViewer/threeViewer.facade"
import { isDeltaStateSelector } from "../../../../stores/fileStore/store/isDeltaState.selector"
import { defaultMapColors, mapColorsSelector } from "../../../../stores/mapState/mapState.read.facade"
import { registerSidePanel, SidePanelRoom } from "../../../shared/facade"
import { inspectorClusterSectionsSelector } from "../../selectors/inspectorClusterSections.selector"
import { inspectorMappingBlocksSelector, MappingBlock } from "../../selectors/inspectorMappingBlocks.selector"
import { inspectorMetricRowsSelector, MetricRow } from "../../selectors/inspectorMetricRows.selector"
import { InspectorVisibilityService } from "../../services/inspectorVisibility.service"
import { SidebarInspectorComponent } from "./sidebarInspector.component"

const node = { name: "invoice.ts", path: "/root/services/billing/invoice.ts", attributes: { unary: 1 } } as unknown as CodeMapNode
const mappingBlocks: MappingBlock[] = [
    { kind: "area", metricName: "rloc", value: 842 },
    { kind: "height", metricName: "mcc", value: 41 }
]
const metricRows: MetricRow[] = [
    { name: "rloc", value: 842, mapBar: { fraction: 0.8, severity: "error" }, rangeBar: { fraction: 0.4, severity: "warning" } }
]

describe("SidebarInspectorComponent", () => {
    const clearSelection = jest.fn()

    beforeEach(() => {
        clearSelection.mockClear()
        TestBed.configureTestingModule({
            providers: [
                provideMockState(),
                provideMockStore({
                    selectors: [
                        { selector: selectedNodeSelector, value: undefined },
                        { selector: isDeltaStateSelector, value: false },
                        { selector: mapColorsSelector, value: defaultMapColors },
                        { selector: inspectorMappingBlocksSelector, value: mappingBlocks },
                        { selector: inspectorMetricRowsSelector, value: metricRows },
                        { selector: inspectorClusterSectionsSelector, value: [] }
                    ]
                }),
                { provide: ThreeSceneService, useValue: { clearSelection } },
                { provide: ThreeRendererService, useValue: { render: jest.fn() } }
            ]
        })
    })

    function selectBuilding() {
        const mockStore = TestBed.inject(MockStore)
        mockStore.overrideSelector(selectedNodeSelector, node)
        mockStore.refreshState()
    }

    function deselectBuilding() {
        const mockStore = TestBed.inject(MockStore)
        mockStore.overrideSelector(selectedNodeSelector, undefined)
        mockStore.refreshState()
    }

    it("should stay off-screen while no building is selected", async () => {
        // Arrange & Act
        const { fixture } = await render(SidebarInspectorComponent)

        // Assert
        expect((fixture.nativeElement as HTMLElement).classList.contains("translate-x-full")).toBe(true)
    })

    it("should slide in and show all sections when a building is selected", async () => {
        // Arrange
        const { fixture, detectChanges } = await render(SidebarInspectorComponent)

        // Act
        selectBuilding()
        detectChanges()

        // Assert
        expect((fixture.nativeElement as HTMLElement).classList.contains("translate-x-full")).toBe(false)
        expect(screen.getByText("Inspector")).not.toBe(null)
        expect(screen.getByText("Metric Mapping")).not.toBe(null)
        expect(screen.getByText("Metrics")).not.toBe(null)
        expect(screen.getByTestId("inspector-node-name").textContent).toContain("invoice.ts")
    })

    it("should tell the floating bars the width it covers only while it is shown", async () => {
        // Arrange
        const { detectChanges } = await render(SidebarInspectorComponent)
        const coveredWhileHidden = document.documentElement.style.getPropertyValue("--cc-bar-inset-right")

        // Act
        selectBuilding()
        detectChanges()

        // Assert
        expect(coveredWhileHidden).toBe("0px")
        expect(document.documentElement.style.getPropertyValue("--cc-bar-inset-right")).toBe("calc(var(--cc-inspector-width) + 6px)")
    })

    it("should deselect the building and slide out when clicking the close button", async () => {
        // Arrange
        const { fixture, detectChanges } = await render(SidebarInspectorComponent)
        selectBuilding()
        detectChanges()

        // Act
        await userEvent.click(screen.getByTestId("inspector-close-button"))
        deselectBuilding()
        detectChanges()

        // Assert
        expect(clearSelection).toHaveBeenCalled()
        await waitFor(() => expect((fixture.nativeElement as HTMLElement).classList.contains("translate-x-full")).toBe(true))
    })

    describe("collapsed", () => {
        async function renderCollapsed() {
            const rendered = await render(SidebarInspectorComponent)
            selectBuilding()
            TestBed.inject(InspectorVisibilityService).collapse()
            rendered.detectChanges()
            return rendered
        }

        it("should shrink to a strip with the selected name and a button that expands it", async () => {
            // Act
            await renderCollapsed()

            // Assert
            expect(screen.getByTestId("inspector-collapsed-name").textContent).toContain("invoice.ts")
            expect(screen.getByRole("button", { name: "Expand inspector" })).not.toBe(null)
            expect(screen.queryByText("Metrics")).toBe(null)
        })

        it("should give the floating bars their room back", async () => {
            // Act
            await renderCollapsed()

            // Assert
            expect(document.documentElement.style.getPropertyValue("--cc-bar-inset-right")).toBe("0px")
        })

        it("should show the whole inspector again for the same building when expanded", async () => {
            // Arrange
            await renderCollapsed()

            // Act
            await userEvent.click(screen.getByRole("button", { name: "Expand inspector" }))

            // Assert
            expect(screen.getByText("Metrics")).not.toBe(null)
            expect(screen.getByTestId("inspector-node-name").textContent).toContain("invoice.ts")
        })
    })

    describe("in a view that keeps room for the floating bars", () => {
        const originalWidth = window.innerWidth
        const explorer = { side: "left" as const, isOpen: signal(true), coveredWidthPx: signal(326), collapse: jest.fn() }

        beforeEach(() => {
            Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 })
            explorer.isOpen.set(true)
            explorer.collapse.mockClear()
            TestBed.configureTestingModule({ providers: [SidePanelRoom] })
        })

        afterEach(() => Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth }))

        async function renderBesideExplorer() {
            const rendered = await render(SidebarInspectorComponent)
            TestBed.runInInjectionContext(() => registerSidePanel(explorer))
            return rendered
        }

        it("should collapse the explorer when a selection opens it with too little map left", async () => {
            // Arrange
            const { detectChanges } = await renderBesideExplorer()

            // Act
            selectBuilding()
            detectChanges()

            // Assert
            expect(explorer.collapse).toHaveBeenCalledTimes(1)
        })

        it("should collapse itself when the explorer opens beside it with too little map left", async () => {
            // Arrange
            explorer.isOpen.set(false)
            const { detectChanges } = await renderBesideExplorer()
            selectBuilding()
            detectChanges()

            // Act
            explorer.isOpen.set(true)
            detectChanges()

            // Assert
            expect(TestBed.inject(InspectorVisibilityService).isCollapsed()).toBe(true)
        })
    })
})
