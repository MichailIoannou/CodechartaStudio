import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { aCommit, aFolder, aProject } from "../../projects/projects.mocks"
import { isGitStatus } from "../model/folderGitStatus"
import { WORKING_FOLDER_SOURCE } from "../ports/workingFolderSource.port"
import { anErrorPayload, aRefs, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { FOCUS_REFRESH_THROTTLE_MS, GitRepositoryService, RECENT_COMMIT_COUNT } from "./gitRepository.service"

const API = { projectId: "p-billing", folderId: "f-api" }
const WEB = { projectId: "p-billing", folderId: "f-web" }
const API_FOLDER = aFolder("f-api")
const WEB_FOLDER = aFolder("f-web", { role: "helper" })
const BILLING = aProject("p-billing", [API_FOLDER, WEB_FOLDER])

const SEED: FakeDesktopSeed = {
    git: {
        "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs() },
        "f-web": { info: aRepositoryInfo({ rootPath: "/work/billing-web" }), status: aStatusOn("develop"), refs: aRefs() }
    }
}

describe("GitRepositoryService", () => {
    let bridge: FakeDesktopBridge
    const activeProject = signal<Project | null>(null)
    const workingFolder = signal<ProjectFolder | null>(null)

    async function createService(seed: FakeDesktopSeed = SEED, folder: ProjectFolder | null = API_FOLDER) {
        bridge = createFakeDesktopBridge(seed)
        activeProject.set(folder ? BILLING : null)
        workingFolder.set(folder)
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: WORKING_FOLDER_SOURCE, useValue: { activeProject, workingFolder } }
            ]
        })
        const service = TestBed.inject(GitRepositoryService)
        await settle()
        return service
    }

    async function settle() {
        for (let round = 0; round < 4; round++) {
            TestBed.tick()
            await new Promise(resolve => setTimeout(resolve))
        }
    }

    const requestsOf = (method: string) => bridge.calls.filter(call => call.name === "request" && call.args[0] === method)

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it("should open the working folder of the active project", async () => {
        // Arrange & Act
        const service = await createService()

        // Assert
        expect(service.activeRepository()).toEqual(API)
        expect(service.repository()).toEqual({ kind: "ready", value: aRepositoryInfo() })
        expect(service.status()).toEqual({ kind: "ready", value: aStatusOn("main") })
        expect(service.refs()).toEqual({ kind: "ready", value: aRefs() })
    })

    it("should stay idle without a working folder", async () => {
        // Arrange & Act
        const service = await createService(SEED, null)

        // Assert
        expect(service.activeRepository()).toBeNull()
        expect([service.repository(), service.status(), service.refs()]).toEqual([{ kind: "idle" }, { kind: "idle" }, { kind: "idle" }])
        expect(requestsOf("git.repositoryInfo")).toHaveLength(0)
    })

    it("should follow the working folder when another one is chosen", async () => {
        // Arrange
        const service = await createService()

        // Act
        workingFolder.set(WEB_FOLDER)
        await settle()

        // Assert
        expect(service.activeRepository()).toEqual(WEB)
        expect(service.status()).toEqual({ kind: "ready", value: aStatusOn("develop") })
    })

    it("should carry the error in the failed state when the folder is no repository", async () => {
        // Arrange
        const failure = anErrorPayload("NOT_A_REPOSITORY", "'billing-api' is not a git repository.")

        // Act
        const service = await createService({ git: { "f-api": { failures: { "git.repositoryInfo": failure } } } })

        // Assert
        const expectedError = { code: "NOT_A_REPOSITORY", message: failure.message, detail: null, repositoryPath: null }
        expect(service.repository()).toEqual({ kind: "failed", error: expectedError })
        expect(service.status()).toEqual({ kind: "failed", error: expectedError })
        expect(service.refs()).toEqual({ kind: "failed", error: expectedError })
    })

    it("should drop a late result after a folder change", async () => {
        // Arrange
        const service = await createService()
        let answerTheSlowStatus: () => void = () => undefined
        const request = bridge.request.bind(bridge)
        jest.spyOn(bridge, "request").mockImplementation(((method: string, params: { repo: { folderId: string } }) => {
            const answer = request(method as "git.status", params as never)
            return method === "git.status" && params.repo.folderId === "f-api"
                ? new Promise(resolve => {
                      answerTheSlowStatus = () => resolve(answer)
                  })
                : answer
        }) as never)
        void service.refresh("manual")
        await settle()

        // Act
        workingFolder.set(WEB_FOLDER)
        await settle()
        answerTheSlowStatus()
        await settle()

        // Assert
        expect(service.status()).toEqual({ kind: "ready", value: aStatusOn("develop") })
    })

    it("should reopen a folder that was re-linked to another path", async () => {
        // Arrange
        await createService()

        // Act
        workingFolder.set({ ...API_FOLDER, path: "/elsewhere/billing-api" })
        await settle()

        // Assert
        expect(requestsOf("git.repositoryInfo")).toHaveLength(2)
    })

    it("should read everything again on a manual refresh and say so while it runs", async () => {
        // Arrange
        const service = await createService()
        bridge.respondWith("git.status", aStatusOn("feature/x"))

        // Act
        const refreshed = service.refresh("manual")
        const isRefreshingMeanwhile = service.isRefreshing()
        await refreshed

        // Assert
        expect(isRefreshingMeanwhile).toBe(true)
        expect(service.isRefreshing()).toBe(false)
        expect(service.status()).toEqual({ kind: "ready", value: aStatusOn("feature/x") })
        expect(requestsOf("git.repositoryInfo")).toHaveLength(2)
    })

    it("should reload the refs on focus only when their fingerprint changed", async () => {
        // Arrange
        const service = await createService()
        jest.spyOn(Date, "now").mockReturnValue(1_000_000)

        // Act
        globalThis.dispatchEvent(new Event("focus"))
        await settle()
        const branchReadsWithSameFingerprint = requestsOf("git.branches").length
        bridge.respondWith("git.refsFingerprint", "fingerprint-2")
        jest.spyOn(Date, "now").mockReturnValue(1_000_000 + FOCUS_REFRESH_THROTTLE_MS)
        globalThis.dispatchEvent(new Event("focus"))
        await settle()

        // Assert
        expect(branchReadsWithSameFingerprint).toBe(1)
        expect(requestsOf("git.branches")).toHaveLength(2)
        expect(requestsOf("git.status")).toHaveLength(3)
        expect(service.refs().kind).toBe("ready")
    })

    it("should throttle refreshes on focus", async () => {
        // Arrange
        await createService()
        jest.spyOn(Date, "now").mockReturnValue(1_000_000)

        // Act
        globalThis.dispatchEvent(new Event("focus"))
        jest.spyOn(Date, "now").mockReturnValue(1_000_000 + FOCUS_REFRESH_THROTTLE_MS - 1)
        globalThis.dispatchEvent(new Event("focus"))
        await settle()

        // Assert
        expect(requestsOf("git.refsFingerprint")).toHaveLength(1)
    })

    it("should try the whole repository again on focus while it has a problem", async () => {
        // Arrange
        const failure = anErrorPayload("TOOL_NOT_FOUND", "git was not found.")
        const service = await createService({ git: { "f-api": { ...SEED.git?.["f-api"], failures: { "git.repositoryInfo": failure } } } })
        bridge.respondWith("git.repositoryInfo", aRepositoryInfo())

        // Act
        globalThis.dispatchEvent(new Event("focus"))
        await settle()

        // Assert
        expect(service.repository()).toEqual({ kind: "ready", value: aRepositoryInfo() })
        expect(service.refs().kind).toBe("ready")
    })

    it("should refresh the parts a repository change names", async () => {
        // Arrange
        const service = await createService()
        bridge.respondWith("git.status", aStatusOn("feature/x"))
        bridge.respondWith("git.branches", aRefs({ fingerprint: "fingerprint-2" }))

        // Act
        bridge.emit("repository.changed", { repo: API, repositoryId: "r", parts: ["refs"], fingerprint: "fingerprint-2" })
        await settle()

        // Assert
        expect(service.refs()).toEqual({ kind: "ready", value: aRefs({ fingerprint: "fingerprint-2" }) })
        expect(service.status()).toEqual({ kind: "ready", value: aStatusOn("main") })
    })

    it("should refresh the status when the working tree of the active repository changed", async () => {
        // Arrange
        const service = await createService()
        bridge.respondWith("git.status", aStatusOn("feature/x"))

        // Act
        bridge.emit("repository.changed", { repo: API, repositoryId: "r", parts: ["workingTree"], fingerprint: null })
        await settle()

        // Assert
        expect(service.status()).toEqual({ kind: "ready", value: aStatusOn("feature/x") })
        expect(requestsOf("git.branches")).toHaveLength(1)
    })

    it("should ignore a change of another repository", async () => {
        // Arrange
        await createService()

        // Act
        bridge.emit("repository.changed", { repo: WEB, repositoryId: "r", parts: ["status", "refs"], fingerprint: null })
        await settle()

        // Assert
        expect(requestsOf("git.status")).toHaveLength(1)
    })

    it("should not know the status of a folder before it was read", async () => {
        // Arrange
        const service = await createService(SEED, null)

        // Act
        const status = service.statusOf(API)

        // Assert
        expect(status).toBeUndefined()
    })

    it("should keep the status of each folder and the problem when git cannot answer", async () => {
        // Arrange
        const service = await createService({ git: { "f-api": { status: aStatusOn("main") } } }, null)
        const out = { projectId: "p-billing", folderId: "f-out" }

        // Act
        await service.refreshFolders([API, out])

        // Assert
        expect(service.statusOf(API)).toEqual(aStatusOn("main"))
        expect(service.statusOf(out)).toEqual({ problem: "The fake desktop bridge has no repository for f-out." })
        expect([service.statusOf(API), service.statusOf(out), undefined].map(isGitStatus)).toEqual([true, false, false])
    })

    it("should share the status it read for the working folder with the folder statuses", async () => {
        // Arrange & Act
        const service = await createService()

        // Assert
        expect(service.statusOf(API)).toEqual(aStatusOn("main"))
    })

    it("should read the newest commits of the head", async () => {
        // Arrange
        const commits = Array.from({ length: RECENT_COMMIT_COUNT + 2 }, (_, index) =>
            aCommit(`${index}`.padStart(7, "a"), `Commit ${index}`)
        )
        const service = await createService({ git: { "f-api": { commits } } }, null)

        // Act
        const recent = await service.recentCommits(API)
        const none = await service.recentCommits(WEB)

        // Assert
        expect(recent).toEqual(commits.slice(0, RECENT_COMMIT_COUNT))
        expect(none).toBeNull()
    })
})
