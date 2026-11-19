import { TestBed } from "@angular/core/testing"
import { LoadFilesUseCase } from "../../../load/load.facade"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { QueryParamsService } from "../../../util/queryParameter/queryParams.service"
import { ProjectsService } from "./projects.service"
import { ProjectsBootService } from "./projectsBoot.service"

const LOADED = {
    loaded: [{ origin: { projectId: "p", folderId: "f", snapshotId: "s", folderLabel: "api" }, checksum: "c", rootName: "r" }]
}
const NOTHING_LOADED = { loaded: [], identicalContent: [], unreadable: [] }

describe("ProjectsBootService", () => {
    let loadFilesUseCase: { loadOnBoot: jest.Mock; bootFromProject: jest.Mock; reloadAfterReset: jest.Mock }
    let projects: Record<string, jest.Mock>

    function createService({ isDesktop = true, hasFile = false } = {}) {
        loadFilesUseCase = {
            loadOnBoot: jest.fn().mockResolvedValue(undefined),
            bootFromProject: jest.fn().mockImplementation(async (resolve: () => Promise<unknown>) => {
                await resolve()
                return LOADED
            }),
            reloadAfterReset: jest.fn().mockResolvedValue(undefined)
        }
        projects = {
            isDesktop: jest.fn().mockReturnValue(isDesktop),
            initialise: jest.fn().mockResolvedValue(undefined),
            snapshotsToShow: jest.fn().mockResolvedValue([]),
            acceptLoadResult: jest.fn().mockResolvedValue(true),
            showWorkingFolder: jest.fn().mockResolvedValue(undefined),
            showOverview: jest.fn(),
            toastUnlessSilent: jest.fn(),
            reloadAfterReset: jest.fn().mockResolvedValue(undefined)
        }
        TestBed.configureTestingModule({
            providers: [
                { provide: LoadFilesUseCase, useValue: loadFilesUseCase },
                { provide: ProjectsService, useValue: projects },
                { provide: QueryParamsService, useValue: { hasFile: () => hasFile } },
                { provide: DesktopEnvironment, useValue: {} }
            ]
        })
        return TestBed.inject(ProjectsBootService)
    }

    it("should call loadOnBoot without a bridge", async () => {
        // Arrange
        const service = createService({ isDesktop: false })

        // Act
        await service.boot()

        // Assert
        expect(loadFilesUseCase.loadOnBoot).toHaveBeenCalled()
        expect(projects.initialise).not.toHaveBeenCalled()
    })

    it("should call loadOnBoot when a file url is present", async () => {
        // Arrange
        const service = createService({ hasFile: true })

        // Act
        await service.boot()

        // Assert
        expect(loadFilesUseCase.loadOnBoot).toHaveBeenCalled()
        expect(loadFilesUseCase.bootFromProject).not.toHaveBeenCalled()
    })

    it("should boot from the active project in desktop", async () => {
        // Arrange
        const service = createService()

        // Act
        await service.boot()

        // Assert
        expect(projects.initialise).toHaveBeenCalled()
        expect(projects.snapshotsToShow).toHaveBeenCalled()
        expect(projects.acceptLoadResult).toHaveBeenCalledWith(LOADED)
        expect(projects.showWorkingFolder).not.toHaveBeenCalled()
        expect(loadFilesUseCase.loadOnBoot).not.toHaveBeenCalled()
    })

    it("should go on with the working folder when the boot snapshot could not be shown", async () => {
        // Arrange
        const service = createService()
        loadFilesUseCase.bootFromProject.mockResolvedValue(NOTHING_LOADED)
        projects.acceptLoadResult.mockResolvedValue(false)

        // Act
        await service.boot()

        // Assert
        expect(projects.showWorkingFolder).toHaveBeenCalled()
    })

    it("should show the overview and toast when the projects cannot be read", async () => {
        // Arrange
        const service = createService()
        const error = new DesktopBridgeError({ code: "IO", message: "store unreadable" })
        projects.initialise.mockRejectedValue(error)

        // Act
        await service.boot()

        // Assert
        expect(projects.toastUnlessSilent).toHaveBeenCalledWith(error, "store unreadable")
        expect(projects.showOverview).toHaveBeenCalled()
        expect(loadFilesUseCase.bootFromProject).not.toHaveBeenCalled()
    })

    it("should reload the shown snapshots after a reset in desktop", async () => {
        // Arrange
        const service = createService()

        // Act
        await service.reloadAfterReset()

        // Assert
        expect(projects.reloadAfterReset).toHaveBeenCalled()
        expect(loadFilesUseCase.reloadAfterReset).not.toHaveBeenCalled()
    })

    it("should call the web reload without a bridge", async () => {
        // Arrange
        const service = createService({ isDesktop: false })

        // Act
        await service.reloadAfterReset()

        // Assert
        expect(loadFilesUseCase.reloadAfterReset).toHaveBeenCalled()
        expect(projects.reloadAfterReset).not.toHaveBeenCalled()
    })
})
