import {
    EMPTY_GRAPH_STATE,
    GraphCommit,
    GraphLayoutState,
    GraphRow,
    layoutGraph,
    stateWaitingForHead,
    WORKING_TREE_COLOR
} from "./graphLayout"

function commit(sha: string, ...parents: string[]): GraphCommit {
    return { sha, parents }
}

function lanesOf(rows: GraphRow[]): Record<string, number> {
    return Object.fromEntries(rows.map(row => [row.sha, row.lane]))
}

function rowOf(rows: GraphRow[], sha: string): GraphRow {
    return rows.find(row => row.sha === sha) as GraphRow
}

/** main: A ← B ← M (merge of B and F), feature: F1 ← F2 off A, plus later work on top. */
const TWELVE_COMMITS: GraphCommit[] = [
    commit("l", "k"),
    commit("k", "j", "i"),
    commit("j", "h"),
    commit("i", "g"),
    commit("h", "f", "e"),
    commit("g", "d"),
    commit("f", "c"),
    commit("e", "c"),
    commit("d", "b"),
    commit("c", "b"),
    commit("b", "a"),
    commit("a")
]

describe("layoutGraph", () => {
    it("should put a linear history in lane 0", () => {
        // Arrange
        const commits = [commit("c", "b"), commit("b", "a"), commit("a")]

        // Act
        const { rows, state } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(lanesOf(rows)).toEqual({ c: 0, b: 0, a: 0 })
        expect(rows.map(row => row.laneCount)).toEqual([1, 1, 1])
        expect(rowOf(rows, "b").incoming).toEqual([{ fromLane: 0, toLane: 0, color: 0 }])
        expect(rowOf(rows, "b").outgoing).toEqual([{ fromLane: 0, toLane: 0, color: 0 }])
        expect(rowOf(rows, "a").outgoing).toEqual([])
        expect(state.lanes).toEqual([])
    })

    it("should open a second lane for a branch tip and join it at the fork", () => {
        // Arrange
        const commits = [commit("main2", "base"), commit("feature", "base"), commit("base")]

        // Act
        const { rows } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(lanesOf(rows)).toEqual({ main2: 0, feature: 1, base: 0 })
        expect(rowOf(rows, "feature").passing).toEqual([{ fromLane: 0, toLane: 0, color: 0 }])
        expect(rowOf(rows, "feature").outgoing).toEqual([{ fromLane: 1, toLane: 1, color: 1 }])
        expect(rowOf(rows, "base").incoming).toEqual([
            { fromLane: 0, toLane: 0, color: 0 },
            { fromLane: 1, toLane: 0, color: 1 }
        ])
        expect(rowOf(rows, "base").laneCount).toBe(2)
    })

    it("should keep the first parent of a merge in its lane and give the second a new lane", () => {
        // Arrange
        const commits = [commit("merge", "main1", "side1"), commit("main1", "base"), commit("side1", "base"), commit("base")]

        // Act
        const { rows } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(rowOf(rows, "merge").outgoing).toEqual([
            { fromLane: 0, toLane: 0, color: 0 },
            { fromLane: 0, toLane: 1, color: 1 }
        ])
        expect(lanesOf(rows)).toEqual({ merge: 0, main1: 0, side1: 1, base: 0 })
    })

    it("should give an octopus merge one lane per extra parent", () => {
        // Arrange
        const commits = [commit("octopus", "p1", "p2", "p3"), commit("p1"), commit("p2"), commit("p3")]

        // Act
        const { rows } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(rowOf(rows, "octopus").outgoing.map(edge => edge.toLane)).toEqual([0, 1, 2])
        expect(new Set(rowOf(rows, "octopus").outgoing.map(edge => edge.color)).size).toBe(3)
        expect(lanesOf(rows)).toEqual({ octopus: 0, p1: 0, p2: 1, p3: 2 })
    })

    it("should lead a merge into the lane that already waits for its second parent", () => {
        // Arrange
        const commits = [commit("tip", "shared"), commit("merge", "main1", "shared"), commit("main1"), commit("shared")]

        // Act
        const { rows } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(rowOf(rows, "merge").lane).toBe(1)
        expect(rowOf(rows, "merge").outgoing).toEqual([
            { fromLane: 1, toLane: 1, color: 1 },
            { fromLane: 1, toLane: 0, color: 0 }
        ])
    })

    it("should reuse a freed lane", () => {
        // Arrange
        const commits = [commit("a2", "a1"), commit("b2", "base"), commit("a1", "base"), commit("base"), commit("other")]

        // Act
        const { rows } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(rowOf(rows, "base").lane).toBe(0)
        expect(rowOf(rows, "other").lane).toBe(0)
        expect(rowOf(rows, "other").laneCount).toBe(1)
    })

    it("should end the lane at a root and keep a second root in its own lane", () => {
        // Arrange
        const commits = [commit("merge", "rootA", "rootB"), commit("rootA"), commit("rootB")]

        // Act
        const { rows, state } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(rowOf(rows, "rootA").outgoing).toEqual([])
        expect(rowOf(rows, "rootA").passing).toEqual([{ fromLane: 1, toLane: 1, color: 1 }])
        expect(rowOf(rows, "rootB").lane).toBe(1)
        expect(rowOf(rows, "rootB").passing).toEqual([])
        expect(state.lanes).toEqual([])
    })

    it("should keep lanes open when the parents are not loaded yet", () => {
        // Arrange
        const commits = [commit("merge", "p1", "p2")]

        // Act
        const { rows, state } = layoutGraph(commits, EMPTY_GRAPH_STATE)

        // Assert
        expect(rows[0].outgoing).toHaveLength(2)
        expect(state.lanes).toEqual(["p1", "p2"])
    })

    it("should give the same rows for a list as for the list split into two pages", () => {
        // Arrange
        const whole = layoutGraph(TWELVE_COMMITS, EMPTY_GRAPH_STATE)

        for (let splitAt = 0; splitAt <= TWELVE_COMMITS.length; splitAt++) {
            // Act
            const first = layoutGraph(TWELVE_COMMITS.slice(0, splitAt), EMPTY_GRAPH_STATE)
            const second = layoutGraph(TWELVE_COMMITS.slice(splitAt), first.state)

            // Assert
            expect([...first.rows, ...second.rows]).toEqual(whole.rows)
            expect(second.state).toEqual(whole.state)
        }
    })

    it("should keep the state for an empty page", () => {
        // Arrange
        const state: GraphLayoutState = { lanes: ["a", null, "b"], laneColors: [0, 1, 2], nextColor: 3 }

        // Act
        const result = layoutGraph([], state)

        // Assert
        expect(result.rows).toEqual([])
        expect(result.state).toEqual(state)
    })

    it("should not mutate the input state", () => {
        // Arrange
        const state: GraphLayoutState = Object.freeze({
            lanes: Object.freeze(["c", "x"]),
            laneColors: Object.freeze([0, 1]),
            nextColor: 2
        })

        // Act
        layoutGraph([commit("c", "b", "y"), commit("x")], state)

        // Assert
        expect(state).toEqual({ lanes: ["c", "x"], laneColors: [0, 1], nextColor: 2 })
    })

    it("should cycle through the lane colours", () => {
        // Arrange
        const tips = Array.from({ length: 9 }, (_, index) => commit(`tip${index}`))

        // Act
        const { rows } = layoutGraph(tips, EMPTY_GRAPH_STATE)

        // Assert
        expect(rows.map(row => row.color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0])
    })

    it("should lead the uncommitted changes into HEAD and give HEAD a lane colour of its own", () => {
        // Arrange
        const commits = [commit("other", "head"), commit("head", "base"), commit("base")]

        // Act
        const { rows } = layoutGraph(commits, stateWaitingForHead("head"))

        // Assert
        expect(rowOf(rows, "other").lane).toBe(1)
        expect(rowOf(rows, "other").passing).toEqual([{ fromLane: 0, toLane: 0, color: WORKING_TREE_COLOR }])
        expect(rowOf(rows, "head").lane).toBe(0)
        expect(rowOf(rows, "head").color).not.toBe(WORKING_TREE_COLOR)
        expect(rowOf(rows, "head").incoming).toContainEqual({ fromLane: 0, toLane: 0, color: WORKING_TREE_COLOR })
    })
})
