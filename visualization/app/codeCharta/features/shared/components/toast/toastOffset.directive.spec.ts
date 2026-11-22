import { Component, signal } from "@angular/core"
import { render } from "@testing-library/angular"
import { TOAST_OFFSET_CSS_VARIABLE, ToastOffsetDirective } from "./toastOffset.directive"

let resizeCallback: (() => void) | undefined
class ResizeObserverMock {
    constructor(callback: () => void) {
        resizeCallback = callback
    }
    observe() {}
    disconnect() {}
}

let measuredHeight = 0

@Component({
    selector: "cc-toast-offset-host",
    template: `<div [ccToastOffset]="isOnScreen()"></div>`,
    imports: [ToastOffsetDirective]
})
class HostComponent {
    readonly isOnScreen = signal(true)
}

const offset = () => document.documentElement.style.getPropertyValue(TOAST_OFFSET_CSS_VARIABLE)

describe("ToastOffsetDirective", () => {
    beforeEach(() => {
        resizeCallback = undefined
        measuredHeight = 40
        window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
        jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height: measuredHeight }) as DOMRect)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        document.documentElement.style.removeProperty(TOAST_OFFSET_CSS_VARIABLE)
    })

    it("should move the toasts down by the element's height and follow it as it grows", async () => {
        // Arrange
        const { fixture } = await render(HostComponent)
        const firstOffset = offset()

        // Act
        measuredHeight = 96
        resizeCallback?.()
        fixture.detectChanges()

        // Assert
        expect(firstOffset).toBe("40px")
        expect(offset()).toBe("96px")
    })

    it("should give the toasts their place back while the element is off screen and when it is destroyed", async () => {
        // Arrange
        const { fixture } = await render(HostComponent)

        // Act
        fixture.componentInstance.isOnScreen.set(false)
        fixture.detectChanges()
        const whileHidden = offset()
        fixture.componentInstance.isOnScreen.set(true)
        fixture.detectChanges()
        const whileShown = offset()
        fixture.destroy()

        // Assert
        expect(whileHidden).toBe("")
        expect(whileShown).toBe("40px")
        expect(offset()).toBe("")
    })
})
