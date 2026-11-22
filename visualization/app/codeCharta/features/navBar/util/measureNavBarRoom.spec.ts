import { NATURAL_FIT } from "./fitNavBar"
import { measureNavBarRoom } from "./measureNavBarRoom"

const CHARACTER_WIDTH = 7
const GAP = 4
const INNER_GAP = 8

function sized<T extends HTMLElement>(element: T, width: number): T {
    element.getBoundingClientRect = () => ({ width }) as DOMRect
    element.getClientRects = () => (width > 0 ? [{ width }] : []) as unknown as DOMRectList
    return element
}

function element(tag: string, attributes: Record<string, string> = {}, text = ""): HTMLElement {
    const created = document.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) {
        created.setAttribute(name, value)
    }
    created.textContent = text
    return created
}

function navbarStart(width: number, ...children: HTMLElement[]): HTMLElement {
    const start = sized(element("div"), width)
    start.style.columnGap = `${GAP}px`
    start.append(...children)
    document.body.appendChild(start)
    return start
}

function projectMenu(width: number, labelWidth: number, folder = "billing-api"): HTMLElement {
    const project = sized(element("cc-project-switcher", { "data-fit-project": "" }), width)
    const trigger = element("button")
    trigger.style.columnGap = `${INNER_GAP}px`
    trigger.append(sized(element("span", { "data-fit-label": "" }, folder), labelWidth))
    project.append(trigger)
    return project
}

function comparisonChip(width: number, labelWidths: number[], iconCount: number): HTMLElement {
    const chip = sized(element("cc-comparison-chip", { "data-fit-slot": "" }), width)
    const trigger = element("button")
    trigger.style.columnGap = `${INNER_GAP}px`
    for (let index = 0; index < iconCount; index++) {
        const icon = element("i", { "data-fit-icon": "" })
        icon.style.fontSize = "16px"
        trigger.append(icon)
    }
    for (const labelWidth of labelWidths) {
        const label = sized(element("span", { "data-fit-label": "" }, "main"), labelWidth)
        label.style.minWidth = "40px"
        trigger.append(label)
    }
    chip.append(trigger)
    return chip
}

describe("measureNavBarRoom", () => {
    beforeEach(() => {
        jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(
            text => ({ width: text.length * CHARACTER_WIDTH }) as TextMetrics
        )
        document.documentElement.style.fontSize = "16px"
    })

    afterEach(() => {
        jest.restoreAllMocks()
        document.body.replaceChildren()
    })

    it("should measure nothing without a project menu", () => {
        // Arrange
        const start = navbarStart(500, sized(element("cc-nav-bar-logo"), 60))

        // Act
        const room = measureNavBarRoom(start, NATURAL_FIT)

        // Assert
        expect(room).toBeNull()
    })

    it("should leave the project menu and the map slot what the shown fixed parts and their gaps do not take", () => {
        // Arrange
        const hiddenLogo = sized(element("cc-nav-bar-logo"), 0)
        const divider = sized(element("div"), 10)
        const status = sized(
            element("cc-workspace-status", {
                "data-fit-slot": "",
                "data-fit-full": "18",
                "data-fit-narrowest": "9",
                "data-fit-compact": "3.25"
            }),
            288
        )
        const start = navbarStart(500, hiddenLogo, divider, projectMenu(150, 90), status)

        // Act
        const room = measureNavBarRoom(start, NATURAL_FIT)

        // Assert
        expect(room).toEqual({
            available: 500 - (10 + GAP),
            gap: GAP,
            project: { chrome: 60, iconOnly: 60 - INNER_GAP, label: 11 * CHARACTER_WIDTH, shortestLabel: 7 * CHARACTER_WIDTH },
            slot: { full: 288, narrowest: 144, compact: 52 }
        })
    })

    it("should measure the same project menu widths while it shows only its icon", () => {
        // Arrange
        const start = navbarStart(500, projectMenu(52, 0))

        // Act
        const room = measureNavBarRoom(start, { ...NATURAL_FIT, isProjectIconOnly: true })

        // Assert
        expect(room?.project).toMatchObject({ chrome: 60, iconOnly: 52 })
        expect(room?.slot).toBeNull()
    })

    it("should size a slot without fixed widths by its labels and drop its icons in the compact form", () => {
        // Arrange
        const iconsWidth = 2 * (1.25 * 16 + INNER_GAP)
        const fullChip = navbarStart(800, projectMenu(150, 90), comparisonChip(260, [80, 80], 2))
        const compactChip = navbarStart(800, projectMenu(150, 90), comparisonChip(260 - iconsWidth, [80, 80], 2))

        // Act
        const full = measureNavBarRoom(fullChip, NATURAL_FIT)?.slot
        const compact = measureNavBarRoom(compactChip, { ...NATURAL_FIT, isSlotCompact: true })?.slot

        // Assert
        expect(full).toEqual({ full: 100 + 2 * 4 * CHARACTER_WIDTH, narrowest: 100 + 80, compact: 100 - iconsWidth + 80 })
        expect(compact).toEqual(full)
    })

    it("should keep deciding by the full form's widths while the slot shows its compact form with shorter labels", () => {
        // Arrange
        const chip = comparisonChip(260, [80, 80], 0)
        const start = navbarStart(800, projectMenu(150, 90), chip)
        const full = measureNavBarRoom(start, NATURAL_FIT)?.slot
        chip.getBoundingClientRect = () => ({ width: 160 }) as DOMRect
        for (const label of chip.querySelectorAll<HTMLElement>("[data-fit-label]")) {
            label.style.minWidth = "32px"
            label.getBoundingClientRect = () => ({ width: 32 }) as DOMRect
        }

        // Act
        const compact = measureNavBarRoom(start, { ...NATURAL_FIT, isSlotCompact: true })?.slot

        // Assert
        expect(compact).toEqual({ full: full?.full, narrowest: full?.narrowest, compact: 160 - 64 + 64 })
    })
})
