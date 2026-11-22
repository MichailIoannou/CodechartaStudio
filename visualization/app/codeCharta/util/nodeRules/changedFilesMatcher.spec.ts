import type { CodeMapNode } from "../../model/codeCharta.model"
import { NodeType } from "../../model/codeCharta.model"
import { createChangedFilesMatcher } from "./changedFilesMatcher"

const aFile = (path: string, fileCount?: CodeMapNode["fileCount"]): CodeMapNode => ({
    name: path.split("/").pop() ?? path,
    path,
    type: NodeType.FILE,
    attributes: {},
    ...(fileCount ? { fileCount } : {})
})

describe("createChangedFilesMatcher", () => {
    it("should grey a file git did not change", () => {
        // Arrange
        const isUnchanged = createChangedFilesMatcher({ source: "git", paths: ["/root/changed.ts"] })

        // Act
        const results = [isUnchanged(aFile("/root/changed.ts")), isUnchanged(aFile("/root/same.ts"))]

        // Assert
        expect(results).toEqual([false, true])
    })

    it("should keep a file with metric changes", () => {
        // Arrange
        const isUnchanged = createChangedFilesMatcher({ source: "metrics" })

        // Act
        const results = [
            isUnchanged(aFile("/root/changed.ts", { added: 0, removed: 0, changed: 1 })),
            isUnchanged(aFile("/root/added.ts", { added: 1, removed: 0, changed: 0 })),
            isUnchanged(aFile("/root/same.ts", { added: 0, removed: 0, changed: 0 }))
        ]

        // Assert
        expect(results).toEqual([false, false, true])
    })

    it("should not grey a file without a file count when filtering by metrics", () => {
        // Arrange
        const isUnchanged = createChangedFilesMatcher({ source: "metrics" })

        // Act
        const result = isUnchanged(aFile("/root/unknown.ts"))

        // Assert
        expect(result).toBe(false)
    })

    it("should match nothing without a filter", () => {
        // Arrange
        const isUnchanged = createChangedFilesMatcher(null)

        // Act
        const result = isUnchanged(aFile("/root/any.ts", { added: 0, removed: 0, changed: 0 }))

        // Assert
        expect(result).toBe(false)
    })
})
