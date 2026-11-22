import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { render, screen } from "@testing-library/angular"
import { BehaviorSubject } from "rxjs"
import { ColorMode } from "../../../../model/codeCharta.model"
import { defaultState } from "../../../../stores/rootStore/state.manager"
import { Scenario, ScenariosService } from "../../../scenarios/facade"
import { provideCompactBar } from "../../metricsBar.mocks"
import { LabelsScenariosSegmentComponent } from "./labelsScenariosSegment.component"

const createScenario = (name: string, id = "id-1"): Scenario => ({
    id,
    name,
    createdAt: 0,
    isBuiltIn: true,
    settings: {
        areaMetric: "rloc",
        heightMetric: "rloc",
        colorMetric: "rloc",
        colorRange: { from: 1, to: 10 },
        colorMode: ColorMode.weightedGradient
    }
})

describe("LabelsScenariosSegmentComponent", () => {
    let scenariosSubject: BehaviorSubject<Scenario[]>
    let scenariosService: { scenarios$: BehaviorSubject<Scenario[]>; loadScenarios: jest.Mock }

    async function setup(initialScenarios: Scenario[] = [], isCompact = false) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()

        scenariosSubject = new BehaviorSubject<Scenario[]>(initialScenarios)
        scenariosService = {
            scenarios$: scenariosSubject,
            loadScenarios: jest.fn().mockResolvedValue(undefined)
        }

        const renderResult = await render(LabelsScenariosSegmentComponent, {
            providers: [
                provideMockStore({ initialState: defaultState }),
                { provide: State, useValue: { getValue: () => defaultState } },
                { provide: ScenariosService, useValue: scenariosService },
                ...(isCompact ? [provideCompactBar()] : [])
            ]
        })
        return { ...renderResult, component: renderResult.fixture.componentInstance }
    }

    it("should render the labels and scenario segment test ids and child controls", async () => {
        // Arrange & Act
        await setup()

        // Assert
        expect(screen.getByTestId("metric-segment-labels")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-scenario")).not.toBeNull()
        expect(screen.getByTestId("metric-segment-scenario-menu")).not.toBeNull()
    })

    it("should load scenarios on init", async () => {
        // Arrange & Act
        await setup()

        // Assert
        expect(scenariosService.loadScenarios).toHaveBeenCalled()
    })

    it("should pluralize the scenarios count label for zero and many scenarios", async () => {
        // Arrange & Act
        const { component, fixture } = await setup([])

        // Assert
        expect(component.scenariosCountLabel()).toBe("0 scenarios available")

        // Act
        scenariosSubject.next([createScenario("A", "a"), createScenario("B", "b")])
        fixture.detectChanges()

        // Assert
        expect(component.scenariosCountLabel()).toBe("2 scenarios available")
    })

    it("should use the singular form of the count label for exactly one scenario", async () => {
        // Arrange & Act
        const { component } = await setup([createScenario("Only", "only")])

        // Assert
        expect(component.scenariosCountLabel()).toBe("1 scenario available")
    })

    it("should set and clear the apply target when handling apply requests", async () => {
        // Arrange
        const { component } = await setup()
        const scenario = createScenario("Apply Me", "apply")
        const metricData = { nodeMetricData: [], edgeMetricData: [] }

        // Act
        component.handleApplyRequested({ scenario, metricData })

        // Assert
        expect(component.applyTarget()).toEqual({ scenario, metricData })

        // Act
        component.handleApplyClosed()

        // Assert
        expect(component.applyTarget()).toBeNull()
    })

    it("should open the save and list dialogs through their view children", async () => {
        // Arrange
        const { component } = await setup()
        const saveOpenSpy = jest.spyOn(component.saveDialog(), "open")
        const listOpenSpy = jest.spyOn(component.listDialog(), "open")

        // Act
        component.openSaveDialog()
        component.openScenarioList()

        // Assert
        expect(saveOpenSpy).toHaveBeenCalled()
        expect(listOpenSpy).toHaveBeenCalled()
    })

    it("should show the labels icon on the label settings button", async () => {
        // Act
        await setup()

        // Assert
        const settingsButton = screen.getByRole("button", { name: "Label settings" })
        expect(settingsButton.getAttribute("popovertarget")).toBe("metric-settings-popover-labels")
        expect(settingsButton.querySelector(".fa-tags")).not.toBeNull()
    })

    it("should open the scenarios menu from the bookmark", async () => {
        // Act
        const { container } = await setup([createScenario("A", "a")])

        // Assert
        const bookmark = screen.getByRole("button", { name: "Scenarios" })
        expect(bookmark.querySelector(".fa-bookmark")).not.toBeNull()
        const menu = container.querySelector(`#${bookmark.getAttribute("popovertarget")}`)
        expect(menu.textContent).toContain("Open saved scenarios (1)")
    })

    it("should keep its label rows whole and let only the scenario count shorten", async () => {
        // Arrange
        jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return { width: this.hasAttribute("data-label-row") ? 88 : 0 } as DOMRect
        })

        // Act
        const { fixture } = await setup([createScenario("A", "a")])

        // Assert
        expect(fixture.nativeElement.style.minWidth).toBe("88px")
        expect(screen.getByTitle("Open saved scenarios").classList).toContain("truncate")
        jest.restoreAllMocks()
    })

    describe("in the compact bar", () => {
        it("should stack the Labels and Scenarios buttons", async () => {
            // Act
            const { fixture } = await setup([createScenario("A", "a"), createScenario("B", "b")], true)

            // Assert
            const labels = screen.getByTestId("metric-segment-labels-compact")
            const scenarios = screen.getByTestId("metric-segment-scenario-compact")
            expect(fixture.nativeElement.classList).toContain("grid-rows-2")
            expect(fixture.nativeElement.style.minWidth).toBe("")
            expect(labels.getAttribute("aria-label")).toBe("Labels · label settings")
            expect(labels.getAttribute("popovertarget")).toBe("metric-settings-popover-labels")
            expect(scenarios.getAttribute("aria-label")).toBe("Scenarios · 2 available")
            expect(scenarios.parentElement.className).toContain("row-start-2")
        })

        it("should open the same scenarios menu as the full bar's bookmark", async () => {
            // Act
            await setup([], true)

            // Assert
            expect(screen.getByTestId("metric-segment-scenario-compact").getAttribute("popovertarget")).toBe(
                "metric-segment-scenarios-menu"
            )
        })
    })
})
