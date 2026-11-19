import { TestBed } from "@angular/core/testing"
import type { DesktopBridge } from "../../../util/desktop/desktopBridge"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { aLogCommit, anErrorPayload, aRepositoryInfo } from "./gitApi.mocks"
import { GitApiService } from "./gitApi.service"

describe("GitApiService", () => {
    const repo = { projectId: "p-billing", folderId: "f-api" }

    function apiWith(bridge: DesktopBridge | null) {
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }] })
        return TestBed.inject(GitApiService)
    }

    it("should answer the value the core returns", async () => {
        // Arrange
        const api = apiWith(createFakeDesktopBridge({ git: { "f-api": { info: aRepositoryInfo() } } }))

        // Act
        const answer = await api.repositoryInfo(repo)

        // Assert
        expect(answer).toEqual({ ok: true, value: aRepositoryInfo() })
    })

    it("should ask the core for the details of one commit", async () => {
        // Arrange
        const commit = aLogCommit("a", "Fix invoice rounding")
        const api = apiWith(createFakeDesktopBridge({ git: { "f-api": { commits: [commit] } } }))

        // Act
        const answer = await api.commitDetails(repo, commit.sha)

        // Assert
        expect(answer).toEqual({ ok: true, value: expect.objectContaining({ sha: commit.sha, message: "Fix invoice rounding" }) })
    })

    it("should ask the core how far commits are from a target", async () => {
        // Arrange
        const older = aLogCommit("1", "Older")
        const newer = aLogCommit("2", "Newer", ["1"])
        const api = apiWith(createFakeDesktopBridge({ git: { "f-api": { commits: [newer, older] } } }))

        // Act
        const answer = await api.measureDistances(repo, newer.sha, [older.sha])

        // Assert
        expect(answer).toEqual({ ok: true, value: { distances: [{ sha: older.sha, onlyInCandidate: 0, onlyInTarget: 1 }] } })
    })

    it("should map a git rpc error to a git error with git's text and the repository path", async () => {
        // Arrange
        const payload = anErrorPayload("DUBIOUS_OWNERSHIP", "Git does not trust the folder.", {
            detail: "fatal: detected dubious ownership",
            repositoryPath: "/work/billing-api"
        })
        const api = apiWith(createFakeDesktopBridge({ git: { "f-api": { failures: { "git.status": payload } } } }))

        // Act
        const answer = await api.status(repo)

        // Assert
        expect(answer).toEqual({
            ok: false,
            error: {
                code: "DUBIOUS_OWNERSHIP",
                message: "Git does not trust the folder.",
                detail: "fatal: detected dubious ownership",
                repositoryPath: "/work/billing-api"
            }
        })
    })

    it("should treat a failing transport as a failed git command with its text", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        bridge.request = jest.fn().mockRejectedValue(new Error("The core went away."))
        const api = apiWith(bridge)

        // Act
        const answer = await api.branches(repo)

        // Assert
        expect(answer).toEqual({
            ok: false,
            error: { code: "COMMAND_FAILED", message: "The core went away.", detail: null, repositoryPath: null }
        })
    })

    it("should fail every call without the desktop bridge", async () => {
        // Arrange
        const api = apiWith(null)

        // Act
        const answer = await api.refsFingerprint(repo)

        // Assert
        expect(answer).toEqual({ ok: false, error: expect.objectContaining({ code: "COMMAND_FAILED" }) })
    })

    it("should ask the core for the log with the given scope", async () => {
        // Arrange
        const bridge: FakeDesktopBridge = createFakeDesktopBridge({ git: { "f-api": { commits: [] } } })
        const api = apiWith(bridge)
        const params = { repo, scope: { kind: "head" as const }, filter: null, cursor: null }

        // Act
        const answer = await api.log(params)

        // Assert
        expect(answer.ok).toBe(true)
        expect(bridge.calls.at(-1)?.args).toEqual(["git.log", params, undefined])
    })

    it("should pass each repository change to the listener until it stops listening", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const api = apiWith(bridge)
        const listener = jest.fn()
        const change = { repo, repositoryId: "/work/billing-api/.git", parts: ["refs" as const], fingerprint: "f2" }

        // Act
        const stopListening = api.onRepositoryChanged(listener)
        bridge.emit("repository.changed", change)
        stopListening()
        bridge.emit("repository.changed", change)

        // Assert
        expect(listener).toHaveBeenCalledTimes(1)
        expect(listener).toHaveBeenCalledWith(change)
    })

    it("should listen to no repository changes without the desktop bridge", () => {
        // Arrange
        const api = apiWith(null)

        // Act
        const stopListening = api.onRepositoryChanged(jest.fn())

        // Assert
        expect(stopListening()).toBeUndefined()
    })
})
