import { TestBed } from "@angular/core/testing"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { ProjectsFacade } from "../../projects/facade"
import { FOLDER, GITHUB_STATUS, HEAD_SHA } from "../ports/compareGateways.mocks"
import { HostingGatewayAdapter } from "./hostingGateway.adapter"

describe("HostingGatewayAdapter", () => {
    let bridge: FakeDesktopBridge
    let projects: { setFolderHosting: jest.Mock }
    let adapter: HostingGatewayAdapter

    beforeEach(() => {
        bridge = createFakeDesktopBridge({
            responses: {
                "hosting.status": GITHUB_STATUS,
                "hosting.fetchChangeRequestHead": { gitRef: "refs/codecharta/pr/7", commit: HEAD_SHA }
            }
        })
        projects = { setFolderHosting: jest.fn().mockResolvedValue(undefined) }
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: ProjectsFacade, useValue: projects }
            ]
        })
        adapter = TestBed.inject(HostingGatewayAdapter)
    })

    it("should ask the core for the folder's hosting", async () => {
        // Act
        const status = await adapter.status(FOLDER)

        // Assert
        expect(status).toEqual(GITHUB_STATUS)
        expect(bridge.calls.at(-1)?.args).toEqual(["hosting.status", { folder: FOLDER }, undefined])
    })

    it("should fetch a head as a cancellable operation", async () => {
        // Arrange
        const params = { folder: FOLDER, remote: "origin", provider: "github" as const, number: 7 }

        // Act
        const head = await adapter.fetchHead(params, "fetch-1")
        await adapter.cancel("fetch-1")

        // Assert
        expect(head.commit).toBe(HEAD_SHA)
        expect(bridge.calls.map(call => call.args)).toContainEqual(["hosting.fetchChangeRequestHead", params, { operationId: "fetch-1" }])
        expect(bridge.calls.at(-1)).toEqual({ name: "cancel", args: ["fetch-1"] })
    })

    it("should throw the core's error", async () => {
        // Arrange
        bridge.failWith("hosting.status", { code: "NOT_A_REPOSITORY", message: "Not a repository.", details: {} })

        // Act
        const answer = adapter.status(FOLDER)

        // Assert
        await expect(answer).rejects.toBeInstanceOf(DesktopBridgeError)
    })

    it("should keep a host override on the folder", async () => {
        // Act
        await adapter.setOverride(FOLDER, { provider: "gitlab", host: "git.example.org" })

        // Assert
        expect(projects.setFolderHosting).toHaveBeenCalledWith(FOLDER.folderId, { provider: "gitlab", host: "git.example.org" })
    })
})
