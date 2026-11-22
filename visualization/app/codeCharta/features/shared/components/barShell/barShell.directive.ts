import { Directive } from "@angular/core"
import {
    BAR_GAP_PX,
    BOTTOM_BAR_HEIGHT_CSS_VARIABLE,
    DEFAULT_BOTTOM_BAR_HEIGHT_PX,
    DEFAULT_FILE_EXTENSION_BAR_HEIGHT_PX,
    FILE_EXTENSION_BAR_HEIGHT_CSS_VARIABLE
} from "../../../../util/barLayout"
import { BAR_INSET_LEFT_CSS_VARIABLE, BAR_INSET_RIGHT_CSS_VARIABLE, PANEL_ISLAND_MARGIN_PX } from "../../util/publishBarInset"

export const BAR_BOTTOM_ABOVE_BOTTOM_BAR = `calc(var(${BOTTOM_BAR_HEIGHT_CSS_VARIABLE}, ${DEFAULT_BOTTOM_BAR_HEIGHT_PX}px) + ${BAR_GAP_PX}px)`

export const BAR_BOTTOM_ABOVE_FILE_EXTENSION_BAR =
    `calc(var(${BOTTOM_BAR_HEIGHT_CSS_VARIABLE}, ${DEFAULT_BOTTOM_BAR_HEIGHT_PX}px)` +
    ` + var(${FILE_EXTENSION_BAR_HEIGHT_CSS_VARIABLE}, ${DEFAULT_FILE_EXTENSION_BAR_HEIGHT_PX}px) + ${BAR_GAP_PX}px)`

export const INSET_LEFT = `var(${BAR_INSET_LEFT_CSS_VARIABLE}, 0px)`
export const INSET_RIGHT = `var(${BAR_INSET_RIGHT_CSS_VARIABLE}, 0px)`
const FREE_WIDTH = `calc(100vw - ${INSET_LEFT} - ${INSET_RIGHT} - ${2 * PANEL_ISLAND_MARGIN_PX}px)`
/** Below this the cells cannot even show their labels, so a bar that needs more than the free space reaches under the inspector. */
const NARROWEST_SHRUNKEN_WIDTH = `min(30rem, calc(100vw - ${2 * PANEL_ISLAND_MARGIN_PX}px))`

@Directive({
    selector: "[ccBarShell]",
    host: {
        class:
            "fixed mx-auto flex items-stretch gap-1 p-1.5 bg-base-100 rounded-2xl shadow-lg border border-base-300 " +
            "transition-[left,right] duration-300 motion-reduce:transition-none",
        "[style.left]": "insetLeft",
        "[style.right]": "insetRight",
        "[style.width]": "'max-content'",
        "[style.maxWidth]": "maxWidth",
        "[style.zIndex]": "50",
        "[style.pointerEvents]": "'auto'"
    }
})
export class BarShellDirective {
    protected readonly insetLeft = INSET_LEFT
    protected readonly insetRight = INSET_RIGHT
    protected readonly maxWidth = `max(${NARROWEST_SHRUNKEN_WIDTH}, min(95vw, 1200px, ${FREE_WIDTH}))`
}
