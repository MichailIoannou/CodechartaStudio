import { measureShortenedTextWidth, measureTextWidth } from "../../shared/facade"
import { MapSlotWidths, NavBarFitState, NavBarRoom, ProjectMenuWidths } from "./fitNavBar"

const PROJECT_SELECTOR = ":scope > [data-fit-project]"
const SLOT_SELECTOR = ":scope > [data-fit-slot]"
const LABEL_SELECTOR = "[data-fit-label]"
const ICON_SELECTOR = "[data-fit-icon]"
const SHORTEST_PROJECT_LABEL_CHARACTERS = 6
/** Font Awesome's `fa-fw` gives every icon this width, so a hidden icon's width is known from its font size. */
const FIXED_WIDTH_ICON_EM = 1.25
const DEFAULT_ROOT_FONT_SIZE_PX = 16

/** Measures `navbar-start` so that the result does not depend on the step the nav bar fit currently shows. */
export function measureNavBarRoom(start: HTMLElement, current: NavBarFitState): NavBarRoom | null {
    const project = start.querySelector<HTMLElement>(PROJECT_SELECTOR)
    if (!project) {
        return null
    }
    const slot = start.querySelector<HTMLElement>(SLOT_SELECTOR)
    const gap = cssPixels(getComputedStyle(start).columnGap)
    return {
        available: availableWidth(start, gap, child => child === project || child === slot),
        gap,
        project: projectWidths(project, current.isProjectIconOnly),
        slot: slot ? slotWidths(slot, current.isSlotCompact) : null
    }
}

function availableWidth(start: HTMLElement, gap: number, isFitted: (child: Element) => boolean): number {
    const style = getComputedStyle(start)
    const content = start.clientWidth - cssPixels(style.paddingLeft) - cssPixels(style.paddingRight)
    const others = Array.from(start.children).filter(child => !isFitted(child) && child.getClientRects().length > 0)
    return content - sum(others.map(child => child.getBoundingClientRect().width + gap))
}

function projectWidths(project: HTMLElement, isIconOnly: boolean): ProjectMenuWidths {
    const width = project.getBoundingClientRect().width
    const label = project.querySelector<HTMLElement>(LABEL_SELECTOR)
    if (!label) {
        return { chrome: width, iconOnly: width, label: 0, shortestLabel: 0 }
    }
    const innerGap = innerGapOf(label)
    const chrome = isIconOnly ? width + innerGap : width - label.getBoundingClientRect().width
    const text = label.textContent?.trim() ?? ""
    return {
        chrome,
        iconOnly: chrome - innerGap,
        label: Math.ceil(measureTextWidth(text, label)),
        shortestLabel: Math.ceil(measureShortenedTextWidth(text, SHORTEST_PROJECT_LABEL_CHARACTERS, label))
    }
}

function slotWidths(slot: HTMLElement, isCompact: boolean): MapSlotWidths {
    const { fitFull, fitNarrowest, fitCompact } = slot.dataset
    if (fitFull && fitNarrowest && fitCompact) {
        return { full: remToPixels(fitFull), narrowest: remToPixels(fitNarrowest), compact: remToPixels(fitCompact) }
    }
    return contentSlotWidths(slot, isCompact)
}

/** A slot sized by its labels, which keep their minimum width; its icons drop out in the compact form. */
function contentSlotWidths(slot: HTMLElement, isCompact: boolean): MapSlotWidths {
    const labels = Array.from(slot.querySelectorAll<HTMLElement>(LABEL_SELECTOR))
    const iconsWidth = sum(Array.from(slot.querySelectorAll<HTMLElement>(ICON_SELECTOR), icon => fixedIconWidth(icon) + innerGapOf(icon)))
    const shownLabels = sum(labels.map(label => label.getBoundingClientRect().width))
    const chrome = slot.getBoundingClientRect().width - shownLabels + (isCompact ? iconsWidth : 0)
    const naturalLabels = sum(labels.map(label => Math.ceil(measureTextWidth(label.textContent?.trim() ?? "", label))))
    const shortestLabels = sum(labels.map(label => cssPixels(getComputedStyle(label).minWidth)))
    return { full: chrome + naturalLabels, narrowest: chrome + shortestLabels, compact: chrome - iconsWidth + shortestLabels }
}

function fixedIconWidth(icon: HTMLElement): number {
    return FIXED_WIDTH_ICON_EM * cssPixels(getComputedStyle(icon).fontSize)
}

function innerGapOf(element: HTMLElement): number {
    return element.parentElement ? cssPixels(getComputedStyle(element.parentElement).columnGap) : 0
}

function remToPixels(rem: string): number {
    const rootFontSize = cssPixels(getComputedStyle(document.documentElement).fontSize) || DEFAULT_ROOT_FONT_SIZE_PX
    return Number.parseFloat(rem) * rootFontSize
}

function cssPixels(value: string): number {
    return Number.parseFloat(value) || 0
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0)
}
