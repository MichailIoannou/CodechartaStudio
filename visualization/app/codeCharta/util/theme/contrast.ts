const HEX_DIGITS_PER_CHANNEL = 2
const HEX_RADIX = 16
const RGB_OFFSETS_IN_HEX_COLOR = [1, 3, 5]
const MAX_CHANNEL_VALUE = 255
const LINEAR_THRESHOLD = 0.04045
const LINEAR_DIVISOR = 12.92
const GAMMA_OFFSET = 0.055
const GAMMA_DIVISOR = 1.055
const GAMMA_EXPONENT = 2.4
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722]
const FLARE = 0.05

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
    const [darker, lighter] = [relativeLuminance(foregroundHex), relativeLuminance(backgroundHex)].sort((first, second) => first - second)
    return (lighter + FLARE) / (darker + FLARE)
}

function relativeLuminance(hexColor: string): number {
    return RGB_OFFSETS_IN_HEX_COLOR.reduce((luminance, start, index) => {
        const channel = Number.parseInt(hexColor.slice(start, start + HEX_DIGITS_PER_CHANNEL), HEX_RADIX) / MAX_CHANNEL_VALUE
        return luminance + LUMINANCE_WEIGHTS[index] * linearize(channel)
    }, 0)
}

function linearize(channel: number): number {
    return channel <= LINEAR_THRESHOLD ? channel / LINEAR_DIVISOR : ((channel + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA_EXPONENT
}
