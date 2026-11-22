import { render } from "@testing-library/angular"
import { BarCellKind } from "./barCellKind"
import { CellIconComponent, CellIconSize } from "./cellIcon.component"

describe("CellIconComponent", () => {
    async function renderIcon(cell: BarCellKind, size?: CellIconSize) {
        const { container } = await render(CellIconComponent, { inputs: size ? { cell, size } : { cell } })
        return container
    }

    it.each(["area", "height"] as const)("should draw the %s glyph at 14 px on a card", async cell => {
        // Act
        const container = await renderIcon(cell)

        // Assert
        expect(container.querySelector(`[data-glyph='${cell}']`)).not.toBeNull()
        expect(container.querySelector("cc-metric-glyph").classList).toContain("size-3.5")
    })

    it.each([
        ["color", "fa-palette"],
        ["edges", "fa-circle-nodes"],
        ["folders", "fa-folder"],
        ["labels", "fa-tags"],
        ["scenarios", "fa-bookmark"]
    ] as const)("should show %s as %s", async (cell, iconClass) => {
        // Act
        const container = await renderIcon(cell)

        // Assert
        const icon = container.querySelector("i")
        expect(icon.classList).toContain(iconClass)
        expect(icon.classList).toContain("text-[13px]")
    })

    it("should draw a glyph at 16 px in the compact bar", async () => {
        // Act
        const container = await renderIcon("area", "compact")

        // Assert
        expect(container.querySelector("cc-metric-glyph").classList).toContain("size-4")
    })

    it("should draw a Font Awesome icon at 15 px in the compact bar", async () => {
        // Act
        const container = await renderIcon("color", "compact")

        // Assert
        expect(container.querySelector("i").classList).toContain("text-[15px]")
    })
})
