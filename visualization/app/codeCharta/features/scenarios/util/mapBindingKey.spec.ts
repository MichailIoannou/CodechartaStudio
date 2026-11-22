import { CCFile, FileMeta, NodeType } from "../../../model/codeCharta.model"
import { FileSelectionState, FileState } from "../../../model/files/files"
import { mapBindingKeyOf, visibleMapBindingKeys } from "./mapBindingKey"

describe("mapBindingKey", () => {
    const uploadedMap = (fileName: string): FileMeta => ({
        fileName,
        fileChecksum: "abc",
        apiVersion: "1.5",
        projectName: "test",
        exportedFileSize: 100
    })
    const projectMap = (folderLabel: string, commit: string): FileMeta => ({
        ...uploadedMap(`${folderLabel}@${commit}`),
        projectSnapshot: { projectId: "p-1", folderId: `f-${folderLabel}`, snapshotId: `s-${commit}`, folderLabel }
    })
    const fileState = (fileMeta: FileMeta, selectedAs = FileSelectionState.Partial): FileState => ({
        file: { fileMeta, map: { name: "root", type: NodeType.FOLDER, attributes: {} }, settings: {} as CCFile["settings"] },
        selectedAs
    })

    it("should bind a project map by its folder label", () => {
        // Act
        const key = mapBindingKeyOf(projectMap("codecharta", "1a2b3c4"))

        // Assert
        expect(key).toBe("codecharta")
    })

    it("should bind an uploaded map by its file name", () => {
        // Act
        const key = mapBindingKeyOf(uploadedMap("project.cc.json"))

        // Assert
        expect(key).toBe("project.cc.json")
    })

    it("should match a scenario across two commits of one folder", () => {
        // Arrange
        const boundWhileFirstCommitWasShown = visibleMapBindingKeys([fileState(projectMap("codecharta", "1a2b3c4"))])

        // Act
        const keysOfSecondCommit = visibleMapBindingKeys([fileState(projectMap("codecharta", "9f8e7d6"))])

        // Assert
        expect(keysOfSecondCommit).toEqual(boundWhileFirstCommitWasShown)
    })

    it("should name a folder once when two of its commits are visible, and leave hidden maps out", () => {
        // Arrange
        const fileStates = [
            fileState(projectMap("codecharta", "1a2b3c4"), FileSelectionState.Reference),
            fileState(projectMap("codecharta", "9f8e7d6"), FileSelectionState.Comparison),
            fileState(uploadedMap("hidden.cc.json"), FileSelectionState.None)
        ]

        // Act
        const keys = visibleMapBindingKeys(fileStates)

        // Assert
        expect(keys).toEqual(["codecharta"])
    })
})
