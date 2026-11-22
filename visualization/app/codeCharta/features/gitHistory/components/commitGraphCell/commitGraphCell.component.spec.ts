import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render } from "@testing-library/angular"
import type { ThemeDefinition } from "../../../../model/theme.model"
import { contrastRatio } from "../../../../util/theme/contrast"
import { THEMES } from "../../../../util/theme/themes"
import { GraphRow } from "../../util/graphLayout"
import { MAX_DRAWN_LANES } from "../../util/graphRowGeometry"
import { CommitGraphCellComponent, laneColorClass } from "./commitGraphCell.component"

function aRow(overrides: Partial<GraphRow> = {}): GraphRow {
    return { sha: "c".repeat(40), lane: 0, color: 0, incoming: [], outgoing: [], passing: [], laneCount: 1, ...overrides }
}

describe("CommitGraphCellComponent", () => {
    it("should draw a straight passing lane in its colour class", async () => {
        // Arrange & Act
        const { container } = await render(CommitGraphCellComponent, {
            inputs: { row: aRow({ laneCount: 2, passing: [{ fromLane: 1, toLane: 1, color: 2 }] }) }
        })

        // Assert
        const path = container.querySelector("path") as SVGPathElement
        expect(path.getAttribute("d")).toBe("M24 0 L24 28")
        expect(path.getAttribute("class")).toBe("text-(--cc-lane-3)")
        expect(path.getAttribute("stroke")).toBe("currentColor")
        expect(path.getAttribute("stroke-dasharray")).toBeNull()
    })

    it("should draw a curve between lanes", async () => {
        // Arrange & Act
        const { container } = await render(CommitGraphCellComponent, {
            inputs: { row: aRow({ laneCount: 2, outgoing: [{ fromLane: 0, toLane: 1, color: 1 }] }) }
        })

        // Assert
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M10 14 C10 24 24 18 24 28")
    })

    it("should put a filled dot in the commit's lane", async () => {
        // Arrange & Act
        const { container } = await render(CommitGraphCellComponent, { inputs: { row: aRow({ lane: 1, color: 3, laneCount: 2 }) } })

        // Assert
        const dot = container.querySelector("circle") as SVGCircleElement
        expect(dot.getAttribute("cx")).toBe("24")
        expect(dot.getAttribute("fill")).toBe("currentColor")
        expect(dot.getAttribute("class")).toBe("text-(--cc-lane-4)")
    })

    it("should draw HEAD as a ring with a second outer ring", async () => {
        // Arrange & Act
        const { container, getByTestId } = await render(CommitGraphCellComponent, { inputs: { row: aRow(), isHead: true } })

        // Assert
        expect(container.querySelectorAll("circle")).toHaveLength(2)
        expect(getByTestId("graph-head-ring").getAttribute("class")).toBe("fill-base-100 text-(--cc-lane-1)")
    })

    it("should draw the uncommitted changes as a dashed hollow circle with a dashed line", async () => {
        // Arrange & Act
        const { container, getByTestId } = await render(CommitGraphCellComponent, { inputs: { row: null } })

        // Assert
        expect(getByTestId("graph-working-tree-dot").getAttribute("stroke-dasharray")).toBe("2 2")
        expect(container.querySelector("path")?.getAttribute("stroke-dasharray")).toBe("3 2")
        expect(container.querySelector("path")?.getAttribute("class")).toBe("text-warning")
    })

    it("should show +n beyond the drawn lanes", async () => {
        // Arrange & Act
        const { container } = await render(CommitGraphCellComponent, { inputs: { row: aRow({ laneCount: MAX_DRAWN_LANES + 2 }) } })

        // Assert
        expect(container.textContent?.trim()).toBe("+2")
    })

    it("should show no count while every lane is drawn", async () => {
        // Arrange & Act
        const { container } = await render(CommitGraphCellComponent, { inputs: { row: aRow() } })

        // Assert
        expect(container.textContent?.trim()).toBe("")
    })
})

const STYLESHEET_PATH = resolve(__dirname, "../../../../../tailwind.css")
const FLAT_RULE = /([^{}]+)\{([^{}]*)\}/g
const LANE_VARIABLE = /--cc-lane-(\d): ([^;]+);/g
const LANE_COUNT = 8
const MIN_LANE_CONTRAST = 3

/** The lane colours a theme ends up with, in rule order, `var(--color-primary)` read from the theme's chrome. */
function laneColorsOf(theme: ThemeDefinition): string[] {
    const stylesheet = readFileSync(STYLESHEET_PATH, "utf8")
    const lanes: string[] = []
    for (const [, selector, body] of stylesheet.matchAll(FLAT_RULE)) {
        if (selector.includes(`[data-theme="${theme.id}"]`)) {
            for (const [, lane, value] of body.matchAll(LANE_VARIABLE)) {
                lanes[Number(lane) - 1] = value.trim() === "var(--color-primary)" ? theme.chrome.primary : value.trim()
            }
        }
    }
    return lanes
}

describe("laneColorClass", () => {
    it("should cycle through the eight lane variables of the theme", () => {
        // Act
        const classes = Array.from({ length: 9 }, (_, color) => laneColorClass(color))

        // Assert
        expect(classes).toEqual([...Array.from({ length: LANE_COUNT }, (_, lane) => `text-(--cc-lane-${lane + 1})`), "text-(--cc-lane-1)"])
    })

    it.each(
        THEMES.filter(theme => theme.colorScheme === "light").map(theme => [theme.id, theme] as const)
    )("should give the light theme %s eight lane colours readable at 3:1 on its surface", (_id, theme) => {
        // Act
        const lanes = laneColorsOf(theme)

        // Assert
        expect(lanes.filter(Boolean)).toHaveLength(LANE_COUNT)
        for (const lane of lanes) {
            expect(contrastRatio(lane, theme.chrome.base100)).toBeGreaterThanOrEqual(MIN_LANE_CONTRAST)
        }
    })

    it("should start the lanes of VS Light and Rider Day with their own primary", () => {
        // Arrange
        const ownPrimaryThemes = THEMES.filter(theme => theme.id === "vs-light" || theme.id === "rider-day")

        // Act
        const firstLanes = ownPrimaryThemes.map(theme => laneColorsOf(theme)[0])

        // Assert
        expect(firstLanes).toEqual(ownPrimaryThemes.map(theme => theme.chrome.primary))
    })
})
