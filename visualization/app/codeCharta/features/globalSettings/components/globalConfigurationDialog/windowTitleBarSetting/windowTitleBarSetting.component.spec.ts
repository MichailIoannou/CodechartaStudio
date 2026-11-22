import { ComponentFixture, TestBed } from "@angular/core/testing"
import type { WindowState } from "../../../../../util/desktop/desktopBridge"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../../util/desktop/desktopBridge.token"
import { WindowTitleBarSettingComponent } from "./windowTitleBarSetting.component"

describe("WindowTitleBarSettingComponent", () => {
    let bridge: FakeDesktopBridge
    let fixture: ComponentFixture<WindowTitleBarSettingComponent>

    async function renderSetting(windowState: Partial<WindowState> = {}) {
        bridge = createFakeDesktopBridge({ windowState })
        TestBed.configureTestingModule({
            imports: [WindowTitleBarSettingComponent],
            providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }]
        })
        fixture = TestBed.createComponent(WindowTitleBarSettingComponent)
        await settle()
    }

    async function settle() {
        fixture.detectChanges()
        await fixture.whenStable()
        await new Promise(resolve => setTimeout(resolve))
        fixture.detectChanges()
    }

    function toggle(): HTMLInputElement {
        return fixture.nativeElement.querySelector("input[type='checkbox']")
    }

    function restartButton(): HTMLButtonElement | null {
        return fixture.nativeElement.querySelector("button")
    }

    function restartHint(): HTMLElement {
        return [...fixture.nativeElement.querySelectorAll("span")].find((span: HTMLElement) =>
            span.textContent.trim().startsWith("Takes effect")
        ) as HTMLElement
    }

    async function switchTo(checked: boolean) {
        toggle().checked = checked
        toggle().dispatchEvent(new Event("change"))
        await settle()
    }

    it("should be off by default and need no restart", async () => {
        // Act
        await renderSetting()

        // Assert
        expect(toggle().checked).toBe(false)
        expect(restartButton()).toBeNull()
        expect(restartHint().classList).not.toContain("text-warning")
    })

    it("should save the setting and offer a restart once it differs from the window", async () => {
        // Arrange
        await renderSetting()

        // Act
        await switchTo(true)

        // Assert
        expect(bridge.calls).toContainEqual({ name: "setUseAppTitleBar", args: [true] })
        expect(restartButton().textContent.trim()).toBe("Restart now")
        expect(restartHint().classList).toContain("text-warning")
    })

    it("should need no restart once switched back to the title bar the window has", async () => {
        // Arrange
        await renderSetting({ usesAppTitleBar: true, savedUseAppTitleBar: true })
        await switchTo(false)

        // Act
        await switchTo(true)

        // Assert
        expect(toggle().checked).toBe(true)
        expect(restartButton()).toBeNull()
    })

    it("should reopen the window on Restart now", async () => {
        // Arrange
        await renderSetting()
        await switchTo(true)

        // Act
        restartButton().click()

        // Assert
        expect(bridge.calls.some(call => call.name === "reopenWindow")).toBe(true)
    })
})
