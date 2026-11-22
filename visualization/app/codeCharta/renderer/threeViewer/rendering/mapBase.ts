import { LayoutAlgorithm } from "../../../model/codeCharta.model"

/** How far the root floor reaches below the ground, in map units; a folder floor is 2 high. */
export const MAP_BASE_DEPTH = 48

/** In the treemap only the root floor's bottom lies on the ground; this is the slack for float positions. */
export const GROUND_LEVEL_TOLERANCE = 0.01

// The street layouts stand streets and houses on the ground as well, and have no floor under the whole map.
export function mapBaseDepthFor(layoutAlgorithm: LayoutAlgorithm): number {
    return layoutAlgorithm === LayoutAlgorithm.SquarifiedTreeMap ? MAP_BASE_DEPTH : 0
}

export function isOnGround(height: number): boolean {
    return height < GROUND_LEVEL_TOLERANCE
}
