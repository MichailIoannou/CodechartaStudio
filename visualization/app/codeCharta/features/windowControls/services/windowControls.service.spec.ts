import { TestBed } from "@angular/core/testing"
import type { WindowState } from "../../../util/desktop/desktopBridge"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { ToastService } from "../../shared/facade"
import { WindowControlsService } from "./windowControls.service"

const SAVE_FAILURE = { code: "IO" as const, message: "disk full", details: {} }

describe("WindowControlsService", () => {
    let bridge: FakeDesktopBridge
    let toastService: { show: jest.Mock }

    async function createService(windowState: Partial<WindowState> = {}) {
        bridge = createFakeDesktopBridge({ windowState })
        toastService = { show: jest.fn() }
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: ToastService, useValue: toastService }
            ]
        })
        const service = TestBed.inject(WindowControlsService)
        await new Promise(resolve => setTimeout(resolve))
        return service
    }

    function commandsSent() {
        return bridge.calls.filter(call => call.name === "controlWindow").map(call => call.args[0])
    }

    it("should know nothing about a window in the web build", () => {
        // Arrange
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: null }] })

        // Act
        const service = TestBed.inject(WindowControlsService)

        // Assert
        expect(service.state()).toBeNull()
        expect(service.usesAppTitleBar()).toBe(false)
        expect(service.drawsOwnButtons()).toBe(false)
    })

    it("should draw its own buttons only on Linux with CodeCharta's title bar and outside full screen", async () => {
        // Arrange
        const service = await createService({ platform: "linux", usesAppTitleBar: true })
        const before = service.drawsOwnButtons()

        // Act
        bridge.emit("shell.windowState", { ...service.state(), isFullScreen: true })

        // Assert
        expect(before).toBe(true)
        expect(service.drawsOwnButtons()).toBe(false)
    })

    it("should leave room for the traffic lights on macOS outside full screen", async () => {
        // Arrange
        const service = await createService({ platform: "darwin", usesAppTitleBar: true })

        // Act
        const reservesTrafficLights = service.reservesTrafficLights()

        // Assert
        expect(reservesTrafficLights).toBe(true)
        expect(service.drawsOwnButtons()).toBe(false)
        expect(service.reservesCaptionButtons()).toBe(false)
    })

    it("should leave room for the caption buttons on Windows", async () => {
        // Arrange
        const service = await createService({ platform: "win32", usesAppTitleBar: true })

        // Act
        const reservesCaptionButtons = service.reservesCaptionButtons()

        // Assert
        expect(reservesCaptionButtons).toBe(true)
        expect(service.reservesTrafficLights()).toBe(false)
    })

    it("should send the window commands to the shell", async () => {
        // Arrange
        const service = await createService({ usesAppTitleBar: true })

        // Act
        service.minimize()
        service.toggleMaximize()
        service.close()

        // Assert
        expect(commandsSent()).toEqual(["minimize", "toggleMaximize", "close"])
    })

    it("should ask for a restart once the saved title bar setting differs from the window's", async () => {
        // Arrange
        const service = await createService({ usesAppTitleBar: false })

        // Act
        await service.setUseAppTitleBar(true)
        const afterTurningOn = service.isRestartNeeded()
        await service.setUseAppTitleBar(false)

        // Assert
        expect(afterTurningOn).toBe(true)
        expect(service.isRestartNeeded()).toBe(false)
        expect(service.state()?.savedUseAppTitleBar).toBe(false)
    })

    it("should keep the old setting and tell the user when it cannot be saved", async () => {
        // Arrange
        const service = await createService({ usesAppTitleBar: false })
        bridge.failWith("setUseAppTitleBar", SAVE_FAILURE)

        // Act
        await service.setUseAppTitleBar(true)

        // Assert
        expect(service.state()?.savedUseAppTitleBar).toBe(false)
        expect(toastService.show).toHaveBeenCalledWith("The title bar setting could not be saved: disk full", "error")
    })

    it("should reopen the window", async () => {
        // Arrange
        const service = await createService()

        // Act
        await service.reopen()

        // Assert
        expect(bridge.calls.some(call => call.name === "reopenWindow")).toBe(true)
    })

    it("should open the window menu where asked and close it again", async () => {
        // Arrange
        const service = await createService({ usesAppTitleBar: true })

        // Act
        service.openMenu({ x: 300, y: 20 })
        const opened = service.menuAnchor()
        service.closeMenu()

        // Assert
        expect(opened).toEqual({ x: 300, y: 20 })
        expect(service.menuAnchor()).toBeNull()
    })

    it("should stay without a window state when the shell cannot describe the window", async () => {
        // Arrange
        bridge = createFakeDesktopBridge({ failures: { windowState: SAVE_FAILURE } })
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }] })

        // Act
        const service = TestBed.inject(WindowControlsService)
        await new Promise(resolve => setTimeout(resolve))

        // Assert
        expect(service.state()).toBeNull()
    })
})
