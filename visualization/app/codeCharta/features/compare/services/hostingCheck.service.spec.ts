import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { ToolsReport } from "../../../model/coreApi/ToolsReport"
import { DesktopToolsService } from "../../desktopTools/facade"
import { ProjectsFacade } from "../../projects/facade"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { HOSTING_GATEWAY } from "../ports/compareGateways"
import { FakeHostingGateway, FOLDER, GITHUB_STATUS } from "../ports/compareGateways.mocks"
import { HostingCheckService } from "./hostingCheck.service"

const GIT_FACTS = {
    topLevel: "/work/f-api",
    isRepositoryRoot: true,
    remotes: [{ name: "origin", fetchUrl: "https://github.com/mia/billing.git", pushUrl: null }],
    defaultBranch: "main",
    rootCommits: [],
    isShallow: false,
    detectedAt: "2026-11-20T00:00:00Z"
}
const REPORT: ToolsReport = {
    checkedAt: "2026-11-20T00:00:00Z",
    tools: [
        { tool: "gh", isRequired: false, state: "missing", path: null, source: null, version: null, minimumVersion: null, problem: null }
    ],
    canUseGit: true,
    canAnalyse: true
}

describe("HostingCheckService", () => {
    let hosting: FakeHostingGateway
    let service: HostingCheckService

    beforeEach(() => {
        hosting = new FakeHostingGateway()
        const project = aProject(FOLDER.projectId, [aFolder(FOLDER.folderId, { git: GIT_FACTS as never })])
        TestBed.configureTestingModule({
            providers: [
                { provide: HOSTING_GATEWAY, useValue: hosting },
                { provide: ProjectsFacade, useValue: { activeProject: signal(project) } },
                { provide: DesktopToolsService, useValue: { report: signal(REPORT) } }
            ]
        })
        service = TestBed.inject(HostingCheckService)
    })

    it("should be checking until the core answered", () => {
        // Act
        const panel = service.panelOf(FOLDER)

        // Assert
        expect(panel).toEqual({ kind: "checking" })
    })

    it("should say the CLI is missing once the core named the provider", async () => {
        // Act
        await service.check(FOLDER)

        // Assert
        expect(service.panelOf(FOLDER).kind).toBe("notInstalled")
    })

    it("should ask the core only once per folder until refreshed", async () => {
        // Arrange
        const status = jest.spyOn(hosting, "status")
        await service.check(FOLDER)

        // Act
        await service.check(FOLDER)
        await service.refresh(FOLDER)

        // Assert
        expect(status).toHaveBeenCalledTimes(2)
    })

    it("should leave the segment out when the core cannot tell", async () => {
        // Arrange
        hosting.answer = new Error("no such method")

        // Act
        await service.check(FOLDER)

        // Assert
        expect(service.panelOf(FOLDER)).toEqual({ kind: "absent" })
    })

    it("should treat an overridden host as GitHub Enterprise", async () => {
        // Arrange
        hosting.answer = { ...GITHUB_STATUS, provider: null, host: "git.example.org", detectedBy: null }
        await service.check(FOLDER)
        const beforeOverride = service.panelOf(FOLDER)
        hosting.answer = { ...GITHUB_STATUS, host: "git.example.org", detectedBy: "override" }

        // Act
        await service.treatHostAs(FOLDER, "git.example.org", "github")

        // Assert
        expect(beforeOverride).toEqual({ kind: "unknownHost", host: "git.example.org" })
        expect(hosting.overrides).toEqual([{ provider: "github", host: "git.example.org" }])
        expect(service.panelOf(FOLDER)).toEqual({
            kind: "notInstalled",
            hosting: { provider: "github", host: "git.example.org", repository: "mia/billing", remote: "origin" }
        })
    })
})
