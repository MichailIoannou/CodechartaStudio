import { createFakeDesktopBridge } from "./desktopBridge.mocks"
import { observeDesktopEvent } from "./desktopEvents"

describe("observeDesktopEvent", () => {
    it("should emit the payloads of the event", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const received: unknown[] = []
        observeDesktopEvent(bridge, "core.progress").subscribe(payload => received.push(payload))
        const progress = { requestId: "op-1", message: "git", done: 1, total: 5 }

        // Act
        bridge.emit("core.progress", progress)

        // Assert
        expect(received).toEqual([progress])
    })

    it("should unsubscribe on teardown", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const received: unknown[] = []
        const subscription = observeDesktopEvent(bridge, "core.progress").subscribe(payload => received.push(payload))

        // Act
        subscription.unsubscribe()
        bridge.emit("core.progress", { requestId: "op-1", message: "git", done: null, total: null })

        // Assert
        expect(received).toEqual([])
    })
})
