import { GraphEdge, GraphRow, WORKING_TREE_COLOR } from "./graphLayout"

const LANE_PITCH = 14
export const GRAPH_ROW_HEIGHT = 28
export const MAX_DRAWN_LANES = 24
const DOT_RADIUS = 4
const PADDING_X = 3
const ROW_MIDDLE = GRAPH_ROW_HEIGHT / 2
/** How far a curve's control points reach towards the dot, so the curve leaves the lane vertically. */
const CURVE_REACH = 10

interface GraphLine {
    path: string
    color: number
    isDashed: boolean
}

export interface GraphRowGeometry {
    width: number
    dot: { x: number; y: number; radius: number; color: number } | null
    lines: GraphLine[]
    /** Lanes beyond the drawn ones, shown as `+n`. */
    hiddenLaneCount: number
}

export function graphWidthFor(laneCount: number): number {
    return 2 * PADDING_X + Math.min(laneCount, MAX_DRAWN_LANES) * LANE_PITCH
}

export function laneX(lane: number): number {
    return PADDING_X + LANE_PITCH / 2 + lane * LANE_PITCH
}

export function rowGeometry(row: GraphRow): GraphRowGeometry {
    const isDrawn = (edge: GraphEdge) => edge.fromLane < MAX_DRAWN_LANES && edge.toLane < MAX_DRAWN_LANES
    const lines = [
        ...row.passing.filter(isDrawn).map(passingLine),
        ...row.incoming.filter(isDrawn).map(incomingLine),
        ...row.outgoing.filter(isDrawn).map(outgoingLine)
    ]
    const dot = row.lane < MAX_DRAWN_LANES ? { x: laneX(row.lane), y: ROW_MIDDLE, radius: DOT_RADIUS, color: row.color } : null
    return { width: graphWidthFor(row.laneCount), dot, lines, hiddenLaneCount: Math.max(0, row.laneCount - MAX_DRAWN_LANES) }
}

/** The uncommitted changes sit in lane 0 (see `stateWaitingForHead`) with a dashed line down towards HEAD. */
export function workingTreeGeometry(): GraphRowGeometry {
    const line = { path: verticalPath(laneX(0), ROW_MIDDLE, GRAPH_ROW_HEIGHT), color: WORKING_TREE_COLOR, isDashed: true }
    const dot = { x: laneX(0), y: ROW_MIDDLE, radius: DOT_RADIUS, color: WORKING_TREE_COLOR }
    return { width: graphWidthFor(1), dot, lines: [line], hiddenLaneCount: 0 }
}

function passingLine(edge: GraphEdge): GraphLine {
    return lineOf(edge, verticalPath(laneX(edge.fromLane), 0, GRAPH_ROW_HEIGHT))
}

function incomingLine(edge: GraphEdge): GraphLine {
    const fromX = laneX(edge.fromLane)
    const toX = laneX(edge.toLane)
    const path =
        fromX === toX
            ? verticalPath(toX, 0, ROW_MIDDLE)
            : `M${fromX} 0 C${fromX} ${CURVE_REACH} ${toX} ${ROW_MIDDLE - CURVE_REACH} ${toX} ${ROW_MIDDLE}`
    return lineOf(edge, path)
}

function outgoingLine(edge: GraphEdge): GraphLine {
    const fromX = laneX(edge.fromLane)
    const toX = laneX(edge.toLane)
    const path =
        fromX === toX
            ? verticalPath(fromX, ROW_MIDDLE, GRAPH_ROW_HEIGHT)
            : `M${fromX} ${ROW_MIDDLE} C${fromX} ${ROW_MIDDLE + CURVE_REACH} ${toX} ${GRAPH_ROW_HEIGHT - CURVE_REACH} ${toX} ${GRAPH_ROW_HEIGHT}`
    return lineOf(edge, path)
}

function verticalPath(x: number, fromY: number, toY: number): string {
    return `M${x} ${fromY} L${x} ${toY}`
}

function lineOf(edge: GraphEdge, path: string): GraphLine {
    return { path, color: edge.color, isDashed: edge.color === WORKING_TREE_COLOR }
}
