import { BAR_GAP_PX, METRICS_BAR_HEIGHT_CSS_VARIABLE } from "../../../util/barLayout"

const LEGEND_BARS_OFFSET = "var(--cc-bottom-bar-height, 32px) + var(--cc-file-extension-bar-height, 17px)"

/** The Legend tool sits in the floating bar, so the panel it opens keeps clear of that bar. */
export const LEGEND_ABOVE_FLOATING_BAR = `calc(${LEGEND_BARS_OFFSET} + var(${METRICS_BAR_HEIGHT_CSS_VARIABLE}, 0px) + ${2 * BAR_GAP_PX}px)`
