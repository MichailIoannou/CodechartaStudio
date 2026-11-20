import { Component } from "@angular/core"
import { render } from "@testing-library/angular"
import { injectIsAnyPopoverOpen } from "./injectIsAnyPopoverOpen"

@Component({
    selector: "cc-popover-owner",
    template: `<div id="settings" popover></div>
        <div id="search" popover></div>
        <div id="elsewhere" popover></div>`
})
class PopoverOwnerComponent {
    readonly isOpen = injectIsAnyPopoverOpen(() => ["settings", "search", null])
}

function toggle(popoverId: string, newState: "open" | "closed") {
    const event = new Event("toggle")
    Object.defineProperty(event, "newState", { value: newState })
    document.getElementById(popoverId).dispatchEvent(event)
}

describe("injectIsAnyPopoverOpen", () => {
    it("should be false while none of the popovers is open", async () => {
        // Act
        const { fixture } = await render(PopoverOwnerComponent)

        // Assert
        expect(fixture.componentInstance.isOpen()).toBe(false)
    })

    it("should be true while one of the popovers is open", async () => {
        // Arrange
        const { fixture } = await render(PopoverOwnerComponent)

        // Act
        toggle("search", "open")

        // Assert
        expect(fixture.componentInstance.isOpen()).toBe(true)
    })

    it("should stay true until every open popover has closed", async () => {
        // Arrange
        const { fixture } = await render(PopoverOwnerComponent)
        toggle("search", "open")
        toggle("settings", "open")

        // Act
        toggle("search", "closed")
        const whileSettingsAreOpen = fixture.componentInstance.isOpen()
        toggle("settings", "closed")

        // Assert
        expect(whileSettingsAreOpen).toBe(true)
        expect(fixture.componentInstance.isOpen()).toBe(false)
    })

    it("should ignore popovers it was not given", async () => {
        // Arrange
        const { fixture } = await render(PopoverOwnerComponent)

        // Act
        toggle("elsewhere", "open")

        // Assert
        expect(fixture.componentInstance.isOpen()).toBe(false)
    })

    it("should stop listening once its owner is destroyed", async () => {
        // Arrange
        const { fixture } = await render(PopoverOwnerComponent)
        const removeListener = jest.spyOn(document, "removeEventListener")

        // Act
        fixture.destroy()

        // Assert
        expect(removeListener).toHaveBeenCalledWith("toggle", expect.any(Function), true)
    })
})
