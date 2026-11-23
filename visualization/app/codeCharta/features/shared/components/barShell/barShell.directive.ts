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

/** The bar stays centred on the window, so a panel on either side takes as much room from both of its ends. */
export const WIDER_PANEL_INSET = `max(var(${BAR_INSET_LEFT_CSS_VARIABLE}, 0px), var(${BAR_INSET_RIGHT_CSS_VARIABLE}, 0px))`
const ROOM_AROUND_WINDOW_CENTRE = `calc(100vw - 2 * ${WIDER_PANEL_INSET} - ${2 * PANEL_ISLAND_MARGIN_PX}px)`
/** Below this the cells cannot even show their labels, so a bar without a compact form that needs more room reaches under a panel. */
const NARROWEST_SHRUNKEN_WIDTH = `min(30rem, calc(100vw - ${2 * PANEL_ISLAND_MARGIN_PX}px))`

@Directive({
    selector: "[ccBarShell]",
    host: {
        class: "fixed left-0 right-0 mx-auto flex items-stretch gap-1 p-1.5 bg-base-100 rounded-2xl shadow-lg border border-base-300",
        "[style.width]": "'max-content'",
        "[style.maxWidth]": "maxWidth",
        "[style.zIndex]": "50",
        "[style.pointerEvents]": "'auto'"
    }
})
export class BarShellDirective {
    protected readonly maxWidth = `max(${NARROWEST_SHRUNKEN_WIDTH}, min(95vw, 1200px, ${ROOM_AROUND_WINDOW_CENTRE}))`
}
