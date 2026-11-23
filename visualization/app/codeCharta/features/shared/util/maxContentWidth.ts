/** The width the element would take with nothing squeezing it; the element is sized so for the read only. */
export function maxContentWidth(element: HTMLElement): number {
    const width = element.style.width
    element.style.width = "max-content"
    const naturalWidth = element.getBoundingClientRect().width
    element.style.width = width
    return naturalWidth
}
