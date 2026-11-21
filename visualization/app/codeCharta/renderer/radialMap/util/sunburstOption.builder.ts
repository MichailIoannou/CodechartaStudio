import { Border, radialPieceBorderColor } from "./radialChartStyle"
import { buildRadialPiecesOption } from "./radialPiecesOption"
import { RadialOptionInputs, RadialShape } from "./radialShape"
import { layOutSunburst } from "./sunburstLayout"

const SEGMENT_BORDER_WIDTH_PX = 1

export function sunburstShape(maxRingCount: number): RadialShape {
    return { visibleDepth: maxRingCount, buildOption: inputs => buildSunburstOption(inputs, maxRingCount) }
}

export function buildSunburstOption(inputs: RadialOptionInputs, maxRingCount: number) {
    const placements = layOutSunburst(inputs.centre, maxRingCount)
    const border: Border = { color: radialPieceBorderColor(), widthPx: SEGMENT_BORDER_WIDTH_PX }
    return buildRadialPiecesOption(inputs, placements, { border, focus: "ancestors" })
}
