export const BAR_CELL_CLASSES = "rounded-xl px-3 py-2 transition-colors hover:bg-base-200"

const OPEN_BAR_CELL_CLASSES = "bg-base-200 ring-1 ring-primary/40"

export function openBarCellClasses(isPopoverOpen: boolean): string {
    return isPopoverOpen ? OPEN_BAR_CELL_CLASSES : ""
}
