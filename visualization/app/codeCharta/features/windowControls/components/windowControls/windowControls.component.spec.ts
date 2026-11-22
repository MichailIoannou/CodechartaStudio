import { ComponentFixture, TestBed } from "@angular/core/testing"
import type { WindowState } from "../../../../util/desktop/desktopBridge"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { WindowControlsService } from "../../services/windowControls.service"
import { WindowControlsComponent } from "./windowControls.component"

describe("WindowControlsComponent", () => {
    let bridge: FakeDesktopBridge
    let fixture: ComponentFixture<WindowControlsComponent>

    async function renderControls(windowState: Partial<WindowState> = {}) {
        bridge = createFakeDesktopBridge({ windowState: { usesAppTitleBar: true, ...windowState } })
        TestBed.configureTestingModule({
            imports: [WindowControlsComponent],
            providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }]
        })
        fixture = TestBed.createComponent(WindowControlsComponent)
        await settle()
    }

    async function settle() {
        fixture.detectChanges()
        await fixture.whenStable()
        await new Promise(resolve => setTimeout(resolve))
        fixture.detectChanges()
    }

    function buttons(): HTMLButtonElement[] {
        return [...fixture.nativeElement.querySelectorAll(":scope > button")]
    }

    function labels() {
        return buttons().map(button => button.getAttribute("aria-label"))
    }

    function buttonLabelled(label: string) {
        return buttons().find(button => button.getAttribute("aria-label") === label)
    }

    function commandsSent() {
        return bridge.calls.filter(call => call.name === "controlWindow").map(call => call.args[0])
    }

    function menuItem(label: string): HTMLElement | undefined {
        return [...fixture.nativeElement.querySelectorAll("cc-floating-menu button")].find(
            (item: HTMLElement) => item.textContent.trim() === label
        ) as HTMLElement | undefined
    }

    it("should show minimize, maximize and close in the system's order", async () => {
        // Act
        await renderControls({ buttonOrder: ["close", "minimize", "maximize"] })

        // Assert
        expect(labels()).toEqual(["Close", "Minimize", "Maximize"])
        expect(buttons().every(button => button.tabIndex === -1)).toBe(true)
    })

    it("should send each button's command to the window", async () => {
        // Arrange
        await renderControls()

        // Act
        for (const label of ["Minimize", "Maximize", "Close"]) {
            buttonLabelled(label).click()
        }

        // Assert
        expect(commandsSent()).toEqual(["minimize", "toggleMaximize", "close"])
    })

    it("should offer Restore with the diamond while the window is maximized", async () => {
        // Arrange
        await renderControls()

        // Act
        buttonLabelled("Maximize").click()
        await settle()

        // Assert
        expect(labels()).toEqual(["Minimize", "Restore", "Close"])
        expect(buttonLabelled("Restore").querySelector("path").getAttribute("d")).toBe("M6 1.8 10.2 6 6 10.2 1.8 6Z")
    })

    it("should highlight close in Breeze's red instead of the grey circle of the other buttons", async () => {
        // Act
        await renderControls()

        // Assert
        const closeClasses = buttonLabelled("Close").classList
        expect(closeClasses).toContain("enabled:hover:before:bg-[#da4453]")
        expect(closeClasses).not.toContain("enabled:hover:before:bg-base-content/15")
        expect(buttonLabelled("Minimize").classList).toContain("enabled:hover:before:bg-base-content/15")
    })

    it("should disable maximize when the window cannot grow", async () => {
        // Act
        await renderControls({ isMaximizable: false })

        // Assert
        expect(buttonLabelled("Maximize").disabled).toBe(true)
    })

    it("should dim the glyphs while the window is not focused", async () => {
        // Arrange
        await renderControls()

        // Act
        const answer = await bridge.windowState()
        bridge.emit("shell.windowState", { ...("value" in answer ? answer.value : {}), isFocused: false })
        await settle()

        // Assert
        expect(buttons().every(button => button.classList.contains("text-base-content/45"))).toBe(true)
    })

    it("should offer the window commands in its menu", async () => {
        // Arrange
        await renderControls()

        // Act
        TestBed.inject(WindowControlsService).openMenu({ x: 300, y: 20 })
        await settle()
        menuItem("Maximize").click()
        await settle()

        // Assert
        expect(commandsSent()).toEqual(["toggleMaximize"])
        expect(fixture.nativeElement.querySelector("cc-floating-menu")).toBeNull()
    })

    it("should close the menu after minimize or close and when dismissed", async () => {
        // Arrange
        await renderControls()

        // Act
        TestBed.inject(WindowControlsService).openMenu({ x: 300, y: 20 })
        await settle()
        menuItem("Minimize").click()
        TestBed.inject(WindowControlsService).openMenu({ x: 300, y: 20 })
        await settle()
        menuItem("Close").click()
        TestBed.inject(WindowControlsService).openMenu({ x: 300, y: 20 })
        await settle()
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
        await settle()

        // Assert
        expect(commandsSent()).toEqual(["minimize", "close"])
        expect(fixture.nativeElement.querySelector("cc-floating-menu")).toBeNull()
    })
})
