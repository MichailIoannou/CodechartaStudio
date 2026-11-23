import { fitNavBar, isSameFit, MapSlotWidths, NATURAL_FIT, NavBarRoom } from "./fitNavBar"

const PROJECT = { chrome: 60, iconOnly: 52, label: 120, shortestLabel: 50 }
const STATUS: MapSlotWidths = { full: 288, narrowest: 144, compact: 52 }
const GAP = 4

function roomOf(available: number, slot: MapSlotWidths | null = STATUS): NavBarRoom {
    return { available, gap: GAP, project: PROJECT, slot }
}

describe("fitNavBar", () => {
    it("should keep both triggers at their natural widths when they fit", () => {
        // Act
        const fit = fitNavBar(roomOf(60 + 120 + GAP + 288))

        // Assert
        expect(fit).toEqual(NATURAL_FIT)
    })

    it("should first shorten the folder name to what is left beside the full map slot", () => {
        // Act
        const fit = fitNavBar(roomOf(60 + 80.6 + GAP + 288))

        // Assert
        expect(fit).toEqual({ ...NATURAL_FIT, projectLabelMaxWidth: 80 })
    })

    it("should show the project menu as its icon once the folder name would get shorter than its shortest form", () => {
        // Act
        const fit = fitNavBar(roomOf(60 + 49 + GAP + 288))

        // Assert
        expect(fit).toEqual({ ...NATURAL_FIT, isProjectIconOnly: true })
    })

    it("should then narrow the map slot to the room beside the icon-only project menu", () => {
        // Act
        const fit = fitNavBar(roomOf(52 + GAP + 200))

        // Assert
        expect(fit).toEqual({ ...NATURAL_FIT, isProjectIconOnly: true, slotWidth: 200 })
    })

    it("should show the map slot compact once it would get narrower than its narrowest width", () => {
        // Act
        const fit = fitNavBar(roomOf(52 + GAP + 100))

        // Assert
        expect(fit).toEqual({ projectLabelMaxWidth: null, isProjectIconOnly: true, slotWidth: 100, isSlotCompact: true })
    })

    it("should never give the compact map slot less than its compact width", () => {
        // Act
        const fit = fitNavBar(roomOf(52 + GAP + 10))

        // Assert
        expect(fit.slotWidth).toBe(52)
    })

    it("should only shorten and hide the folder name when there is no map slot", () => {
        // Act
        const shortened = fitNavBar(roomOf(60 + 70, null))
        const iconOnly = fitNavBar(roomOf(40, null))

        // Assert
        expect(shortened.projectLabelMaxWidth).toBe(70)
        expect(iconOnly).toEqual({ ...NATURAL_FIT, isProjectIconOnly: true })
    })

    it("should tell two fits apart by any of their parts", () => {
        // Act & Assert
        expect(isSameFit(NATURAL_FIT, { ...NATURAL_FIT })).toBe(true)
        expect(isSameFit(NATURAL_FIT, { ...NATURAL_FIT, projectLabelMaxWidth: 10 })).toBe(false)
        expect(isSameFit(NATURAL_FIT, { ...NATURAL_FIT, isProjectIconOnly: true })).toBe(false)
        expect(isSameFit(NATURAL_FIT, { ...NATURAL_FIT, slotWidth: 10 })).toBe(false)
        expect(isSameFit(NATURAL_FIT, { ...NATURAL_FIT, isSlotCompact: true })).toBe(false)
    })
})
