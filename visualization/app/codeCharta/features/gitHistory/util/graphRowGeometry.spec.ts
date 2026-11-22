import { GraphRow, WORKING_TREE_COLOR } from "./graphLayout"
import { graphWidthFor, laneX, MAX_DRAWN_LANES, rowGeometry, workingTreeGeometry } from "./graphRowGeometry"

function aRow(overrides: Partial<GraphRow> = {}): GraphRow {
    return { sha: "c".repeat(40), lane: 0, color: 0, incoming: [], outgoing: [], passing: [], laneCount: 1, ...overrides }
}

describe("rowGeometry", () => {
    it("should draw a passing lane straight from the top to the bottom edge", () => {
        // Arrange
        const row = aRow({ laneCount: 2, passing: [{ fromLane: 1, toLane: 1, color: 3 }] })

        // Act
        const { lines } = rowGeometry(row)

        // Assert
        expect(lines).toEqual([{ path: `M${laneX(1)} 0 L${laneX(1)} 28`, color: 3, isDashed: false }])
    })

    it("should draw a curve between lanes for a merge and for a fork", () => {
        // Arrange
        const row = aRow({
            laneCount: 2,
            incoming: [{ fromLane: 1, toLane: 0, color: 1 }],
            outgoing: [{ fromLane: 0, toLane: 1, color: 2 }]
        })

        // Act
        const { lines } = rowGeometry(row)

        // Assert
        expect(lines.map(line => line.path)).toEqual(["M24 0 C24 10 10 4 10 14", "M10 14 C10 24 24 18 24 28"])
    })

    it("should draw straight halves in the commit's own lane", () => {
        // Arrange
        const row = aRow({ incoming: [{ fromLane: 0, toLane: 0, color: 0 }], outgoing: [{ fromLane: 0, toLane: 0, color: 0 }] })

        // Act
        const { lines } = rowGeometry(row)

        // Assert
        expect(lines.map(line => line.path)).toEqual(["M10 0 L10 14", "M10 14 L10 28"])
    })

    it("should put the dot in the commit's lane with the commit's colour", () => {
        // Arrange
        const row = aRow({ lane: 2, color: 5, laneCount: 3 })

        // Act
        const { dot, width } = rowGeometry(row)

        // Assert
        expect(dot).toEqual({ x: laneX(2), y: 14, radius: 4, color: 5 })
        expect(width).toBe(graphWidthFor(3))
    })

    it("should dash the line that leads the uncommitted changes into HEAD", () => {
        // Arrange
        const row = aRow({ incoming: [{ fromLane: 0, toLane: 0, color: WORKING_TREE_COLOR }] })

        // Act
        const { lines } = rowGeometry(row)

        // Assert
        expect(lines[0].isDashed).toBe(true)
    })

    it("should leave out lanes beyond the limit and count them", () => {
        // Arrange
        const laneCount = MAX_DRAWN_LANES + 3
        const passing = Array.from({ length: laneCount - 1 }, (_, index) => ({ fromLane: index + 1, toLane: index + 1, color: 0 }))
        const row = aRow({ laneCount, passing })

        // Act
        const geometry = rowGeometry(row)

        // Assert
        expect(geometry.hiddenLaneCount).toBe(3)
        expect(geometry.lines).toHaveLength(MAX_DRAWN_LANES - 1)
        expect(geometry.width).toBe(graphWidthFor(MAX_DRAWN_LANES))
    })

    it("should draw no dot for a commit in a hidden lane", () => {
        // Arrange
        const row = aRow({ lane: MAX_DRAWN_LANES, laneCount: MAX_DRAWN_LANES + 1 })

        // Act
        const { dot } = rowGeometry(row)

        // Assert
        expect(dot).toBeNull()
    })
})

describe("workingTreeGeometry", () => {
    it("should draw a dashed hollow dot in lane 0 with a dashed line down to HEAD", () => {
        // Act
        const geometry = workingTreeGeometry()

        // Assert
        expect(geometry.dot).toEqual({ x: laneX(0), y: 14, radius: 4, color: WORKING_TREE_COLOR })
        expect(geometry.lines).toEqual([{ path: "M10 14 L10 28", color: WORKING_TREE_COLOR, isDashed: true }])
    })
})
