import { Component, OnDestroy, signal } from "@angular/core"
import { fireEvent, render, screen } from "@testing-library/angular"
import { LegendDrawerStore } from "../../stores/legendDrawer.store"
import { LegendToolComponent } from "../legendTool/legendTool.component"
import { LegendDrawerComponent } from "./legendDrawer.component"

const legendLifecycle = { created: 0, destroyed: 0 }

@Component({
    selector: "cc-own-legend",
    template: `<p data-testid="own-legend">Edges</p>`
})
class OwnLegendComponent implements OnDestroy {
    constructor() {
        legendLifecycle.created++
    }

    ngOnDestroy(): void {
        legendLifecycle.destroyed++
    }
}

@Component({
    selector: "cc-legend-drawer-host",
    template: `<cc-legend-tool></cc-legend-tool>
        <cc-legend-drawer [isMovedAsideByInspector]="isInspectorShown()"><ng-template><cc-own-legend></cc-own-legend></ng-template></cc-legend-drawer>
        <button type="button">outside</button>`,
    imports: [LegendDrawerComponent, LegendToolComponent, OwnLegendComponent],
    providers: [LegendDrawerStore]
})
class LegendDrawerHostComponent {
    readonly isInspectorShown = signal(false)
}

describe("LegendDrawerComponent", () => {
    beforeEach(() => {
        legendLifecycle.created = 0
        legendLifecycle.destroyed = 0
    })

    it("should not create the legend a view puts inside while the panel is closed", async () => {
        // Arrange & Act
        await render(LegendDrawerHostComponent)

        // Assert
        expect(legendLifecycle.created).toBe(0)
    })

    it("should destroy the legend a view puts inside once the panel closes", async () => {
        // Arrange
        await render(LegendDrawerHostComponent)
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Act
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Assert
        expect(legendLifecycle.created).toBe(1)
        expect(legendLifecycle.destroyed).toBe(1)
    })

    it("should show the legend a view puts inside once the Legend tool is clicked", async () => {
        // Arrange
        await render(LegendDrawerHostComponent)
        const hiddenAtFirst = screen.queryByTestId("own-legend")

        // Act
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Assert
        expect(hiddenAtFirst).toBeNull()
        expect(screen.getByTestId("own-legend").textContent).toBe("Edges")
    })

    it("should close when the pointer goes down outside it", async () => {
        // Arrange
        await render(LegendDrawerHostComponent)
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Act
        fireEvent.mouseDown(screen.getByText("outside"))

        // Assert
        expect(screen.queryByTestId("legend-panel")).toBeNull()
    })

    it("should stay open when the pointer goes down on the Legend tool, so the tool can close it", async () => {
        // Arrange
        await render(LegendDrawerHostComponent)
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Act
        fireEvent.mouseDown(screen.getByTestId("legend-panel-button"))
        const openAfterPointerDown = screen.queryByTestId("legend-panel") !== null
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Assert
        expect(openAfterPointerDown).toBe(true)
        expect(screen.queryByTestId("legend-panel")).toBeNull()
    })

    it("should mark the Legend tool as expanded and name the panel it controls while open", async () => {
        // Arrange
        await render(LegendDrawerHostComponent)
        const tool = screen.getByRole("button", { name: "Legend" })
        const expandedWhileClosed = tool.getAttribute("aria-expanded")

        // Act
        fireEvent.click(tool)

        // Assert
        expect(expandedWhileClosed).toBe("false")
        expect(tool.getAttribute("aria-expanded")).toBe("true")
        expect(tool.getAttribute("aria-controls")).toBe(screen.getByTestId("legend-panel").id)
    })

    it("should open above the floating bar, so the Legend tool in it stays reachable", async () => {
        // Arrange
        await render(LegendDrawerHostComponent)

        // Act
        fireEvent.click(screen.getByTestId("legend-panel-button"))

        // Assert
        expect(screen.getByTestId("legend-panel").style.bottom).toContain("var(--cc-metrics-bar-height, 0px)")
    })

    it("should stay at the right edge until its view says an inspector is shown, then move aside by the inspector's width", async () => {
        // Arrange
        const { fixture } = await render(LegendDrawerHostComponent)
        fireEvent.click(screen.getByTestId("legend-panel-button"))
        const atTheEdge = screen.getByTestId("legend-panel").style.right

        // Act
        fixture.componentInstance.isInspectorShown.set(true)
        fixture.detectChanges()

        // Assert
        expect(atTheEdge).toBe("40px")
        expect(screen.getByTestId("legend-panel").style.right).toBe("calc(var(--cc-inspector-width) + 40px)")
    })
})
