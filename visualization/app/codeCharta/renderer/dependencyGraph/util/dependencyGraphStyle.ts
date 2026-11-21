import { DEPENDENCY_EDGE_TYPES, DependencyEdgeColors, DependencyEdgeType, LineStyleMeaning } from "../../../model/dependencyGraph.model"
import { activeRenderPalette } from "../../../util/theme/activeTheme"
import { isDashedEdgeType } from "./lineStyle"

export function textColor(): string {
    return activeRenderPalette().dependencyGraph.text
}

export function selectedColor(): string {
    return activeRenderPalette().dependencyGraph.selected
}

export function hoveredColor(): string {
    return activeRenderPalette().dependencyGraph.hovered
}

export function folderStroke(): string {
    return activeRenderPalette().dependencyGraph.folderStroke
}

export function closedFolderFill(): string {
    return activeRenderPalette().dependencyGraph.closedFolderFill
}

export function closedFolderStroke(): string {
    return activeRenderPalette().dependencyGraph.closedFolderStroke
}

export function packageStroke(): string {
    return activeRenderPalette().dependencyGraph.packageStroke
}

export function closedPackageFill(): string {
    return activeRenderPalette().dependencyGraph.closedPackageFill
}

export function closedPackageStroke(): string {
    return activeRenderPalette().dependencyGraph.closedPackageStroke
}

export function fileFill(): string {
    return activeRenderPalette().dependencyGraph.fileFill
}

export function declarationFill(): string {
    return activeRenderPalette().dependencyGraph.declarationFill
}

export function fileStroke(): string {
    return activeRenderPalette().dependencyGraph.fileStroke
}

export function openFileFill(): string {
    return activeRenderPalette().dependencyGraph.openFileFill
}

export function quietBadgeColor(): string {
    return activeRenderPalette().dependencyGraph.quietBadge
}

export function levelSeparatorColor(): string {
    return activeRenderPalette().dependencyGraph.levelSeparator
}

export function cycleMarkColor(): string {
    return activeRenderPalette().dependencyGraph.cycleMark
}

export function badgeContrastColor(): string {
    return activeRenderPalette().dependencyGraph.badgeContrast
}

export const HOVERED_LINE_WIDTH_PX = 2
export const CORNER_RADIUS_PX = 4

export const EDGE_TYPE_LABELS: Record<DependencyEdgeType, string> = {
    regular: "Dependency",
    cyclic: "In a cycle",
    feedbackContainerLevel: "Points upward",
    feedbackLeafLevel: "Points upward and closes a cycle"
}

export interface EdgeLegendEntry {
    type: DependencyEdgeType
    label: string
    color: string
    /** The colour the reader gave the type, which is drawn only while nothing else tells the type apart. */
    ownColor: string
    isDashed: boolean
}

/** While the dashes tell the edge types apart, the upward edge that closes a cycle is the solid one in the colour
 * of the upward edges, as it always was. Once the dashes tell the kind of use, only a colour of its own can. */
export function edgeColorsAsDrawn(edgeColors: DependencyEdgeColors, lineStyleShows: LineStyleMeaning): DependencyEdgeColors {
    return lineStyleShows === "usage" ? edgeColors : { ...edgeColors, feedbackLeafLevel: edgeColors.feedbackContainerLevel }
}

export function edgeLegend(edgeColors: DependencyEdgeColors, lineStyleShows: LineStyleMeaning): EdgeLegendEntry[] {
    const drawn = edgeColorsAsDrawn(edgeColors, lineStyleShows)
    return DEPENDENCY_EDGE_TYPES.map(type => ({
        type,
        label: EDGE_TYPE_LABELS[type],
        color: drawn[type],
        ownColor: edgeColors[type],
        isDashed: isDashedEdgeType(type, lineStyleShows)
    }))
}

export const DIMMED_OPACITY = 0.12
export const MISSED_BY_SEARCH_OPACITY = 0.3
export const FOUND_OPACITY = 1

/** How much of a see-through folder's fill remains, so what lies behind it stays readable. */
const SEE_THROUGH_OPACITY = 0.65
const RGB_OFFSETS_IN_HEX_COLOR = [1, 3, 5]
const HEX_DIGITS_PER_CHANNEL = 2
const HEX_RADIX = 16

export function seeThrough(hexColor: string): string {
    const [red, green, blue] = RGB_OFFSETS_IN_HEX_COLOR.map(start =>
        Number.parseInt(hexColor.slice(start, start + HEX_DIGITS_PER_CHANNEL), HEX_RADIX)
    )
    return `rgba(${red}, ${green}, ${blue}, ${SEE_THROUGH_OPACITY})`
}

export function folderFill(depth: number): string {
    return fillAtDepth(activeRenderPalette().dependencyGraph.folderFillsByDepth, depth)
}

export function packageFill(depth: number): string {
    return fillAtDepth(activeRenderPalette().dependencyGraph.packageFillsByDepth, depth)
}

function fillAtDepth(fillsByDepth: readonly string[], depth: number): string {
    return fillsByDepth[Math.min(depth, fillsByDepth.length - 1)]
}
