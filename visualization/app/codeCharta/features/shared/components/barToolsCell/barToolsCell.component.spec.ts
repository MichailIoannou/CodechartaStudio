import { render, screen } from "@testing-library/angular"
import { BarToolsCellComponent } from "./barToolsCell.component"

describe("BarToolsCellComponent", () => {
    it("should group the tools it is given into one toolbar", async () => {
        // Act
        await render('<cc-bar-tools-cell><button type="button">Screenshot</button></cc-bar-tools-cell>', {
            imports: [BarToolsCellComponent]
        })

        // Assert
        const toolbar = screen.getByRole("toolbar", { name: "View tools" })
        expect(toolbar.textContent).toContain("Screenshot")
    })
})
