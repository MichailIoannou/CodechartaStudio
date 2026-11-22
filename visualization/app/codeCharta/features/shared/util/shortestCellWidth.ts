import { Signal, signal } from "@angular/core"

/** The cell's width when its widest part is whole: that part plus the cell's own horizontal padding. */
export function shortestCellWidth(cell: HTMLElement, partWidths: number[]): number {
    const style = getComputedStyle(cell)
    const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
    return Math.ceil(Math.max(0, ...partWidths) + padding)
}

/** Turns true once the page's web fonts are loaded, so text measured before can be measured again. */
export function fontsLoadedSignal(): Signal<boolean> {
    const areLoaded = signal(false)
    void document.fonts?.ready.then(() => areLoaded.set(true))
    return areLoaded.asReadonly()
}
