import { TestBed } from "@angular/core/testing"
import { createFakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { aCommit, aGitStatus } from "../projects.mocks"
import { FolderGitService, RECENT_COMMIT_COUNT } from "./folderGit.service"

const API = { projectId: "p-1", folderId: "f-api" }
const OUT = { projectId: "p-1", folderId: "f-out" }

describe("FolderGitService", () => {
    function createService(seed: FakeDesktopSeed) {
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: createFakeDesktopBridge(seed) }] })
        return TestBed.inject(FolderGitService)
    }

    it("should not know a status before it was fetched", () => {
        // Arrange
        const service = createService({})

        // Act
        const status = service.statusOf(API)

        // Assert
        expect(status).toBeUndefined()
    })

    it("should cache the status of each folder and null when git cannot answer", async () => {
        // Arrange
        const service = createService({ gitStatuses: { "f-api": aGitStatus("main") } })

        // Act
        await service.refresh([API, OUT])

        // Assert
        expect(service.statusOf(API)).toEqual(aGitStatus("main"))
        expect(service.statusOf(OUT)).toBeNull()
    })

    it("should read the newest commits of the head", async () => {
        // Arrange
        const commits = Array.from({ length: RECENT_COMMIT_COUNT + 2 }, (_, index) =>
            aCommit(`${index}`.padStart(7, "a"), `Commit ${index}`)
        )
        const service = createService({ gitLogs: { "f-api": commits } })

        // Act
        const recent = await service.recentCommits(API)
        const none = await service.recentCommits(OUT)

        // Assert
        expect(recent).toEqual(commits.slice(0, RECENT_COMMIT_COUNT))
        expect(none).toBeNull()
    })
})
