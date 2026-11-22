import { TestBed } from "@angular/core/testing"
import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { of } from "rxjs"
import { CodeMapNode, PrimaryMetrics } from "../../../../model/codeCharta.model"
import { primaryMetricNamesSelector } from "../../../../renderer/renderModel/primaryMetrics/primaryMetricNames.selector"
import { attributeTypesSelector } from "../../../../renderer/renderModel/renderModel.facade"
import { defaultState } from "../../../../stores/rootStore/state.manager"
import { NodeSelectionService } from "../../services/nodeSelection.service"
import { injectMetricMetaText } from "./injectMetricMetaText"

const metricNames = { areaMetric: "rloc", heightMetric: "mcc", colorMetric: "coverage", edgeMetric: "avgCommits" }
const FOLDER: Partial<CodeMapNode> = { children: [{} as CodeMapNode], attributes: { rloc: 1420, mcc: 393, coverage: 80 } }

function metaTextOf(node: Partial<CodeMapNode> | undefined, metricFor: keyof PrimaryMetrics) {
    TestBed.configureTestingModule({
        providers: [
            provideMockStore({
                initialState: defaultState,
                selectors: [
                    { selector: primaryMetricNamesSelector, value: metricNames },
                    { selector: attributeTypesSelector, value: { nodes: { coverage: "relative" }, edges: {} } }
                ]
            }),
            { provide: State, useValue: { getValue: () => defaultState } },
            { provide: NodeSelectionService, useValue: { createNodeObservable: () => of(node) } }
        ]
    })
    const metaText = TestBed.runInInjectionContext(() => injectMetricMetaText(() => metricFor))
    TestBed.tick()
    return metaText()
}

describe("injectMetricMetaText", () => {
    it("should give a folder's total with its attribute type", () => {
        // Act
        const text = metaTextOf(FOLDER, "areaMetric")

        // Assert
        expect(text).toBe(`Σ ${(1420).toLocaleString()}`)
    })

    it("should mark a relative metric by its median sign", () => {
        // Act
        const text = metaTextOf(FOLDER, "colorMetric")

        // Assert
        expect(text).toBe("x͂ 80")
    })

    it("should leave out the attribute type for a file", () => {
        // Act
        const text = metaTextOf({ attributes: { mcc: 12 } }, "heightMetric")

        // Assert
        expect(text).toBe("12")
    })

    it("should keep a positive delta's sign", () => {
        // Act
        const text = metaTextOf({ attributes: { mcc: 12 }, deltas: { mcc: 3 } }, "heightMetric")

        // Assert
        expect(text).toBe("12 Δ+3")
    })

    it("should keep a negative delta's sign", () => {
        // Act
        const text = metaTextOf({ attributes: { mcc: 12 }, deltas: { mcc: -3 } }, "heightMetric")

        // Assert
        expect(text).toBe(`12 Δ${(-3).toLocaleString()}`)
    })

    it("should be empty while no node is shown", () => {
        // Act
        const text = metaTextOf(undefined, "areaMetric")

        // Assert
        expect(text).toBeNull()
    })
})
