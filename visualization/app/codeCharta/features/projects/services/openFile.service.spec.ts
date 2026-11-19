import { TestBed } from "@angular/core/testing"
import { aFolder, aPickedImportFile, aProject } from "../projects.mocks"
import { setUpProjects } from "../projectsTestBed.mocks"
import { OpenFileService } from "./openFile.service"

describe("OpenFileService", () => {
    it("should keep nothing when the file picker is cancelled", async () => {
        // Arrange
        await setUpProjects({})
        const service = TestBed.inject(OpenFileService)

        // Act
        await service.pickToOpen()
        await service.pickAgain()

        // Assert
        expect(service.pending()).toBeNull()
    })

    it("should resolve no commit when the file name has no hint", async () => {
        // Arrange
        const testBed = await setUpProjects({ pickedImportFile: aPickedImportFile("Downloads") })
        const service = TestBed.inject(OpenFileService)
        await service.pickToOpen()

        // Act
        const commit = await service.resolveHint({ projectId: "p", folderId: "f" })

        // Assert
        expect(commit).toBeNull()
        expect(testBed.requestsOf("projects.resolveCommit")).toEqual([])
    })

    it("should refuse to open when no file is waiting", async () => {
        // Arrange
        await setUpProjects({})
        const service = TestBed.inject(OpenFileService)

        // Act
        const opening = service.open({ kind: "newProject" }, null)

        // Assert
        await expect(opening).rejects.toThrow("No file is waiting to be opened.")
    })

    it("should toast when the snapshot cannot be shown", async () => {
        // Arrange
        const testBed = await setUpProjects({ projects: [aProject("p-1", [aFolder("f-1")])] })
        const service = TestBed.inject(OpenFileService)

        // Act
        await service.show({ projectId: "p-missing", folderId: "f-1", snapshotId: "s-1" })

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith(expect.stringContaining("p-missing"), "error")
    })
})
