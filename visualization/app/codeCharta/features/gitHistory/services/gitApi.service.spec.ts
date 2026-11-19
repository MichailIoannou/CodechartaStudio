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

    it("should run a write operation under the given operation id", async () => {
        // Arrange
        const bridge: FakeDesktopBridge = createFakeDesktopBridge({ responses: { "git.fetch": { updatedRefs: 0, refs: null } } })
        const api = apiWith(bridge)

        // Act
        await api.fetch({ repo, prune: true }, "git-operation-1")
        await api.switchBranch({ repo, target: { kind: "local", refName: "refs/heads/main" } }, "git-operation-2")

        // Assert
        expect(bridge.calls.filter(call => call.name === "request").map(call => call.args)).toEqual([
            ["git.fetch", { repo, prune: true }, { operationId: "git-operation-1" }],
            ["git.switch", { repo, target: { kind: "local", refName: "refs/heads/main" } }, { operationId: "git-operation-2" }]
        ])
    })

    it("should send every branch operation to its core method", async () => {
        // Arrange
        const bridge: FakeDesktopBridge = createFakeDesktopBridge()
        const api = apiWith(bridge)

        // Act
        await api.createBranch({ repo, name: "x", startPoint: "a".repeat(40), checkout: false }, "op-1")
        await api.renameBranch({ repo, refName: "refs/heads/x", newName: "y" }, "op-2")
        await api.deleteBranch({ repo, target: { kind: "local", refName: "refs/heads/y", force: false } }, "op-3")
        await api.setUpstream({ repo, refName: "refs/heads/y", upstreamRefName: null }, "op-4")

        // Assert
        const methods = bridge.calls.filter(call => call.name === "request").map(call => call.args[0])
        expect(methods).toEqual(["git.branchCreate", "git.branchRename", "git.branchDelete", "git.setUpstream"])
    })

    it("should read the working tree and a diff, and send stage, unstage and discard under their operation ids", async () => {
        // Arrange
        const bridge: FakeDesktopBridge = createFakeDesktopBridge()
        const api = apiWith(bridge)
        const row = { path: "src/a.ts", kind: "unstaged" as const, change: "modified" as const }

        // Act
        await api.workingTree(repo)
        await api.diffFile({ repo, path: row.path, kind: row.kind })
        await api.stage({ repo, target: { kind: "all" } }, "op-1")
        await api.unstage({ repo, paths: [row.path] }, "op-2")
        await api.discard({ repo, entries: [row] }, "op-3")

        // Assert
        expect(bridge.calls.filter(call => call.name === "request").map(call => [call.args[0], call.args[2]])).toEqual([
            ["git.workingTree", undefined],
            ["git.diffFile", undefined],
            ["git.stage", { operationId: "op-1" }],
            ["git.unstage", { operationId: "op-2" }],
            ["git.discard", { operationId: "op-3" }]
        ])
    })

    it("should send a commit under its operation id and ask whether one commit is an ancestor of another", async () => {
        // Arrange
        const bridge: FakeDesktopBridge = createFakeDesktopBridge()
        const api = apiWith(bridge)
        const commit = { repo, subject: "Fix rounding", body: "", amend: false }
        const ancestry = { repo, ancestor: "a".repeat(40), descendant: "b".repeat(40) }

        // Act
        await api.commit(commit, "op-1")
        await api.isAncestor(ancestry)

        // Assert
        expect(bridge.calls.filter(call => call.name === "request").map(call => call.args)).toEqual([
            ["git.commit", commit, { operationId: "op-1" }],
            ["git.isAncestor", ancestry, undefined]
        ])
    })

    it("should answer and cancel prompts and cancel operations through the bridge", async () => {
        // Arrange
        const bridge: FakeDesktopBridge = createFakeDesktopBridge({ responses: { "prompt.answer": null, "prompt.cancel": null } })
        const api = apiWith(bridge)

        // Act
        const answered = await api.answerPrompt("p1", "secret-passphrase")
        await api.cancelPrompt("p2")
        await api.cancel("op-1")

        // Assert
        expect(answered.ok).toBe(true)
        expect(bridge.calls.map(call => [call.name, call.args[0]])).toEqual([
            ["request", "prompt.answer"],
            ["request", "prompt.cancel"],
            ["cancel", "op-1"]
        ])
    })

    it("should pass prompts, closed prompts and progress to their listeners", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const api = apiWith(bridge)
        const listeners = { requested: jest.fn(), closed: jest.fn(), progress: jest.fn() }
        const prompt = { promptId: "p1", requestId: "op-1", repositoryLabel: "billing-api", kind: "secret", message: "Password: " }

        // Act
        api.onPromptRequested(listeners.requested)
        api.onPromptClosed(listeners.closed)
        api.onProgress(listeners.progress)
        bridge.emit("prompt.requested", prompt)
        bridge.emit("prompt.closed", { promptId: "p1" })
        bridge.emit("core.progress", { requestId: "op-1", message: "Receiving objects", done: 1, total: 2 })

        // Assert
        expect(listeners.requested).toHaveBeenCalledWith(prompt)
        expect(listeners.closed).toHaveBeenCalledWith({ promptId: "p1" })
        expect(listeners.progress).toHaveBeenCalledWith({ requestId: "op-1", message: "Receiving objects", done: 1, total: 2 })
    })

    it("should neither listen nor cancel without the desktop bridge", async () => {
        // Arrange
        const api = apiWith(null)

        // Act
        const stops = [api.onPromptRequested(jest.fn()), api.onPromptClosed(jest.fn()), api.onProgress(jest.fn())]

        // Assert
        expect(stops.map(stop => stop())).toEqual([undefined, undefined, undefined])
        await expect(api.cancel("op-1")).resolves.toBeUndefined()
    })
})
