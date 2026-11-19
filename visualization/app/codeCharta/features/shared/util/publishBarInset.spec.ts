import { Component, signal } from "@angular/core"
import { render } from "@testing-library/angular"
import { BAR_INSET_LEFT_CSS_VARIABLE, BAR_INSET_RIGHT_CSS_VARIABLE, publishBarInset } from "./publishBarInset"

@Component({ selector: "cc-left-panel", template: "" })
class LeftPanelComponent {
    readonly coveredWidth = signal("326px")

    constructor() {
        publishBarInset("left", () => this.coveredWidth())
    }
}

@Component({ selector: "cc-right-panel", template: "" })
class RightPanelComponent {
    constructor() {
        publishBarInset("right", () => "0px")
    }
}

function insetOf(cssVariable: string) {
    return document.documentElement.style.getPropertyValue(cssVariable)
}

describe("publishBarInset", () => {
    it("should publish the width a left panel covers and follow it as it changes", async () => {
        // Arrange
        const { fixture } = await render(LeftPanelComponent)
        const atFirst = insetOf(BAR_INSET_LEFT_CSS_VARIABLE)

        // Act
        fixture.componentInstance.coveredWidth.set("0px")
        fixture.detectChanges()

        // Assert
        expect(atFirst).toBe("326px")
        expect(insetOf(BAR_INSET_LEFT_CSS_VARIABLE)).toBe("0px")
    })

    it("should publish a right panel's width under its own variable", async () => {
        // Act
        await render(RightPanelComponent)

        // Assert
        expect(insetOf(BAR_INSET_RIGHT_CSS_VARIABLE)).toBe("0px")
    })

    it("should take the inset back once the panel is gone", async () => {
        // Arrange
        const { fixture } = await render(LeftPanelComponent)

        // Act
        fixture.destroy()

        // Assert
        expect(insetOf(BAR_INSET_LEFT_CSS_VARIABLE)).toBe("")
    })
})
