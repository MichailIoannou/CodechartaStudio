import { CORE_PROTOCOL_VERSION } from "../../model/coreApi/coreApi"
import { createFakeDesktopBridge, FakeDesktopSeed } from "./desktopBridge.mocks"

const TOOL_FAILURE = { code: "TOOL_FAILED" as const, message: "git failed", details: {} }

describe("createFakeDesktopBridge", () => {
    it("should speak the protocol version of the contract by default", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()

        // Act
        const { protocolVersion } = bridge

        // Assert
        expect(protocolVersion).toBe(CORE_PROTOCOL_VERSION)
    })

    it("should record each call", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ responses: { "core.ping": { coreVersion: "0.1.0" } } })

        // Act
        await bridge.request("core.ping", {}, { operationId: "op-1" })
        await bridge.cancel("op-1")
        await bridge.reveal({ kind: "storeRoot" })

        // Assert
        expect(bridge.calls).toEqual([
            { name: "request", args: ["core.ping", {}, { operationId: "op-1" }] },
            { name: "cancel", args: ["op-1"] },
            { name: "reveal", args: [{ kind: "storeRoot" }] }
        ])
    })

    it("should answer a seeded method with its value", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ responses: { "core.ping": { coreVersion: "0.1.0" } } })

        // Act
        const result = await bridge.request("core.ping", {})

        // Assert
        expect(result).toEqual({ ok: true, value: { coreVersion: "0.1.0" } })
    })

    it("should fail a seeded method", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ failures: { "tools.doctor": TOOL_FAILURE } })

        // Act
        const result = await bridge.request("tools.doctor", { refresh: true })

        // Assert
        expect(result).toEqual({ ok: false, error: TOOL_FAILURE })
    })

    it("should fail a method nobody seeded with NOT_FOUND", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()

        // Act
        const result = await bridge.request("paths.get", {})

        // Assert
        expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
    })

    it("should let a test change the answers after creation", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ failures: { "core.ping": TOOL_FAILURE } })

        // Act
        bridge.respondWith("core.ping", { coreVersion: "1.0.0" })
        const answered = await bridge.request("core.ping", {})
        bridge.failWith("core.ping", TOOL_FAILURE)
        const failed = await bridge.request("core.ping", {})

        // Assert
        expect(answered).toEqual({ ok: true, value: { coreVersion: "1.0.0" } })
        expect(failed).toEqual({ ok: false, error: TOOL_FAILURE })
    })

    it("should answer the pickers and shell actions with seeds or cancelled defaults", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ responses: { pickFolder: "/projects/app" } })

        // Act
        const folder = await bridge.pickFolder({ title: "Folder" })
        const file = await bridge.pickFile({ title: "File" })
        const chosen = await bridge.chooseStoreRoot({ title: "Store" })
        const map = await bridge.readSnapshotMap({ projectId: "p", folderId: "f", snapshotId: "s" })

        // Assert
        expect(folder).toBe("/projects/app")
        expect(file).toBeNull()
        expect(chosen).toEqual({ ok: true, value: null })
        expect(map.ok).toBe(false)
    })

    it("should answer the project methods of the shell as if nothing was picked or found", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const folderRef = { projectId: "p-1", folderId: "f-1" }

        // Act
        const picked = await bridge.request("projects.pickFolder", { title: "Add Folder" })
        const sourceFile = await bridge.request("projects.readSourceFile", { ...folderRef, relativePath: "src/app.ts" })
        const revealed = await bridge.request("projects.revealFolder", folderRef)

        // Assert
        expect([picked, sourceFile, revealed]).toEqual([
            { ok: true, value: null },
            { ok: true, value: null },
            { ok: true, value: null }
        ])
    })

    it("should deliver emitted events", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const handler = jest.fn()
        bridge.subscribe("core.progress", handler)
        const progress = { requestId: "op-1", message: "git", done: 1, total: 5 }

        // Act
        bridge.emit("core.progress", progress)

        // Assert
        expect(handler).toHaveBeenCalledWith(progress)
    })

    it("should deliver the current core state first and then every change", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ coreState: { state: "starting", message: null } })
        const states: string[] = []

        // Act
        bridge.subscribe("shell.coreState", coreState => states.push(coreState.state))
        await Promise.resolve()
        bridge.emit("shell.coreState", { state: "ready", message: null })

        // Assert
        expect(states).toEqual(["starting", "ready"])
    })

    it("should stop delivering after unsubscribing", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const handler = jest.fn()
        const unsubscribe = bridge.subscribe("core.progress", handler)

        // Act
        unsubscribe()
        bridge.emit("core.progress", { requestId: "op-1", message: "git", done: null, total: null })

        // Assert
        expect(handler).not.toHaveBeenCalled()
    })

    it("should work when rebuilt from its own source text", async () => {
        // Arrange
        const seed: FakeDesktopSeed = { protocolVersion: 7, responses: { "core.ping": { coreVersion: "0.1.0" } } }
        const rebuild = new Function(`return (${createFakeDesktopBridge.toString()})(${JSON.stringify(seed)})`)

        // Act
        const rebuilt = rebuild() as ReturnType<typeof createFakeDesktopBridge>
        const result = await rebuilt.request("core.ping", {})

        // Assert
        expect(rebuilt.protocolVersion).toBe(7)
        expect(result).toEqual({ ok: true, value: { coreVersion: "0.1.0" } })
        expect(rebuilt.calls).toHaveLength(1)
    })
})
