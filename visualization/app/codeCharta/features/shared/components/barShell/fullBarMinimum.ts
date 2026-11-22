/** The narrowest the bar can get: every card at its minimum width, everything else at its own width, plus gaps and frame. */
export function measureFullBarMinimum(bar: HTMLElement): number {
    const style = getComputedStyle(bar)
    const items = flexItemsOf(bar)
    const frame = sumOfPixels(style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth)
    const gaps = pixels(style.columnGap) * Math.max(items.length - 1, 0)
    return frame + gaps + items.reduce((total, item) => total + minimumWidthOf(item), 0)
}

function flexItemsOf(element: Element): Element[] {
    return Array.from(element.children).flatMap(child => {
        const { display, position } = getComputedStyle(child)
        if (display === "contents") {
            return flexItemsOf(child)
        }
        return display === "none" || position === "absolute" || position === "fixed" ? [] : [child]
    })
}

function minimumWidthOf(item: Element): number {
    const style = getComputedStyle(item)
    const margins = sumOfPixels(style.marginLeft, style.marginRight)
    const shrinksToItsMinimum = pixels(style.flexShrink) > 0 && style.minWidth.endsWith("px")
    return (shrinksToItsMinimum ? pixels(style.minWidth) : item.getBoundingClientRect().width) + margins
}

function sumOfPixels(...values: string[]): number {
    return values.reduce((total, value) => total + pixels(value), 0)
}

function pixels(value: string): number {
    return Number.parseFloat(value) || 0
}
