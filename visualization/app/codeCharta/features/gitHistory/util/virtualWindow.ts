export interface VirtualWindowInput {
    scrollTop: number
    viewportHeight: number
    rowHeight: number
    rowCount: number
    /** Rows rendered above and below the visible ones, so a fast scroll does not show blank space. */
    overscan: number
}

export interface VirtualWindow {
    firstIndex: number
    /** Inclusive; below `firstIndex` when there is nothing to render. */
    lastIndex: number
    /** Where the first rendered row starts. */
    offsetTop: number
    totalHeight: number
}

/** The rows of a fixed-row-height list that a viewport scrolled to `scrollTop` needs rendered. */
export function windowOf({ scrollTop, viewportHeight, rowHeight, rowCount, overscan }: VirtualWindowInput): VirtualWindow {
    const totalHeight = rowCount * rowHeight
    if (rowCount === 0) {
        return { firstIndex: 0, lastIndex: -1, offsetTop: 0, totalHeight }
    }
    const maxScrollTop = Math.max(0, totalHeight - viewportHeight)
    const clampedScrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop)
    const firstVisible = Math.floor(clampedScrollTop / rowHeight)
    const lastVisible = Math.ceil((clampedScrollTop + viewportHeight) / rowHeight) - 1
    const firstIndex = Math.max(0, firstVisible - overscan)
    const lastIndex = Math.min(rowCount - 1, lastVisible + overscan)
    return { firstIndex, lastIndex, offsetTop: firstIndex * rowHeight, totalHeight }
}

export interface RowInView {
    index: number
    rowHeight: number
    scrollTop: number
    viewportHeight: number
}

/** The nearest scroll position that shows the whole row: unchanged when it is in view already. */
export function scrollTopShowing({ index, rowHeight, scrollTop, viewportHeight }: RowInView): number {
    const rowTop = index * rowHeight
    if (rowTop < scrollTop) {
        return rowTop
    }
    return Math.max(scrollTop, rowTop + rowHeight - viewportHeight)
}
