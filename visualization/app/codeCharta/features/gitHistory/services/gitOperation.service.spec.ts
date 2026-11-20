import { TestBed } from "@angular/core/testing"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { aRefs, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { GitApiService } from "./gitApi.service"
import { GitConfirmationService } from "./gitConfirmation.service"
import { provideGitHistory, settleGit } from "./gitHistoryTestBed.mocks"
import { GitOperationService } from "./gitOperation.service"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api")])
const PROGRESS = { message: "Receiving objects: 45% (9/20)", done: 45, total: 100 }

function seedWith(extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
    return { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs(), ...extra } } }
}

describe("GitOperationService", () => {
    let bridge: FakeDesktopBridge

    async function createService(seed = seedWith(), { isHooksNoticeAccepted = true } = {}) {
        bridge = provideGitHistory(seed, BILLING).bridge
        const confirmations = TestBed.inject(GitConfirmationService)
        if (isHooksNoticeAccepted) {
            jest.spyOn(confirmations, "ask").mockResolvedValue(true)
        }
        const service = TestBed.inject(GitOperationService)
        await settleGit()
        return { service, api: TestBed.inject(GitApiService), confirmations }
    }

    const readsOf = (method: string) => bridge.calls.filter(call => call.name === "request" && call.args[0] === method).length

    function fetchWith(api: GitApiService) {
        return { kind: "fetch" as const, repo: API, send: (operationId: string) => api.fetch({ repo: API, prune: false }, operationId) }
    }

    it("should run an operation under a fresh operation id and show its progress while it runs", async () => {
        // Arrange
        const { service, api } = await createService(seedWith({ slow: { "git.fetch": { progress: PROGRESS } } }))

        // Act
        const result = service.run(fetchWith(api))
        await settleGit()
        const running = service.running()
        service.cancel()
        const answer = await result

        // Assert
        expect(running).toEqual({ repo: API, kind: "fetch", operationId: "git-operation-1", progress: PROGRESS })
        expect(bridge.calls.find(call => call.name === "cancel")?.args).toEqual(["git-operation-1"])
        expect(answer).toEqual({ ok: false, error: expect.objectContaining({ code: "CANCELLED" }) })
        expect(service.running()).toBe(null)
    })

    it("should ignore the progress of other requests", async () => {
        // Arrange
        const { service, api } = await createService(seedWith({ slow: { "git.fetch": {} } }))

        // Act
        const result = service.run(fetchWith(api))
        await settleGit()
        bridge.emit("core.progress", { requestId: "analysis-7", ...PROGRESS })
        const progress = service.running()?.progress
        service.cancel()
        await result

        // Assert
        expect(progress).toBe(null)
    })

    it("should refuse a second operation while one runs and offer cancel only for network operations", async () => {
        // Arrange
        const { service, api } = await createService(seedWith({ slow: { "git.fetch": {} } }))

        // Act
        const first = service.run(fetchWith(api))
        await settleGit()
        const second = await service.run({ ...fetchWith(api), kind: "switch" })
        const isCancellable = service.isCancellable()
        service.cancel()
        await first

        // Assert
        expect(second).toBe(null)
        expect(isCancellable).toBe(true)
        expect(service.isBusy()).toBe(false)
    })

    it("should read the repository again after an operation, also after a failure", async () => {
        // Arrange
        const failure = { code: "NETWORK_UNAVAILABLE" as const, message: "git could not reach the remote.", details: {} }
        const { service, api } = await createService(seedWith({ failures: { "git.fetch": failure } }))
        const readsBefore = readsOf("git.status")

        // Act
        const answer = await service.run(fetchWith(api))
        await settleGit()

        // Assert
        expect(answer?.ok).toBe(false)
        expect(readsOf("git.status")).toBeGreaterThan(readsBefore)
    })

    it("should do nothing on cancel while nothing runs", async () => {
        // Arrange
        const { service } = await createService()

        // Act
        service.cancel()

        // Assert
        expect(bridge.calls.some(call => call.name === "cancel")).toBe(false)
        expect(service.isCancellable()).toBe(false)
    })

    it("should show the hooks notice before the first write of a repository and session only", async () => {
        // Arrange
        const { service, api, confirmations } = await createService(seedWith(), { isHooksNoticeAccepted: false })

        // Act
        const first = service.run(fetchWith(api))
        await settleGit()
        const asked = confirmations.current()
        confirmations.answer(true)
        await first
        await service.run(fetchWith(api))

        // Assert
        expect(asked).toEqual(expect.objectContaining({ title: "Git Hooks", verb: null }))
        expect(confirmations.current()).toBe(null)
        expect(bridge.calls.filter(call => call.args[0] === "git.fetch")).toHaveLength(2)
    })

    it("should send nothing when the hooks notice is declined, and ask again next time", async () => {
        // Arrange
        const { service, api, confirmations } = await createService(seedWith(), { isHooksNoticeAccepted: false })

        // Act
        const declined = service.run(fetchWith(api))
        await settleGit()
        confirmations.answer(false)
        const answer = await declined
        void service.run(fetchWith(api))
        await settleGit()

        // Assert
        expect(answer).toBe(null)
        expect(bridge.calls.some(call => call.args[0] === "git.fetch")).toBe(false)
        expect(confirmations.current()?.title).toBe("Git Hooks")
    })
})
