const TOOLTIP_SEPARATOR = " · "

/** The cell's label, then what its card shows; parts the card leaves empty are left out. */
export function cellTooltip(label: string, ...cardParts: readonly (string | null | undefined)[]): string {
    return [label, ...cardParts.filter(part => !!part)].join(TOOLTIP_SEPARATOR)
}
