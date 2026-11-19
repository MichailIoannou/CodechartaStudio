import { Component } from "@angular/core"
import { render } from "@testing-library/angular"
import { BarShellDirective } from "./barShell.directive"

@Component({ selector: "cc-test-bar", template: "", hostDirectives: [BarShellDirective] })
class TestBarComponent {}

describe("BarShellDirective", () => {
    it("should centre the bar in the space the side panels leave free", async () => {
        // Act
        const { fixture } = await render(TestBarComponent)

        // Assert
        const bar: HTMLElement = fixture.nativeElement
        expect(bar.style.left).toBe("var(--cc-bar-inset-left, 0px)")
        expect(bar.style.right).toBe("var(--cc-bar-inset-right, 0px)")
        expect(bar.classList).toContain("mx-auto")
    })
})
