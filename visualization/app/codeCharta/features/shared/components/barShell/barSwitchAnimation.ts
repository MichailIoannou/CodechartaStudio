const DURATION_MS = 240
const GHOST_FADE_MS = 85
const EASING = "cubic-bezier(.2,.8,.2,1)"
const TEXT_FADE_IN_FROM = 0.4
const ANIMATION_ID = "bar-switch"
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"
const ICON_SELECTOR = "[data-bar-icon], cc-bar-tools-cell .btn"
const TEXT_SELECTOR = "[data-bar-text]"
const GHOST_SELECTOR = "[data-bar-ghost]"
const LEFT_OUT_OF_THE_GHOST = "[popover], dialog"
const ATTRIBUTES_LEFT_OUT_OF_THE_GHOST = ["id", "data-testid", "popovertarget", "aria-label", "title"]

interface BarLayout {
    width: number
    icons: Map<string, DOMRect>
}

/**
 * Records the bar before it switches between its full and compact form and returns what animates the switch once the
 * new form is rendered: the old form fades out over it, the bar's width follows and each icon moves to its new place.
 * Returns null where the switch should be instant.
 */
export function prepareBarSwitch(bar: HTMLElement): (() => void) | null {
    if (!canAnimate(bar)) {
        return null
    }
    finishRunningSwitch(bar)
    const before: BarLayout = { width: bar.getBoundingClientRect().width, icons: iconRectsOf(bar) }
    const ghost = ghostOf(bar)
    return () => playBarSwitch(bar, before, ghost)
}

function canAnimate(bar: HTMLElement): boolean {
    return typeof bar.animate === "function" && typeof matchMedia === "function" && !matchMedia(REDUCED_MOTION_QUERY).matches
}

function finishRunningSwitch(bar: HTMLElement) {
    for (const animation of bar.getAnimations({ subtree: true })) {
        if (animation.id === ANIMATION_ID) {
            animation.finish()
        }
    }
    for (const ghost of bar.querySelectorAll(GHOST_SELECTOR)) {
        ghost.remove()
    }
}

function playBarSwitch(bar: HTMLElement, before: BarLayout, ghost: HTMLElement) {
    const width = bar.getBoundingClientRect().width
    const icons = iconsOf(bar)
    const finalRects = new Map([...icons].map(([key, icon]) => [key, icon.getBoundingClientRect()]))
    bar.appendChild(ghost)
    animate(ghost, [{ opacity: 1 }, { opacity: 0 }], GHOST_FADE_MS).onfinish = () => ghost.remove()
    bar.style.overflow = "clip"
    animate(bar, [{ width: `${before.width}px` }, { width: `${width}px` }]).onfinish = () => bar.style.removeProperty("overflow")
    for (const [key, icon] of icons) {
        moveFromItsOldPlace(icon, before.icons.get(key), finalRects.get(key))
    }
    for (const text of bar.querySelectorAll<HTMLElement>(TEXT_SELECTOR)) {
        if (!ghost.contains(text)) {
            animate(text, [{ opacity: 0 }, { opacity: 0, offset: TEXT_FADE_IN_FROM }, { opacity: 1 }])
        }
    }
}

function moveFromItsOldPlace(icon: HTMLElement, oldRect: DOMRect | undefined, newRect: DOMRect | undefined) {
    if (!oldRect || !newRect) {
        return
    }
    const deltaX = centreX(oldRect) - centreX(newRect)
    const deltaY = centreY(oldRect) - centreY(newRect)
    animate(icon, [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "none" }])
}

function animate(element: HTMLElement, keyframes: Keyframe[], duration = DURATION_MS): Animation {
    return element.animate(keyframes, { duration, easing: EASING, id: ANIMATION_ID })
}

function iconsOf(bar: HTMLElement): Map<string, HTMLElement> {
    const icons = new Map<string, HTMLElement>()
    let toolIndex = 0
    for (const icon of bar.querySelectorAll<HTMLElement>(ICON_SELECTOR)) {
        const key = icon.dataset.barIcon ?? `tool-${toolIndex++}`
        if (icon.getClientRects().length > 0 && !icon.closest(GHOST_SELECTOR)) {
            icons.set(key, icon)
        }
    }
    return icons
}

function iconRectsOf(bar: HTMLElement): Map<string, DOMRect> {
    return new Map([...iconsOf(bar)].map(([key, icon]) => [key, icon.getBoundingClientRect()]))
}

/** A copy of the bar's current form that cannot be used, found or focused; its icons are hidden, they move instead. */
function ghostOf(bar: HTMLElement): HTMLElement {
    const style = getComputedStyle(bar)
    const ghost = document.createElement("div")
    ghost.dataset.barGhost = ""
    ghost.setAttribute("aria-hidden", "true")
    ghost.inert = true
    Object.assign(ghost.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "stretch",
        columnGap: style.columnGap,
        padding: style.padding,
        pointerEvents: "none"
    })
    for (const child of bar.children) {
        const { position } = getComputedStyle(child)
        if (position !== "fixed" && position !== "absolute") {
            ghost.appendChild(child.cloneNode(true))
        }
    }
    for (const leftOut of ghost.querySelectorAll(LEFT_OUT_OF_THE_GHOST)) {
        leftOut.remove()
    }
    for (const element of ghost.querySelectorAll<HTMLElement>("*")) {
        unlink(element)
    }
    for (const icon of ghost.querySelectorAll<HTMLElement>(ICON_SELECTOR)) {
        icon.style.visibility = "hidden"
    }
    return ghost
}

function unlink(element: HTMLElement) {
    for (const attribute of ATTRIBUTES_LEFT_OUT_OF_THE_GHOST) {
        element.removeAttribute(attribute)
    }
    element.style.removeProperty("anchor-name")
}

function centreX(rect: DOMRect): number {
    return rect.left + rect.width / 2
}

function centreY(rect: DOMRect): number {
    return rect.top + rect.height / 2
}
