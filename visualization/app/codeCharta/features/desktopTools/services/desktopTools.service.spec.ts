import { TestBed } from "@angular/core/testing"
import type { PathsInfo } from "../../../model/coreApi/PathsInfo"
import type { ToolsReport } from "../../../model/coreApi/ToolsReport"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { ToastService } from "../../shared/facade"
import { aToolsReport, PATHS } from "../desktopTools.mocks"
import { DesktopToolsService } from "./desktopTools.service"

const CACHED_REPORT = aToolsReport()
const FRESH_REPORT: ToolsReport = { ...aToolsReport(), checkedAt: "2026-11-19T10:00:00Z" }

describe("DesktopToolsService", () => {
    let bridge: FakeDesktopBridge
    let toastService: { show: jest.Mock }

    function createService(seed: FakeDesktopSeed = {}) {
        bridge = createFakeDesktopBridge({ responses: { "tools.doctor": CACHED_REPORT, "paths.get": PATHS }, ...seed })
        toastService = { show: jest.fn() }
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: ToastService, useValue: toastService }
            ]
        })
        return TestBed.inject(DesktopToolsService)
    }

    async function settle() {
        await Promise.resolve()
        TestBed.tick()
        await new Promise(resolve => setTimeout(resolve))
    }

    function requestsOf(method: string) {
        return bridge.calls.filter(call => call.name === "request" && call.args[0] === method)
    }

    it("should load the cached report once", async () => {
        // Arrange
        const service = createService()
        await settle()

        // Act
        await service.load()

        // Assert
        expect(requestsOf("tools.doctor")).toHaveLength(1)
        expect(requestsOf("tools.doctor")[0].args[1]).toEqual({ refresh: false })
        expect(service.report()).toEqual(CACHED_REPORT)
        expect(service.paths()).toEqual<PathsInfo>(PATHS)
    })

    it("should wait for the core before loading", async () => {
        // Arrange
        const service = createService({ coreState: { state: "starting", message: null } })
        await settle()
        const callsWhileStarting = requestsOf("tools.doctor").length

        // Act
        bridge.emit("shell.coreState", { state: "ready", message: null })
        await settle()

        // Assert
        expect(callsWhileStarting).toBe(0)
        expect(service.report()).toEqual(CACHED_REPORT)
    })

    it("should load again when the core is back after an outage", async () => {
        // Arrange
        createService()
        await settle()

        // Act
        bridge.emit("shell.coreState", { state: "restarting", message: null })
        await settle()
        bridge.emit("shell.coreState", { state: "ready", message: null })
        await settle()

        // Assert
        expect(requestsOf("tools.doctor")).toHaveLength(2)
    })

    it("should show progress while checking again", async () => {
        // Arrange
        const service = createService()
        await settle()
        bridge.respondWith("tools.doctor", FRESH_REPORT)

        // Act
        const checking = service.recheck()
        const operationId = (requestsOf("tools.doctor")[1].args[2] as { operationId: string }).operationId
        bridge.emit("core.progress", { requestId: "another-operation", message: "", done: 1, total: 5 })
        const progressOfOthers = service.progress()
        bridge.emit("core.progress", { requestId: operationId, message: "Checked 3 of 5 tools", done: 3, total: 5 })
        const progressWhileChecking = service.progress()
        const isCheckingWhileChecking = service.isChecking()
        await checking

        // Assert
        expect(requestsOf("tools.doctor")[1].args[1]).toEqual({ refresh: true })
        expect(progressOfOthers).toBeNull()
        expect(progressWhileChecking).toEqual(expect.objectContaining({ done: 3, total: 5 }))
        expect(isCheckingWhileChecking).toBe(true)
        expect(service.isChecking()).toBe(false)
        expect(service.progress()).toBeNull()
        expect(service.report()).toEqual(FRESH_REPORT)
    })

    it("should report a failed check and keep the old report", async () => {
        // Arrange
        const service = createService()
        await settle()
        bridge.failWith("tools.doctor", { code: "INTERNAL", message: "the check broke", details: {} })

        // Act
        await service.recheck()

        // Assert
        expect(service.failure()).toBe("the check broke")
        expect(service.report()).toEqual(CACHED_REPORT)
    })

    it("should keep the old report when choosing fails", async () => {
        // Arrange
        const service = createService({
            failures: { chooseToolExecutable: { code: "TOOL_FAILED", message: "git failed: no version", details: { tool: "git" } } }
        })
        await settle()

        // Act
        await service.chooseExecutable("git")

        // Assert
        expect(service.report()).toEqual(CACHED_REPORT)
        expect(service.failure()).toBeNull()
        expect(toastService.show).toHaveBeenCalledWith("The chosen file is not a working Git: git failed: no version", "error")
    })

    it("should show the report of a chosen executable", async () => {
        // Arrange
        const service = createService({ responses: { chooseToolExecutable: FRESH_REPORT } })
        await settle()

        // Act
        await service.chooseExecutable("ccsh")

        // Assert
        expect(service.report()).toEqual(FRESH_REPORT)
        expect(bridge.calls.find(call => call.name === "chooseToolExecutable")?.args).toEqual([
            "ccsh",
            { title: "Choose the ccsh executable", filters: [] }
        ])
    })

    it("should offer only programs in the picker on Windows", async () => {
        // Arrange
        jest.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        const service = createService()
        await settle()

        // Act
        await service.chooseExecutable("java")

        // Assert
        expect(bridge.calls.find(call => call.name === "chooseToolExecutable")?.args[1]).toEqual({
            title: "Choose the Java executable",
            filters: [{ name: "Programs", extensions: ["exe", "cmd", "bat"] }]
        })
    })

    it("should change nothing when the picker is cancelled", async () => {
        // Arrange
        const service = createService()
        await settle()

        // Act
        await service.chooseExecutable("gh")

        // Assert
        expect(service.report()).toEqual(CACHED_REPORT)
        expect(toastService.show).not.toHaveBeenCalled()
    })

    it("should stay silent when cancelled", async () => {
        // Arrange
        const service = createService()
        await settle()
        bridge.failWith("tools.doctor", { code: "CANCELLED", message: "cancelled", details: {} })

        // Act
        await service.recheck()

        // Assert
        expect(service.failure()).toBeNull()
        expect(toastService.show).not.toHaveBeenCalled()
        expect(service.report()).toEqual(CACHED_REPORT)
    })

    it("should go back to the default executable", async () => {
        // Arrange
        const service = createService({ responses: { "tools.clearPath": FRESH_REPORT } })
        await settle()

        // Act
        await service.useDefault("ccsh")

        // Assert
        expect(requestsOf("tools.clearPath")[0].args[1]).toEqual({ tool: "ccsh" })
        expect(service.report()).toEqual(FRESH_REPORT)
    })

    it("should reveal the data folder", async () => {
        // Arrange
        const service = createService()

        // Act
        await service.showDataFolder()

        // Assert
        expect(bridge.calls.find(call => call.name === "reveal")?.args).toEqual([{ kind: "dataFolder" }])
    })

    it("should say why the data folder could not be shown", async () => {
        // Arrange
        const service = createService({ failures: { reveal: { code: "IO", message: "no file manager", details: {} } } })

        // Act
        await service.showDataFolder()

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("no file manager", "error")
    })

    it("should ask the shell to restart the core", async () => {
        // Arrange
        const service = createService()

        // Act
        await service.restartCore()

        // Assert
        expect(bridge.calls.some(call => call.name === "restartCore")).toBe(true)
    })
})
