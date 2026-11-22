import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { render, screen, within } from "@testing-library/angular"
import { metricDataSelector } from "../../../../renderer/renderModel/accumulatedData/metricData/metricData.selector"
import { isDeltaStateSelector } from "../../../../stores/fileStore/store/isDeltaState.selector"
import {
    areaMetricSelector,
    colorMetricSelector,
    heightMetricSelector,
    isRadialLayoutSelector
} from "../../../../stores/mapState/mapState.read.facade"
import { defaultState } from "../../../../stores/rootStore/state.manager"
import { reportResize, stubElementSize, stubResizeObserver } from "../../../../util/testUtils/domStubs"
import { MetricsBarComponent } from "./metricsBar.component"

describe("MetricsBarComponent", () => {
    function barProviders({
        isDelta = false,
        hasEdgeMetric = false,
        isRadialLayout = false
    }: {
        isDelta?: boolean
        hasEdgeMetric?: boolean
        isRadialLayout?: boolean
    } = {}) {
        return [
            provideMockStore({
                initialState: defaultState,
                selectors: [
                    { selector: isDeltaStateSelector, value: isDelta },
                    { selector: isRadialLayoutSelector, value: isRadialLayout },
                    { selector: areaMetricSelector, value: "rloc" },
                    { selector: heightMetricSelector, value: "mcc" },
                    { selector: colorMetricSelector, value: "mcc" },
                    {
                        selector: metricDataSelector,
                        value: {
                            nodeMetricData: [{ name: "rloc", maxValue: 100, minValue: 0 }],
                            edgeMetricData: hasEdgeMetric ? [{ name: "pairing_rate", maxValue: 10, minValue: 0, values: [] }] : [],
                            nodeEdgeMetricsMap: new Map()
                        }
                    }
                ]
            }),
            { provide: State, useValue: { getValue: () => defaultState } }
        ]
    }

    async function setup(options: Parameters<typeof barProviders>[0] = {}) {
        return render(MetricsBarComponent, { providers: barProviders(options) })
    }

    it("should carry the tools it is given in its last cell, after a divider", async () => {
        // Act
        const { container } = await render('<cc-metrics-bar><button type="button" barTools>Center map</button></cc-metrics-bar>', {
            imports: [MetricsBarComponent],
            providers: barProviders()
        })

        // Assert
        const toolsCell = container.querySelector("cc-metrics-bar > cc-bar-tools-cell")
        expect(toolsCell.textContent).toContain("Center map")
        expect(toolsCell.nextElementSibling).toBeNull()
        expect(toolsCell.previousElementSibling.tagName).toBe("CC-BAR-DIVIDER")
    })

    it("should open with the layout cell, inside the bar", async () => {
        // Act
        const { fixture } = await setup()

        // Assert
        expect(fixture.nativeElement.firstElementChild.tagName).toBe("CC-LAYOUT-CELL")
    })

    it("should render scenario, area, height, color and labels segments by default", async () => {
        await setup()

        expect(screen.getByTestId("metric-segment-scenario")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-area")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-height")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-color")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-labels")).not.toBeNull()
        expect(screen.queryByTestId("metric-segment-edges")).toBeNull()
        expect(screen.getByTestId("metrics-bar-layout-cell")).not.toBeNull()
    })

    it("should leave out height, edges and labels while the sunburst is shown", async () => {
        // Arrange & Act
        await setup({ hasEdgeMetric: true, isRadialLayout: true })

        // Assert
        expect(screen.getByTestId("metric-segment-area")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-color")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-scenario")).not.toBeNull()
        expect(screen.queryByTestId("metric-segment-height")).toBeNull()
        expect(screen.queryByTestId("metric-segment-edges")).toBeNull()
        expect(screen.queryByTestId("metric-segment-labels")).toBeNull()
    })

    it("should show the folders card in the radial layouts", async () => {
        // Arrange & Act
        await setup({ isRadialLayout: true })

        // Assert
        expect(screen.getByTestId("metric-segment-folders")).not.toBeNull()
    })

    it("should leave out the folders card on the 3D map", async () => {
        // Arrange & Act
        await setup()

        // Assert
        expect(screen.queryByTestId("metric-segment-folders")).toBeNull()
    })

    it("should leave out the folders card in delta state", async () => {
        // Arrange & Act
        await setup({ isDelta: true, isRadialLayout: true })

        // Assert
        expect(screen.queryByTestId("metric-segment-folders")).toBeNull()
    })

    it("should keep the layout cell on the bar while the sunburst is shown", async () => {
        // Arrange & Act
        await setup({ isRadialLayout: true })

        // Assert
        expect(screen.getByTestId("metrics-bar-layout-cell")).not.toBeNull()
    })

    it("should swap color metric segment for color settings segment in delta state", async () => {
        await setup({ isDelta: true })

        expect(screen.queryByTestId("metric-segment-color")).toBeNull()
        expect(screen.getByTestId("metric-segment-color-settings")).not.toBeNull()
    })

    it("should render edges segment when edge metric data is present", async () => {
        await setup({ hasEdgeMetric: true })

        expect(screen.getByTestId("metric-segment-edges")).not.toBeNull()
    })

    describe("with too little free map for the full bar", () => {
        const NARROW_FREE_MAP_PX = 236
        let restoreElementSize: () => void

        beforeEach(() => {
            stubResizeObserver()
            restoreElementSize = stubElementSize(() => ({ width: NARROW_FREE_MAP_PX, height: 0 }))
        })

        afterEach(() => restoreElementSize())

        async function setupCompact(options: Parameters<typeof barProviders>[0] = {}) {
            const rendered = await render('<cc-metrics-bar><button type="button" barTools>Center map</button></cc-metrics-bar>', {
                imports: [MetricsBarComponent],
                providers: barProviders(options)
            })
            reportResize()
            rendered.fixture.detectChanges()
            return rendered
        }

        function compactButtonNames(container: Element) {
            return [...container.querySelectorAll("cc-compact-bar-button button")].map(button => button.getAttribute("aria-label"))
        }

        it("should show one icon button per cell, in today's order, instead of the cards", async () => {
            // Act
            const { container } = await setupCompact({ hasEdgeMetric: true })

            // Assert
            expect(container.querySelector("cc-metrics-bar").getAttribute("data-compact")).toBe("true")
            expect(container.querySelector("cc-axis-card")).toBeNull()
            expect(compactButtonNames(container)).toEqual([
                "Layout · Squarified TreeMap",
                "Area · rloc",
                "Height · mcc",
                "Color · mcc",
                "Edges",
                "Labels · label settings",
                expect.stringMatching(/^Scenarios · \d+ available$/)
            ])
        })

        it("should place the metric buttons in two rows, the link beside Height and Color", async () => {
            // Act
            await setupCompact({ hasEdgeMetric: true })

            // Assert
            const metricCells = screen.getByTestId("metrics-bar-metric-cells")
            expect(metricCells.classList).toContain("grid-rows-2")
            expect(metricCells.classList).toContain("grid-flow-col")
            expect(within(metricCells).getByTestId("metric-segment-area-compact").parentElement.className).toContain(
                "col-start-1 row-start-1"
            )
            expect(within(metricCells).getByTestId("metric-segment-edges-compact").parentElement.className).toContain(
                "col-start-1 row-start-2"
            )
            expect(within(metricCells).getByTestId("metric-segment-height-compact").parentElement.className).toContain(
                "col-start-2 row-start-1"
            )
            expect(within(metricCells).getByTestId("metric-segment-color-compact").parentElement.className).toContain(
                "col-start-2 row-start-2"
            )
            expect(metricCells.querySelector("cc-link-color-height-button").className).toContain("row-span-2")
        })

        it("should leave the Edges slot empty for a map without edges", async () => {
            // Act
            await setupCompact()

            // Assert
            expect(screen.queryByTestId("metric-segment-edges-compact")).toBeNull()
            expect(screen.getByTestId("metric-segment-color-compact").parentElement.className).toContain("col-start-2 row-start-2")
        })

        it("should show Folders instead of Height and no link in a radial layout", async () => {
            // Act
            const { container } = await setupCompact({ hasEdgeMetric: true, isRadialLayout: true })

            // Assert
            expect(screen.getByTestId("metric-segment-folders-compact")).not.toBeNull()
            expect(screen.queryByTestId("metric-segment-height-compact")).toBeNull()
            expect(screen.queryByTestId("metric-segment-edges-compact")).toBeNull()
            expect(screen.queryByTestId("metric-segment-labels-compact")).toBeNull()
            expect(container.querySelector("cc-link-color-height-button")).toBeNull()
        })

        it("should open the delta colours from the Color button in delta mode", async () => {
            // Act
            await setupCompact({ isDelta: true })

            // Assert
            const colorButton = screen.getByRole("button", { name: "Color · delta colours" })
            expect(colorButton.getAttribute("popovertarget")).toBe("metric-settings-popover-color-delta")
        })

        it("should give the tools the compact size", async () => {
            // Act
            await setupCompact()

            // Assert
            expect(screen.getByRole("toolbar", { name: "View tools" }).classList).toContain("[&_.btn]:size-7")
        })
    })
})
