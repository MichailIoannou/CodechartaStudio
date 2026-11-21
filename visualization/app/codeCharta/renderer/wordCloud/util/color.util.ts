import { Color } from "three"
import { ColorConverter } from "../../../util/color/colorConverter"
import { activeRenderPalette } from "../../../util/theme/activeTheme"

export type WordCloudColorPair = [string, string]

const FULL_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export function getWordCloudColors(): WordCloudColorPair {
    const { gradientStart, gradientEnd } = activeRenderPalette().wordCloud
    return [gradientStart, gradientEnd]
}

export function interpolateColor(startColor: string, endColor: string, factor: number): string {
    const [defaultStart, defaultEnd] = getWordCloudColors()
    const clampedFactor = Math.min(1, Math.max(0, factor))
    const start = ColorConverter.convertHexToColorObject(toFullHexOrFallback(startColor, defaultStart))
    const end = ColorConverter.convertHexToColorObject(toFullHexOrFallback(endColor, defaultEnd))
    return ColorConverter.convertColorToHex(new Color().lerpColors(start, end, clampedFactor))
}

function toFullHexOrFallback(value: string, fallback: string): string {
    return FULL_HEX_COLOR.test(value) ? value : fallback
}
