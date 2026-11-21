import { TEST_FILE_CONTENT_CC_JSON_2 } from "../../../../../mocks/dataMocks"
import { CcJson2 } from "../../../../../model/ccjson2.model"
import { ExportBlacklistType, ExportCCFile } from "../../../../../model/codeCharta.api.model"
import { NodeType } from "../../../../../model/codeCharta.model"
import { clone } from "../../../../../util/clone"
import { PROJECT_ROOT_NAME, withRootName } from "../../../fileStore.facade"

function legacyFile(rootName: string): ExportCCFile {
    return {
        projectName: "legacy",
        apiVersion: "1.3",
        fileChecksum: "legacy-checksum",
        nodes: [{ name: rootName, type: NodeType.FOLDER, attributes: {}, children: [] }],
        edges: [{ fromNodeName: `/${rootName}/a.ts`, toNodeName: `/${rootName}/b.ts`, attributes: {} }],
        blacklist: [{ path: `/${rootName}/generated`, type: ExportBlacklistType.exclude }],
        markedPackages: [{ path: `/${rootName}`, color: "#ff0000" }]
    }
}

describe("withRootName", () => {
    it("should rename the root of a 2.x file", () => {
        // Arrange
        const content: CcJson2 = clone(TEST_FILE_CONTENT_CC_JSON_2)
        content.files[0].name = "billing"

        // Act
        const result = withRootName(content, PROJECT_ROOT_NAME)

        // Assert
        expect((result.content as CcJson2).files[0].name).toBe("root")
        expect(content.files[0].name).toBe("billing")
    })

    it("should rewrite edge, blacklist and marked-package paths of a 1.x file", () => {
        // Arrange
        const content = legacyFile("billing")

        // Act
        const result = withRootName(content, PROJECT_ROOT_NAME).content as ExportCCFile

        // Assert
        expect(result.nodes[0].name).toBe("root")
        expect(result.edges).toEqual([{ fromNodeName: "/root/a.ts", toNodeName: "/root/b.ts", attributes: {} }])
        expect(result.blacklist).toEqual([{ path: "/root/generated", type: ExportBlacklistType.exclude }])
        expect(result.markedPackages).toEqual([{ path: "/root", color: "#ff0000" }])
        expect(content.nodes[0].name).toBe("billing")
    })

    it("should not rewrite a path that only starts with the same characters as the root", () => {
        // Arrange
        const content = legacyFile("billing")
        content.blacklist = [{ path: "/billingOld/x.ts", type: ExportBlacklistType.exclude }]

        // Act
        const result = withRootName(content, PROJECT_ROOT_NAME).content as ExportCCFile

        // Assert
        expect(result.blacklist).toEqual([{ path: "/billingOld/x.ts", type: ExportBlacklistType.exclude }])
    })

    it("should report the original root name", () => {
        // Arrange
        const content = legacyFile("billing")

        // Act
        const result = withRootName(content, PROJECT_ROOT_NAME)

        // Assert
        expect(result.originalRootName).toBe("billing")
    })

    it("should return the content unchanged when the root already has the name", () => {
        // Arrange
        const content = legacyFile(PROJECT_ROOT_NAME)

        // Act
        const result = withRootName(content, PROJECT_ROOT_NAME)

        // Assert
        expect(result.content).toBe(content)
    })
})
