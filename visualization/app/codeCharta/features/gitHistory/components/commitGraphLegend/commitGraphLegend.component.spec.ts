import { signal } from "@angular/core"
import { render, screen } from "@testing-library/angular"
import { ANALYSED_COMMITS } from "../../ports/analysedCommits.port"
import { CommitGraphLegendComponent } from "./commitGraphLegend.component"

describe("CommitGraphLegendComponent", () => {
    it("should open the legend from the question button and draw each mark", async () => {
        // Arrange & Act
        const { container } = await render(CommitGraphLegendComponent)

        // Assert
        const button = screen.getByRole("button", { name: "How to read the commit list" })
        const legend = screen.getByTestId("commit-graph-legend")
        expect(button.getAttribute("popovertarget")).toBe(legend.id)
        expect(legend.textContent).toContain("HEAD — the commit your folder has checked out")
        expect(legend.textContent).toContain("your uncommitted changes, on top of HEAD")
        expect(container.querySelectorAll("cc-commit-graph-cell")).toHaveLength(4)
        expect(container.querySelector("[data-testid=graph-head-ring]")).not.toBeNull()
        expect(legend.textContent).not.toContain("whether CodeCharta has an analysis")
    })

    it("should explain the analysis badges when the list shows them", async () => {
        // Arrange & Act
        await render(CommitGraphLegendComponent, {
            providers: [{ provide: ANALYSED_COMMITS, useValue: { markersFor: () => signal(new Map()) } }]
        })

        // Assert
        expect(screen.getByTestId("commit-graph-legend").textContent).toContain(
            "whether CodeCharta has an analysis of that commit, and whether the map shows it"
        )
    })
})
