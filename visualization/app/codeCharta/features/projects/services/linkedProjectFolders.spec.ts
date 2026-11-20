import { TestBed } from "@angular/core/testing"
import type { FileMeta } from "../../../model/codeCharta.model"
import { LINKED_SOURCE_FOLDERS } from "../../localSource/facade"
import { aFolder, aProject } from "../projects.mocks"
import { setUpProjects } from "../projectsTestBed.mocks"
import { LinkedProjectFolders, provideLinkedProjectFolders } from "./linkedProjectFolders"

describe("LinkedProjectFolders", () => {
    const BILLING = aProject(
        "p-billing",
        [aFolder("f-api", { label: "billing-api", path: "/work/billing-api" }), aFolder("f-old", { label: "old", status: "missing" })],
        { name: "billing" }
    )
    const SOURCE_FILES = { "f-api/src/Invoice.kt": "class Invoice" }

    const projectMap = (folderId: string, folderLabel = folderId): FileMeta => ({
        fileName: `${folderLabel}@1a2b3c4`,
        fileChecksum: "c0ffee",
        apiVersion: "1.5",
        projectName: "billing",
        exportedFileSize: 1,
        projectSnapshot: { projectId: "p-billing", folderId, snapshotId: "s-1", folderLabel }
    })

    async function linkedFolders(): Promise<LinkedProjectFolders> {
        await setUpProjects({ projects: [BILLING], activeProjectId: "p-billing", sourceFiles: SOURCE_FILES })
        return TestBed.inject(LinkedProjectFolders)
    }

    it("should return no folder for an uploaded map", async () => {
        // Arrange
        const folders = await linkedFolders()
        const uploaded: FileMeta = { ...projectMap("f-api"), fileName: "upload.cc.json", projectSnapshot: undefined }

        // Act
        const folder = folders.folderOf(uploaded)

        // Assert
        expect(folder).toBeNull()
    })

    it("should name a missing project folder as unavailable", async () => {
        // Arrange
        const folders = await linkedFolders()

        // Act
        const folder = folders.folderOf(projectMap("f-old", "old"))

        // Assert
        expect(folder).toEqual({ status: "unavailable", label: "old" })
    })

    it("should name a folder the active project does not have as unavailable", async () => {
        // Arrange
        const folders = await linkedFolders()

        // Act
        const folder = folders.folderOf(projectMap("f-removed", "removed"))

        // Assert
        expect(folder).toEqual({ status: "unavailable", label: "removed" })
    })

    it("should give the folder's path as the root of an available folder", async () => {
        // Arrange
        const folders = await linkedFolders()

        // Act
        const folder = folders.folderOf(projectMap("f-api", "billing-api"))

        // Assert
        expect(folder).toEqual(expect.objectContaining({ status: "available", rootPath: "/work/billing-api" }))
    })

    it("should turn the bridge bytes into a file", async () => {
        // Arrange
        const folder = (await linkedFolders()).folderOf(projectMap("f-api", "billing-api"))

        // Act
        const file = folder?.status === "available" ? await folder.readFile("src/Invoice.kt") : null

        // Assert
        expect(file?.name).toBe("Invoice.kt")
        expect(await file?.text()).toBe("class Invoice")
    })

    it("should read nothing for a file the folder does not have", async () => {
        // Arrange
        const folder = (await linkedFolders()).folderOf(projectMap("f-api", "billing-api"))

        // Act
        const file = folder?.status === "available" ? await folder.readFile("src/Gone.kt") : undefined

        // Assert
        expect(file).toBeNull()
    })

    it("should be provided as the linked source folders", () => {
        // Act
        const providers = provideLinkedProjectFolders()

        // Assert
        expect(providers).toEqual([{ provide: LINKED_SOURCE_FOLDERS, useExisting: LinkedProjectFolders }])
    })
})
