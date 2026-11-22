import { TestBed } from "@angular/core/testing"
import { aFolder, aPickedFolder, aProject } from "../../projects.mocks"
import { settle, setUpProjects } from "../../projectsTestBed.mocks"
import { FolderRelinkRequests } from "../../services/folderRelinkRequests.service"
import { FolderRelinkHostComponent } from "./folderRelinkHost.component"

describe("FolderRelinkHostComponent", () => {
    it("should start the re-link of a requested folder", async () => {
        // Arrange
        HTMLDialogElement.prototype.showModal = jest.fn()
        const testBed = await setUpProjects({
            projects: [aProject("p-1", [aFolder("f-gone", { label: "gone", status: "missing" })])],
            activeProjectId: "p-1",
            pickedFolders: [aPickedFolder("moved")]
        })
        TestBed.createComponent(FolderRelinkHostComponent).autoDetectChanges()

        // Act
        TestBed.inject(FolderRelinkRequests).ask({ id: "f-gone", label: "gone" })
        await settle()

        // Assert
        expect(testBed.requestsOf("projects.pickFolder")).toEqual([{ title: "Re-link 'gone'" }])
        expect(testBed.requestsOf("projects.relinkFolder")).toEqual([expect.objectContaining({ folderId: "f-gone" })])
    })
})
