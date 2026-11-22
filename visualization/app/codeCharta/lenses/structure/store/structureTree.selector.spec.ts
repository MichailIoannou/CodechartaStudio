import { hierarchy } from "d3-hierarchy"
import packageJson from "../../../../../package.json"
import { CCFile, CcState, NodeType } from "../../../model/codeCharta.model"
import { FileSelectionState, FileState } from "../../../model/files/files"
import { _getUndecoratedAccumulatedData, structureTreeSelector } from "./structureTree.selector"

describe("structureTreeSelector", () => {
    describe("_getUndecoratedAccumulatedData", () => {
        const fileState1 = {
            file: {
                fileMeta: {
                    fileName: "file1",
                    fileChecksum: "md5-file1",
                    projectName: "Sample Project",
                    apiVersion: packageJson.codecharta.apiVersion,
                    exportedFileSize: 300_000
                },
                map: {
                    name: "root1",
                    type: NodeType.FOLDER,
                    path: "/root1",
                    attributes: { rloc: 170, functions: 1010, mcc: 11 },
                    children: []
                }
            }
        } as unknown as FileState
        const fileState2 = {
            file: {
                fileMeta: {
                    fileName: "file2",
                    fileChecksum: "md5-file2",
                    projectName: "Sample Project2",
                    apiVersion: packageJson.codecharta.apiVersion,
                    exportedFileSize: 300_000
                },
                map: {
                    name: "root2",
                    type: NodeType.FOLDER,
                    path: "/root2",
                    attributes: { rloc: 170, functions: 1010, mcc: 11 },
                    children: []
                }
            }
        } as unknown as FileState

        beforeEach(() => {
            fileState1.selectedAs = FileSelectionState.None
            fileState2.selectedAs = FileSelectionState.None
        })

        it("should wrap multiple selected files in a root path", () => {
            fileState1.selectedAs = FileSelectionState.Partial
            fileState2.selectedAs = FileSelectionState.Partial
            const accumulatedData = _getUndecoratedAccumulatedData([fileState1, fileState2])
            expect(accumulatedData.map.path).toBe("/root")
        })

        it("should not wrap a single selected file in a root path", () => {
            fileState1.selectedAs = FileSelectionState.Partial
            const accumulatedData = _getUndecoratedAccumulatedData([fileState1])
            expect(accumulatedData.map.path).toBe("/root1")
        })

        it("should wrap a root path for delta mode", () => {
            fileState1.selectedAs = FileSelectionState.Reference
            fileState2.selectedAs = FileSelectionState.Comparison
            const accumulatedData = _getUndecoratedAccumulatedData([fileState1, fileState2])
            expect(accumulatedData.map.path).toBe("/root")
        })

        it("should not wrap a root path, when there is no comparison file in delta mode", () => {
            fileState1.selectedAs = FileSelectionState.Reference
            const accumulatedData = _getUndecoratedAccumulatedData([fileState1])
            expect(accumulatedData.map.path).toBe("/root1")
        })

        // These two pin what makes it safe to hand out a memoized result that was never copied up front.
        it("should not mutate the given file states in delta mode", () => {
            // Arrange — matching map names, so a delta is built instead of an aggregation
            const reference = fileStateNamed("reference", FileSelectionState.Reference)
            const comparison = fileStateNamed("comparison", FileSelectionState.Comparison)

            // Act
            _getUndecoratedAccumulatedData([reference, comparison])

            // Assert — the delta is written into the very nodes it walks, and those would be the store's
            expect(reference.file.map).not.toHaveProperty("deltas")
            expect(reference.file.map.attributes).toEqual({ rloc: 170 })
            expect(reference.file.map.children[0].path).toBe("/root/child")
        })

        it("should not mutate the given file states when aggregating them", () => {
            // Arrange — two files are wrapped in a shared root, which rewrites every node's path
            const first = fileStateNamed("first", FileSelectionState.Partial, "root1")
            const second = fileStateNamed("second", FileSelectionState.Partial, "root2")

            // Act
            _getUndecoratedAccumulatedData([first, second])

            // Assert — the aggregation copies what it is handed, which is why this selector need not
            expect(first.file.map.path).toBe("/root1")
            expect(first.file.map.children[0].path).toBe("/root1/child")
        })

        it("should compare a renamed file with its old path", () => {
            // Arrange
            const reference = fileStateNamed("reference", FileSelectionState.Reference, "root", "old.ts")
            const comparison = fileStateNamed("comparison", FileSelectionState.Comparison, "root", "new.ts")

            // Act
            const accumulatedData = _getUndecoratedAccumulatedData([reference, comparison], [{ from: "/root/old.ts", to: "/root/new.ts" }])

            // Assert
            expect(pathsOf(accumulatedData)).toEqual(["/root", "/root/new.ts"])
        })

        function fileStateNamed(fileName: string, selectedAs: FileSelectionState, mapName = "root", childName = "child"): FileState {
            return {
                selectedAs,
                file: {
                    fileMeta: {
                        fileName,
                        fileChecksum: `md5-${fileName}`,
                        projectName: "Sample Project",
                        apiVersion: packageJson.codecharta.apiVersion,
                        exportedFileSize: 300_000
                    },
                    map: {
                        name: mapName,
                        type: NodeType.FOLDER,
                        path: `/${mapName}`,
                        attributes: { rloc: 170 },
                        children: [
                            {
                                name: childName,
                                type: NodeType.FILE,
                                path: `/${mapName}/${childName}`,
                                attributes: { rloc: 170 }
                            }
                        ]
                    }
                }
            } as unknown as FileState
        }
    })

    it("should recompute the delta when the renames arrive", () => {
        // Arrange
        const renames = [{ from: "/root/old.ts", to: "/root/new.ts" }]
        const files = [
            deltaSide("reference", FileSelectionState.Reference, "old.ts"),
            deltaSide("comparison", FileSelectionState.Comparison, "new.ts")
        ]
        const before = { files, fileRenames: [] } as unknown as CcState
        const after = { files, fileRenames: renames } as unknown as CcState

        // Act
        const deltaBefore = structureTreeSelector(before)
        const deltaAfter = structureTreeSelector(after)

        // Assert
        expect(pathsOf(deltaBefore)).toEqual(["/root", "/root/new.ts", "/root/old.ts"])
        expect(pathsOf(deltaAfter)).toEqual(["/root", "/root/new.ts"])
    })

    function deltaSide(fileName: string, selectedAs: FileSelectionState, childName: string): FileState {
        return {
            selectedAs,
            file: {
                fileMeta: { fileName, fileChecksum: `md5-${fileName}`, projectName: "Sample Project", exportedFileSize: 1 },
                settings: { fileSettings: {} },
                map: {
                    name: "root",
                    type: NodeType.FOLDER,
                    path: "/root",
                    attributes: {},
                    children: [{ name: childName, type: NodeType.FILE, path: `/root/${childName}`, attributes: { rloc: 10 } }]
                }
            }
        } as unknown as FileState
    }

    function pathsOf(ccFile: CCFile): string[] {
        return hierarchy(ccFile.map)
            .descendants()
            .map(({ data }) => data.path)
            .sort()
    }
})
