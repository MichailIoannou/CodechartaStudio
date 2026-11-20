import { render } from "@testing-library/angular"
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
        expect(path.getAttribute("class")).toBe("text-accent")
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
        expect(dot.getAttribute("class")).toBe("text-info")
    })

    it("should draw HEAD as a ring with a second outer ring", async () => {
        // Arrange & Act
        const { container, getByTestId } = await render(CommitGraphCellComponent, { inputs: { row: aRow(), isHead: true } })

        // Assert
        expect(container.querySelectorAll("circle")).toHaveLength(2)
        expect(getByTestId("graph-head-ring").getAttribute("class")).toBe("fill-base-100 text-primary")
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

describe("laneColorClass", () => {
    it("should cycle through the eight lane colours with the muted text colour last", () => {
        // Act
        const classes = Array.from({ length: 9 }, (_, color) => laneColorClass(color))

        // Assert
        expect(classes.slice(7)).toEqual(["text-base-content/60", "text-primary"])
    })
})
