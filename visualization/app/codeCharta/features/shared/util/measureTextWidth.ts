const ELLIPSIS = "…"

let context: CanvasRenderingContext2D | null | undefined

/** The width the text takes in the element's font, measured without touching the layout. */
export function measureTextWidth(text: string, element: Element): number {
    const canvas = canvasContext()
    if (!canvas) {
        return 0
    }
    const style = getComputedStyle(element)
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    canvas.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing
    return canvas.measureText(text).width
}

/** The width of the text cut to its first characters plus "…", or of the whole text when it is no longer than that. */
export function measureShortenedTextWidth(text: string, keptCharacters: number, element: Element): number {
    const shortened = text.length > keptCharacters ? `${text.slice(0, keptCharacters)}${ELLIPSIS}` : text
    return measureTextWidth(shortened, element)
}

function canvasContext(): CanvasRenderingContext2D | null {
    if (context === undefined) {
        context = document.createElement("canvas").getContext("2d")
    }
    return context
}
