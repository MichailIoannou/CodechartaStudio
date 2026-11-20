import { Component, signal } from "@angular/core"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { FloatingMenuAnchor, FloatingMenuComponent } from "./floatingMenu.component"

@Component({
    selector: "cc-floating-menu-host",
    imports: [FloatingMenuComponent],
    template: `
        @if (anchor(); as anchor) {
            <cc-floating-menu data-testid="menu" [anchor]="anchor" (dismissed)="dismissed()" (positioned)="positioned()">
                <button type="button">Inside</button>
            </cc-floating-menu>
        }
    `
})
class FloatingMenuHostComponent {
    readonly anchor = signal<FloatingMenuAnchor | null>({ x: 40, y: 80 })
    readonly dismissed = jest.fn()
    readonly positioned = jest.fn()
}

describe("FloatingMenuComponent", () => {
    async function setup() {
        const renderResult = await render(FloatingMenuHostComponent)
        return { ...renderResult, host: renderResult.fixture.componentInstance }
    }

    it("should open at the anchor before it was measured", async () => {
        // Arrange & Act
        await setup()

        // Assert
        const menu = screen.getByTestId("menu")
        expect(menu.style.left).toBe("40px")
        expect(menu.style.top).toBe("80px")
    })

    it("should stay hidden until it was measured, so it never flashes at an unclamped position", async () => {
        // Arrange & Act
        await setup()

        // Assert
        expect(screen.getByTestId("menu").style.visibility).toBe("hidden")
    })

    it("should say when it has its position and is about to show", async () => {
        // Arrange
        const { host, detectChanges } = await setup()
        const beforeMeasuring = host.positioned.mock.calls.length

        // Act
        await new Promise(resolve => requestAnimationFrame(resolve))
        detectChanges()

        // Assert
        expect(beforeMeasuring).toBe(0)
        expect(host.positioned).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId("menu").style.visibility).toBe("visible")
    })

    it("should not announce a position once it is gone, even when its frame was not cancelled", async () => {
        // Arrange
        const cancelAnimationFrame = jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined)
        const { host, detectChanges } = await setup()

        // Act
        host.anchor.set(null)
        detectChanges()
        await new Promise(resolve => requestAnimationFrame(resolve))

        // Assert
        expect(host.positioned).not.toHaveBeenCalled()
        cancelAnimationFrame.mockRestore()
    })

    it("should dismiss on a click outside", async () => {
        // Arrange
        const { host } = await setup()

        // Act
        await userEvent.click(document.body)

        // Assert
        expect(host.dismissed).toHaveBeenCalled()
    })

    it("should stay open on a click inside", async () => {
        // Arrange
        const { host } = await setup()

        // Act
        await userEvent.click(screen.getByText("Inside"))

        // Assert
        expect(host.dismissed).not.toHaveBeenCalled()
    })

    it("should dismiss when the window is resized, as the anchor is then stale", async () => {
        // Arrange
        const { host } = await setup()

        // Act
        window.dispatchEvent(new Event("resize"))

        // Assert
        expect(host.dismissed).toHaveBeenCalled()
    })

    it("should suppress the browser menu on a right-click inside", async () => {
        // Arrange
        await setup()
        const contextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })

        // Act
        screen.getByTestId("menu").dispatchEvent(contextMenuEvent)

        // Assert
        expect(contextMenuEvent.defaultPrevented).toBe(true)
    })

    it("should not dismiss while its view is kept alive off screen", async () => {
        // Arrange — the router detaches a view it keeps alive, taking the rendered menu with it
        const { host, fixture } = await setup()
        fixture.nativeElement.remove()

        // Act — a pointer event that belongs to whatever view is on screen now
        await userEvent.click(document.body)

        // Assert — an element nobody can see must not close the menu of the view that is shown
        expect(host.dismissed).not.toHaveBeenCalled()
    })

    it("should not dismiss on a resize while its view is kept alive off screen", async () => {
        // Arrange
        const { host, fixture } = await setup()
        fixture.nativeElement.remove()

        // Act
        window.dispatchEvent(new Event("resize"))

        // Assert
        expect(host.dismissed).not.toHaveBeenCalled()
    })
})
