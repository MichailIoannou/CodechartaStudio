const LANE_COLOR_COUNT = 8
/** The colour of the line that joins the uncommitted changes to HEAD; never handed to a commit. */
export const WORKING_TREE_COLOR = -1

export interface GraphLayoutState {
    /** `lanes[i]` is the SHA lane `i` waits for, or null when the lane is free. */
    lanes: readonly (string | null)[]
    laneColors: readonly number[]
    nextColor: number
}

interface GraphEdge {
    fromLane: number
    toLane: number
    color: number
}

/** One commit's row: `incoming` ends at the dot, `outgoing` starts at it, `passing` crosses the row. */
export interface GraphRow {
    sha: string
    lane: number
    color: number
    incoming: readonly GraphEdge[]
    outgoing: readonly GraphEdge[]
    passing: readonly GraphEdge[]
    laneCount: number
}

export interface GraphCommit {
    sha: string
    parents: readonly string[]
}

export const EMPTY_GRAPH_STATE: GraphLayoutState = { lanes: [], laneColors: [], nextColor: 0 }

/** A state whose first lane waits for HEAD, so the uncommitted changes drawn above the list lead into it. */
export function stateWaitingForHead(headSha: string): GraphLayoutState {
    return { lanes: [headSha], laneColors: [WORKING_TREE_COLOR], nextColor: 0 }
}

/**
 * Lays out the commits in list order (children before parents), continuing from `state`. A commit keeps its
 * lane for its first parent, so a branch joins the line it forked from at the fork point.
 */
export function layoutGraph(commits: readonly GraphCommit[], state: GraphLayoutState): { rows: GraphRow[]; state: GraphLayoutState } {
    const layout = new LaneLayout(state)
    const rows = commits.map(commit => layout.place(commit))
    return { rows, state: layout.snapshot() }
}

class LaneLayout {
    private readonly lanes: (string | null)[]
    private readonly laneColors: number[]
    private nextColor: number

    constructor(state: GraphLayoutState) {
        this.lanes = [...state.lanes]
        this.laneColors = [...state.laneColors]
        this.nextColor = state.nextColor
    }

    place(commit: GraphCommit): GraphRow {
        const waiting = this.lanesWaitingFor(commit.sha)
        const lane = waiting.length > 0 ? waiting[0] : this.occupyFreeLane(commit.sha, this.takeColor())
        const color = this.colorForCommit(lane)
        const incoming = waiting.map(fromLane => ({ fromLane, toLane: lane, color: this.laneColors[fromLane] }))
        this.laneColors[lane] = color
        for (const freed of waiting.slice(1)) {
            this.lanes[freed] = null
        }
        const passing = this.occupiedLanes()
            .filter(other => other !== lane)
            .map(other => ({ fromLane: other, toLane: other, color: this.laneColors[other] }))
        const outgoing = this.connectParents(commit.parents, lane, color)
        const laneCount = Math.max(this.lanes.length, ...incoming.map(edge => edge.fromLane + 1))
        this.trimTrailingFreeLanes()
        return { sha: commit.sha, lane, color, incoming, outgoing, passing, laneCount }
    }

    snapshot(): GraphLayoutState {
        return { lanes: [...this.lanes], laneColors: [...this.laneColors], nextColor: this.nextColor }
    }

    private connectParents(parents: readonly string[], lane: number, color: number): GraphEdge[] {
        if (parents.length === 0) {
            this.lanes[lane] = null
            return []
        }
        this.lanes[lane] = parents[0]
        const firstParentEdge = { fromLane: lane, toLane: lane, color }
        const furtherParentEdges = parents.slice(1).map(parent => {
            const target =
                this.lanesWaitingFor(parent).find(candidate => candidate !== lane) ?? this.occupyFreeLane(parent, this.takeColor())
            return { fromLane: lane, toLane: target, color: this.laneColors[target] }
        })
        return [firstParentEdge, ...furtherParentEdges]
    }

    private colorForCommit(lane: number): number {
        const laneColor = this.laneColors[lane]
        return laneColor === WORKING_TREE_COLOR ? this.takeColor() : laneColor
    }

    private lanesWaitingFor(sha: string): number[] {
        const waiting: number[] = []
        this.lanes.forEach((waitedFor, index) => {
            if (waitedFor === sha) {
                waiting.push(index)
            }
        })
        return waiting
    }

    private occupiedLanes(): number[] {
        const occupied: number[] = []
        this.lanes.forEach((waitedFor, index) => {
            if (waitedFor !== null) {
                occupied.push(index)
            }
        })
        return occupied
    }

    private occupyFreeLane(sha: string, color: number): number {
        const free = this.lanes.indexOf(null)
        const lane = free === -1 ? this.lanes.length : free
        this.lanes[lane] = sha
        this.laneColors[lane] = color
        return lane
    }

    private takeColor(): number {
        const color = this.nextColor
        this.nextColor = (this.nextColor + 1) % LANE_COLOR_COUNT
        return color
    }

    private trimTrailingFreeLanes() {
        while (this.lanes.length > 0 && this.lanes.at(-1) === null) {
            this.lanes.pop()
            this.laneColors.pop()
        }
    }
}
