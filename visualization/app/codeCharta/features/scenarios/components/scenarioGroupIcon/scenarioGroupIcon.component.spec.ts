import { render } from "@testing-library/angular"
import { ScenarioGroupIcon } from "../../model/scenarioSettings.registry"
import { ScenarioGroupIconComponent } from "./scenarioGroupIcon.component"

describe("ScenarioGroupIconComponent", () => {
    async function renderIcon(icon: ScenarioGroupIcon) {
        const { container } = await render(ScenarioGroupIconComponent, { inputs: { icon } })
        return container
    }

    it("should draw a metric glyph for a glyph icon", async () => {
        // Act
        const container = await renderIcon({ glyph: "area" })

        // Assert
        expect(container.querySelector("[data-glyph='area']")).not.toBeNull()
        expect(container.querySelector("i")).toBeNull()
    })

    it("should show the Font Awesome icon it is given", async () => {
        // Act
        const container = await renderIcon({ fontAwesome: "fa-solid fa-palette" })

        // Assert
        expect(container.querySelector("i").classList).toContain("fa-palette")
        expect(container.querySelector("cc-metric-glyph")).toBeNull()
    })
})
