import { activeRenderPalette } from "./activeTheme"

export function chartTooltipStyle() {
    const { background, border, text } = activeRenderPalette().chartTooltip
    return { backgroundColor: background, borderColor: border, textStyle: { color: text } }
}
