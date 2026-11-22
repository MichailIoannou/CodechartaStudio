import { TestBed } from "@angular/core/testing"
import type { FileMeta } from "../../../model/codeCharta.model"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { GitRepositoryService } from "../../gitHistory/facade"
import { LINKED_SOURCE_FOLDERS } from "../../localSource/facade"
import { aFolder, aGitStatus, aProject, aSnapshot } from "../projects.mocks"
import { setUpProjects } from "../projectsTestBed.mocks"
import { FolderRelinkRequests } from "./folderRelinkRequests.service"
import { LinkedProjectFolders, provideLinkedProjectFolders } from "./linkedProjectFolders"

describe("LinkedProjectFolders", () => {
    const BILLING = aProject(
        "p-billing",
        [aFolder("f-api", { label: "billing-api", path: "/work/billing-api" }), aFolder("f-old", { label: "old", status: "missing" })],
        { name: "billing" }
    )
    const SOURCE_FILES = { "f-api/src/Invoice.kt": "class Invoice" }
    const HEAD = "a1b2c3d".padEnd(40, "0")
    const OLDER = "1a2b3c4".padEnd(40, "0")
    const analysedAt = (commit: string, target: "commit" | "workingTree" = "commit") =>
        aSnapshot("p-billing", "f-api", "s-1", { commit, shortCommit: commit.slice(0, 7), target })

    const projectMap = (folderId: string, folderLabel = folderId): FileMeta => ({
        fileName: `${folderLabel}@1a2b3c4`,
        fileChecksum: "c0ffee",
        apiVersion: "1.5",
        projectName: "billing",
        exportedFileSize: 1,
        projectSnapshot: { projectId: "p-billing", folderId, snapshotId: "s-1", folderLabel }
    })

    async function linkedFolders(snapshots: SnapshotSummary[] = [], gitStatus = aGitStatus("main")): Promise<LinkedProjectFolders> {
        const gitRepository = { statusOf: () => gitStatus }
        await setUpProjects(
            { projects: [BILLING], snapshots, activeProjectId: "p-billing", sourceFiles: SOURCE_FILES },
            { providers: [{ provide: GitRepositoryService, useValue: gitRepository }] }
        )
        return TestBed.inject(LinkedProjectFolders)
    }

    async function stateNoteOf(snapshot: SnapshotSummary, gitStatus = aGitStatus("main")): Promise<string | null | undefined> {
        const folder = (await linkedFolders([snapshot], gitStatus)).folderOf(projectMap("f-api", "billing-api"))
        return folder?.status === "available" ? folder.stateNote : undefined
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

    it("should name a missing project folder as unavailable and ask for its re-link", async () => {
        // Arrange
        const folders = await linkedFolders()

        // Act
        const folder = folders.folderOf(projectMap("f-old", "old"))
        if (folder?.status === "unavailable") {
            folder.relink?.()
        }

        // Assert
        expect(folder).toEqual({ status: "unavailable", label: "old", relink: expect.any(Function) })
        expect(TestBed.inject(FolderRelinkRequests).request()).toEqual({ folder: { id: "f-old", label: "old" } })
    })

    it("should name a folder the active project does not have as unavailable", async () => {
        // Arrange
        const folders = await linkedFolders()

        // Act
        const folder = folders.folderOf(projectMap("f-removed", "removed"))

        // Assert
        expect(folder).toEqual({ status: "unavailable", label: "removed", relink: null })
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

    it("should say nothing about the state when the map shows the commit of the checkout", async () => {
        // Act
        const note = await stateNoteOf(analysedAt(HEAD))

        // Assert
        expect(note).toBeNull()
    })

    it("should say nothing about the state when the map shows the working tree of the checkout", async () => {
        // Act
        const note = await stateNoteOf(analysedAt(HEAD, "workingTree"))

        // Assert
        expect(note).toBeNull()
    })

    it("should say that the file is the folder's current one when the map shows another commit", async () => {
        // Act
        const note = await stateNoteOf(analysedAt(OLDER))

        // Assert
        expect(note).toBe("This is the file as it is in the folder now, not at 1a2b3c4.")
    })

    it("should say that the file is the folder's current one when the map is an imported snapshot", async () => {
        // Act
        const note = await stateNoteOf(aSnapshot("p-billing", "f-api", "s-1", { source: "imported", originalFileName: "export.cc.json" }))

        // Assert
        expect(note).toBe("This is the file as it is in the folder now, not as it was analysed.")
    })

    it("should say nothing about the state while the folder's checkout is unknown", async () => {
        // Act
        const note = await stateNoteOf(analysedAt(OLDER), { problem: "notARepository" } as never)

        // Assert
        expect(note).toBeNull()
    })

    it("should be provided as the linked source folders", () => {
        // Act
        const providers = provideLinkedProjectFolders()

        // Assert
        expect(providers).toEqual([{ provide: LINKED_SOURCE_FOLDERS, useExisting: LinkedProjectFolders }])
    })
})
