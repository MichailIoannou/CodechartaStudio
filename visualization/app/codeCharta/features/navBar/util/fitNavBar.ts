export interface ProjectMenuWidths {
    /** Everything but the folder name: icon, caret, padding and the gap before the name. */
    chrome: number
    iconOnly: number
    label: number
    /** The folder name cut to its first characters plus "…". */
    shortestLabel: number
}

export interface MapSlotWidths {
    full: number
    narrowest: number
    compact: number
}

export interface NavBarRoom {
    /** What `navbar-start` leaves the project menu and the map slot, the gap between them included. */
    available: number
    gap: number
    project: ProjectMenuWidths
    slot: MapSlotWidths | null
}

export interface NavBarFitState {
    projectLabelMaxWidth: number | null
    isProjectIconOnly: boolean
    slotWidth: number | null
    isSlotCompact: boolean
}

export const NATURAL_FIT: NavBarFitState = { projectLabelMaxWidth: null, isProjectIconOnly: false, slotWidth: null, isSlotCompact: false }

/** The first step that fits: the folder name shortens, the project menu turns icon-only, the map slot narrows, then turns compact. */
export function fitNavBar({ available, gap, project, slot }: NavBarRoom): NavBarFitState {
    const slotFull = slot ? slot.full + gap : 0
    if (project.chrome + project.label + slotFull <= available) {
        return NATURAL_FIT
    }
    const labelRoom = Math.floor(available - slotFull - project.chrome)
    if (labelRoom >= project.shortestLabel) {
        return { ...NATURAL_FIT, projectLabelMaxWidth: labelRoom }
    }
    const iconOnly = { ...NATURAL_FIT, isProjectIconOnly: true }
    if (!slot || project.iconOnly + slotFull <= available) {
        return iconOnly
    }
    const slotRoom = Math.floor(available - project.iconOnly - gap)
    if (slotRoom >= slot.narrowest) {
        return { ...iconOnly, slotWidth: slotRoom }
    }
    return { ...iconOnly, slotWidth: Math.max(slot.compact, slotRoom), isSlotCompact: true }
}

export function isSameFit(first: NavBarFitState, second: NavBarFitState): boolean {
    return (
        first.projectLabelMaxWidth === second.projectLabelMaxWidth &&
        first.isProjectIconOnly === second.isProjectIconOnly &&
        first.slotWidth === second.slotWidth &&
        first.isSlotCompact === second.isSlotCompact
    )
}
