import { TestBed } from "@angular/core/testing"
import { CORE_PROTOCOL_VERSION } from "../../model/coreApi/coreApi"
import { createFakeDesktopBridge } from "./desktopBridge.mocks"
import { DESKTOP_BRIDGE, readDesktopBridge } from "./desktopBridge.token"

describe("desktop bridge token", () => {
    afterEach(() => {
        delete (window as { codeChartaDesktop?: unknown }).codeChartaDesktop
        jest.restoreAllMocks()
    })

    it("should return null on the web", () => {
        // Arrange
        const page = {}

        // Act
        const bridge = readDesktopBridge(page)

        // Assert
        expect(bridge).toBeNull()
        expect(TestBed.inject(DESKTOP_BRIDGE)).toBeNull()
    })

    it("should return the exposed bridge", () => {
        // Arrange
        const exposed = createFakeDesktopBridge({ protocolVersion: CORE_PROTOCOL_VERSION })

        // Act
        const bridge = readDesktopBridge({ codeChartaDesktop: exposed })

        // Assert
        expect(bridge).toBe(exposed)
    })

    it("should read the bridge from the window by default", () => {
        // Arrange
        const exposed = createFakeDesktopBridge({ protocolVersion: CORE_PROTOCOL_VERSION })
        ;(window as { codeChartaDesktop?: unknown }).codeChartaDesktop = exposed

        // Act
        const bridge = TestBed.inject(DESKTOP_BRIDGE)

        // Assert
        expect(bridge).toBe(exposed)
    })

    it("should ignore a bridge of another protocol version", () => {
        // Arrange
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
        const exposed = createFakeDesktopBridge({ protocolVersion: CORE_PROTOCOL_VERSION + 1 })

        // Act
        const bridge = readDesktopBridge({ codeChartaDesktop: exposed })

        // Assert
        expect(bridge).toBeNull()
        expect(warn).toHaveBeenCalledTimes(1)
    })
})
