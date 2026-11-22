import { Component } from "@angular/core"
import { render } from "@testing-library/angular"
import { BarShellDirective } from "./barShell.directive"

@Component({ selector: "cc-test-bar", template: "", hostDirectives: [BarShellDirective] })
class TestBarComponent {}

const WIDER_PANEL_INSET = "max(var(--cc-bar-inset-left, 0px), var(--cc-bar-inset-right, 0px))"

describe("BarShellDirective", () => {
    async function renderBar(): Promise<HTMLElement> {
        const { fixture } = await render(TestBarComponent)
        return fixture.nativeElement
    }

    it("should centre the bar on the window whichever side panels are open", async () => {
        // Act
        const bar = await renderBar()

        // Assert
        expect(bar.classList).toContain("left-0")
        expect(bar.classList).toContain("right-0")
        expect(bar.classList).toContain("mx-auto")
        expect(bar.style.left).toBe("")
        expect(bar.style.right).toBe("")
    })

    it("should keep the bar within the room around the window centre that the wider panel leaves", async () => {
        // Act
        const bar = await renderBar()

        // Assert
        expect(bar.style.maxWidth).toContain(`calc(100vw - 2 * ${WIDER_PANEL_INSET} - 12px)`)
    })
})
