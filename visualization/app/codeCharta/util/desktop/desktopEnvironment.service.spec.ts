import { TestBed } from "@angular/core/testing"
import { createFakeDesktopBridge } from "./desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "./desktopBridge.token"
import { DesktopEnvironment } from "./desktopEnvironment.service"
import { DesktopBridgeError } from "./desktopResult"

function provideBridge(bridge: ReturnType<typeof createFakeDesktopBridge> | null) {
    TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }] })
}

describe("DesktopEnvironment", () => {
    it("should report desktop when a bridge is provided", () => {
        // Arrange
        provideBridge(createFakeDesktopBridge())

        // Act
        const environment = TestBed.inject(DesktopEnvironment)

        // Assert
        expect(environment.isDesktop()).toBe(true)
        expect(environment.requireBridge()).toBeDefined()
    })

    it("should report the web without a bridge", () => {
        // Arrange
        provideBridge(null)

        // Act
        const environment = TestBed.inject(DesktopEnvironment)

        // Assert
        expect(environment.isDesktop()).toBe(false)
        expect(environment.coreState().state).toBe("stopped")
    })

    it("should follow the core state", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ coreState: { state: "ready", message: null } })
        provideBridge(bridge)
        const environment = TestBed.inject(DesktopEnvironment)
        expect(environment.coreState().state).toBe("starting")

        // Act
        await Promise.resolve()
        const afterReplay = environment.coreState().state
        bridge.emit("shell.coreState", { state: "unavailable", message: "gone" })

        // Assert
        expect(afterReplay).toBe("ready")
        expect(environment.coreState()).toEqual({ state: "unavailable", message: "gone" })
    })

    it("should stop following the core state once destroyed", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        provideBridge(bridge)
        const environment = TestBed.inject(DesktopEnvironment)
        await Promise.resolve()

        // Act
        TestBed.resetTestingModule()
        bridge.emit("shell.coreState", { state: "restarting", message: null })

        // Assert
        expect(environment.coreState().state).toBe("ready")
    })

    it("should throw when the bridge is required on the web", () => {
        // Arrange
        provideBridge(null)
        const environment = TestBed.inject(DesktopEnvironment)

        // Act
        const require = () => environment.requireBridge()

        // Assert
        expect(require).toThrow(DesktopBridgeError)
        expect(require).toThrow(expect.objectContaining({ code: "NOT_ALLOWED" }))
    })
})
