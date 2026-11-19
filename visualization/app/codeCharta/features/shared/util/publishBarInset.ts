import { DestroyRef, effect, inject } from "@angular/core"
import { CSS_VARIABLE_HOST } from "../cssVariableHost"

export const BAR_INSET_LEFT_CSS_VARIABLE = "--cc-bar-inset-left"
export const BAR_INSET_RIGHT_CSS_VARIABLE = "--cc-bar-inset-right"

/** The 6 px gap that keeps a floating panel island off the window edge. */
export const PANEL_ISLAND_MARGIN_PX = 6

export type BarInsetSide = "left" | "right"

/** A side panel tells the floating bars how much of the window's bottom edge it covers, so they centre in the space left free. */
export function publishBarInset(side: BarInsetSide, coveredWidth: () => string): void {
    const cssVariable = side === "left" ? BAR_INSET_LEFT_CSS_VARIABLE : BAR_INSET_RIGHT_CSS_VARIABLE
    const cssVariableHost = inject(CSS_VARIABLE_HOST)
    effect(() => cssVariableHost.style.setProperty(cssVariable, coveredWidth()))
    inject(DestroyRef).onDestroy(() => cssVariableHost.style.removeProperty(cssVariable))
}
