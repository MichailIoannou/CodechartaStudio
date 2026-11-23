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

    it("should give the tools the compact bar's button size while the bar is compact", async () => {
        // Act
        await render('<cc-bar-tools-cell [isCompact]="true"><button type="button">Screenshot</button></cc-bar-tools-cell>', {
            imports: [BarToolsCellComponent]
        })

        // Assert
        const toolbar = screen.getByRole("toolbar", { name: "View tools" })
        expect(toolbar.classList).toContain("[&_.btn]:size-7")
        expect(toolbar.classList).toContain("grid-cols-2")
        expect(toolbar.classList).not.toContain("px-1")
    })
})
