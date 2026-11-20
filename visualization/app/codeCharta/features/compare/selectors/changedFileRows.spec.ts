import { CodeMapNode, NodeType } from "../../../model/codeCharta.model"
import { gitChangedFileRows, metricChangedFileRows } from "./changedFileRows"

const leaf = (path: string, extra: Partial<CodeMapNode> = {}): CodeMapNode => ({
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    type: NodeType.FILE,
    attributes: {},
    ...extra
})
const INVOICE = leaf("/root/src/billing/invoice.ts", { deltas: { rloc: 12 }, fileCount: { added: 0, removed: 0, changed: 1 } })
const CURRENCY = leaf("/root/src/billing/currency.ts", { deltas: { rloc: 80 }, fileCount: { added: 1, removed: 0, changed: 0 } })
const LEGACY = leaf("/root/legacy.ts", { fileCount: { added: 0, removed: 1, changed: 0 } })
const SAME = leaf("/root/same.ts", { fileCount: { added: 0, removed: 0, changed: 0 } })
const ROOT: CodeMapNode = {
    name: "root",
    path: "/root",
    type: NodeType.FOLDER,
    attributes: {},
    children: [
        {
            name: "src",
            path: "/root/src",
            type: NodeType.FOLDER,
            attributes: {},
            children: [{ ...leaf("/root/src/billing"), type: NodeType.FOLDER, children: [INVOICE, CURRENCY] }]
        },
        LEGACY,
        SAME
    ]
}
const pathToNode = new Map([INVOICE, CURRENCY, LEGACY].map(node => [node.path, node]))
const CONTEXT = { rootPath: "/root", pathToNode, heightMetric: "rloc" }

describe("changedFileRows", () => {
    it("should map a git path to its node path", () => {
        // Act
        const [row] = gitChangedFileRows([{ change: "modified", path: "src/billing/invoice.ts", previousPath: null }], CONTEXT)

        // Assert
        expect(row).toEqual({
            path: "/root/src/billing/invoice.ts",
            change: "modified",
            name: "invoice.ts",
            folder: "src/billing",
            folderPath: "/root/src/billing",
            heightDelta: 12,
            hasNode: true
        })
    })

    it("should name a rename by both file names", () => {
        // Act
        const [row] = gitChangedFileRows([{ change: "renamed", path: "src/billing/currency.ts", previousPath: "src/old.ts" }], CONTEXT)

        // Assert
        expect(row.name).toBe("old.ts → currency.ts")
        expect(row.heightDelta).toBe(80)
    })

    it("should mark a path without a node", () => {
        // Act
        const [row] = gitChangedFileRows([{ change: "deleted", path: "README.md", previousPath: null }], CONTEXT)

        // Assert
        expect(row.hasNode).toBe(false)
        expect(row.heightDelta).toBeNull()
        expect(row.folder).toBe("")
        expect(row.folderPath).toBe("/root")
    })

    it("should fall back to metric changes when the core reports Unavailable", () => {
        // Act
        const rows = metricChangedFileRows(ROOT, { rootPath: "/root", heightMetric: "rloc" })

        // Assert
        expect(rows.map(row => [row.path, row.change])).toEqual([
            ["/root/src/billing/invoice.ts", "modified"],
            ["/root/src/billing/currency.ts", "added"],
            ["/root/legacy.ts", "deleted"]
        ])
    })

    it("should list nothing without a delta tree", () => {
        // Act
        const rows = metricChangedFileRows(undefined, { rootPath: "/root", heightMetric: "rloc" })

        // Assert
        expect(rows).toEqual([])
    })
})
