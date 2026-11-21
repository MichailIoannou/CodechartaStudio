import { hierarchy } from "d3-hierarchy"
import {
    TEST_DELTA_MAP_A,
    TEST_DELTA_MAP_B,
    TEST_DELTA_MAP_C,
    TEST_DELTA_MAP_D,
    TEST_DELTA_MAP_E,
    TEST_DELTA_MAP_F
} from "../mocks/dataMocks"
import { CCFile, CodeMapNode, FileCount, NodeType } from "../model/codeCharta.model"
import { clone } from "./clone"
import { DeltaGenerator } from "./deltaGenerator"
import { NodeDecorator } from "./nodeDecorator"

describe("deltaGenerator", () => {
    let fileA: CCFile
    let fileB: CCFile

    beforeEach(() => {
        fileA = clone(TEST_DELTA_MAP_A)
        fileB = clone(TEST_DELTA_MAP_B)
    })

    it("golden test", () => {
        NodeDecorator.decorateMapWithPathAttribute(fileA)
        NodeDecorator.decorateMapWithPathAttribute(fileB)

        fileA.map.children.push({
            name: "onlyA",
            type: NodeType.FOLDER,
            attributes: {},
            path: "/root/onlyA",
            isExcluded: false,
            children: [
                {
                    name: "special",
                    type: NodeType.FOLDER,
                    attributes: {},
                    path: "/root/onlyA/special",
                    isExcluded: false,
                    children: [
                        {
                            name: "unicorn",
                            type: NodeType.FILE,
                            attributes: { special: 42 },
                            path: "/root/onlyA/special/unicorn",
                            isExcluded: false
                        },
                        {
                            name: "2ndUnicorn",
                            type: NodeType.FILE,
                            attributes: { special: 10 },
                            path: "/root/onlyA/special/2ndunicorn",
                            isExcluded: false
                        },
                        {
                            name: "Cthulhu",
                            type: NodeType.FILE,
                            attributes: { monster: 1 },
                            path: "/root/onlyA/special/Cthulhu",
                            isExcluded: false
                        }
                    ]
                }
            ]
        })

        fileB.map.children.push({
            name: "onlyA",
            type: NodeType.FOLDER,
            attributes: {},
            path: "/root/onlyA",
            isExcluded: false,
            children: [
                {
                    name: "special",
                    type: NodeType.FOLDER,
                    attributes: {},
                    path: "/root/onlyA/special",
                    isExcluded: false,
                    children: [
                        {
                            name: "Narwal",
                            type: NodeType.FILE,
                            attributes: { monster: 42 },
                            path: "/root/onlyA/special/Narwal",
                            isExcluded: false
                        },
                        {
                            name: "Cthulhu",
                            type: NodeType.FILE,
                            attributes: { monster: 666 },
                            path: "/root/onlyA/special/Cthulhu",
                            isExcluded: false
                        }
                    ]
                }
            ]
        })

        const result = DeltaGenerator.getDeltaFile(fileA, fileB)

        expect(result.map).toMatchSnapshot()
    })

    it("getDeltaFile should result in expected deltaFiles", () => {
        NodeDecorator.decorateMapWithPathAttribute(fileA)
        NodeDecorator.decorateMapWithPathAttribute(fileB)

        const result = DeltaGenerator.getDeltaFile(fileA, fileB)

        expect(result.map).toMatchSnapshot()
    })

    it("should detect added and removed files and add result to delta attributes", () => {
        // Here, "changed" means "added" or "removed"
        const actualAmountOfChangedFiles: Pick<FileCount, "added" | "removed"> = { added: 0, removed: 0 }
        const referenceMap = { ...TEST_DELTA_MAP_C }
        const comparisonMap = { ...TEST_DELTA_MAP_D }
        NodeDecorator.decorateMapWithPathAttribute(referenceMap)
        NodeDecorator.decorateMapWithPathAttribute(comparisonMap)

        const actualDeltaMap = DeltaGenerator.getDeltaFile(referenceMap, comparisonMap)

        for (const { data } of hierarchy(actualDeltaMap.map)) {
            actualAmountOfChangedFiles.added += data.fileCount.added
            actualAmountOfChangedFiles.removed += data.fileCount.removed
        }

        expect(actualAmountOfChangedFiles).toEqual({ added: 3, removed: 5 })
    })

    it("should detect files with metric changes and add result to delta attributes", () => {
        const actualAmountOfChangedFiles: Pick<FileCount, "changed"> = { changed: 0 }
        const referenceMap = { ...TEST_DELTA_MAP_E }
        const comparisonMap = { ...TEST_DELTA_MAP_F }
        NodeDecorator.decorateMapWithPathAttribute(referenceMap)
        NodeDecorator.decorateMapWithPathAttribute(comparisonMap)

        const actualDeltaMap = DeltaGenerator.getDeltaFile(referenceMap, comparisonMap)

        for (const { data } of hierarchy(actualDeltaMap.map)) {
            actualAmountOfChangedFiles.changed += data.fileCount.changed
        }

        expect(actualAmountOfChangedFiles).toEqual({ changed: 5 })
    })

    it("should sum exported file size of the comparison and reference File", () => {
        NodeDecorator.decorateMapWithPathAttribute(fileA)
        NodeDecorator.decorateMapWithPathAttribute(fileB)

        const result = DeltaGenerator.getDeltaFile(fileA, fileB)

        expect(result.fileMeta.exportedFileSize).toBe(fileA.fileMeta.exportedFileSize + fileB.fileMeta.exportedFileSize)
    })

    it("checking delta calculation between two attribute lists", () => {
        const a = { a: 100, b: 10, c: 1 }
        const b = { a: 110, b: 11, c: 0 }
        const c = { a: 110, b: 11, c: 0, d: 10 }
        const d = { a: 110, b: 11 }
        const e = { d: 110, e: 11 }

        const ab = DeltaGenerator["compareAttributeValues"](a, b).deltaList
        expect(ab.a).toBe(b.a - a.a)
        expect(ab.b).toBe(b.b - a.b)
        expect(ab.c).toBe(b.c - a.c)

        const ac = DeltaGenerator["compareAttributeValues"](a, c).deltaList
        expect(ac.a).toBe(c.a - a.a)
        expect(ac.b).toBe(c.b - a.b)
        expect(ac.c).toBe(c.c - a.c)
        expect(ac.d).toBe(c.d)

        const ad = DeltaGenerator["compareAttributeValues"](a, d).deltaList
        expect(ad.a).toBe(d.a - a.a)
        expect(ad.b).toBe(d.b - a.b)
        expect(ad.c).toBe(-a.c)

        const ae = DeltaGenerator["compareAttributeValues"](a, e).deltaList
        expect(ae.a).toBe(-a.a)
        expect(ae.b).toBe(-a.b)
        expect(ae.c).toBe(-a.c)
        expect(ae.d).toBe(e.d)
        expect(ae.e).toBe(e.e)
    })
})

describe("deltaGenerator with renames", () => {
    function fileOf(files: Record<string, Record<string, number>>): CCFile {
        const ccFile = clone(TEST_DELTA_MAP_A)
        ccFile.map = {
            name: "root",
            path: "/root",
            type: NodeType.FOLDER,
            attributes: {},
            children: Object.entries(files).map(([name, attributes]) => ({ name, path: `/root/${name}`, type: NodeType.FILE, attributes }))
        }
        return ccFile
    }

    function nodesOf(ccFile: CCFile): Map<string, CodeMapNode> {
        return new Map(
            hierarchy(ccFile.map)
                .descendants()
                .map(({ data }) => [data.path, data])
        )
    }

    it("should match a renamed file to its old path", () => {
        // Arrange
        const reference = fileOf({ "old.ts": { rloc: 10 } })
        const comparison = fileOf({ "new.ts": { rloc: 15 } })

        // Act
        const result = DeltaGenerator.getDeltaFile(reference, comparison, [{ from: "/root/old.ts", to: "/root/new.ts" }])

        // Assert
        const nodes = nodesOf(result)
        expect(nodes.has("/root/old.ts")).toBe(false)
        expect(nodes.get("/root/new.ts")).toEqual(
            expect.objectContaining({
                name: "new.ts",
                attributes: { rloc: 15 },
                deltas: { rloc: 5 },
                fileCount: { added: 0, removed: 0, changed: 1 }
            })
        )
    })

    it("should match a renamed file when the comparison holds the older map", () => {
        // Arrange
        const reference = fileOf({ "new.ts": { rloc: 15 } })
        const comparison = fileOf({ "old.ts": { rloc: 10 } })

        // Act
        const result = DeltaGenerator.getDeltaFile(reference, comparison, [{ from: "/root/old.ts", to: "/root/new.ts" }])

        // Assert
        const nodes = nodesOf(result)
        expect(nodes.has("/root/new.ts")).toBe(false)
        expect(nodes.get("/root/old.ts")).toEqual(
            expect.objectContaining({ deltas: { rloc: -5 }, fileCount: { added: 0, removed: 0, changed: 1 } })
        )
    })

    it("should keep an unrelated removed file removed", () => {
        // Arrange
        const reference = fileOf({ "old.ts": { rloc: 10 }, "gone.ts": { rloc: 3 } })
        const comparison = fileOf({ "new.ts": { rloc: 10 } })

        // Act
        const result = DeltaGenerator.getDeltaFile(reference, comparison, [{ from: "/root/old.ts", to: "/root/new.ts" }])

        // Assert
        const nodes = nodesOf(result)
        expect(nodes.get("/root/gone.ts").fileCount).toEqual({ added: 0, removed: 1, changed: 0 })
        expect(nodes.get("/root/new.ts").fileCount).toEqual({ added: 0, removed: 0, changed: 0 })
    })

    it("should ignore a rename whose old path is not in the reference map", () => {
        // Arrange
        const reference = fileOf({ "other.ts": { rloc: 10 } })
        const comparison = fileOf({ "other.ts": { rloc: 10 }, "new.ts": { rloc: 4 } })

        // Act
        const result = DeltaGenerator.getDeltaFile(reference, comparison, [{ from: "/root/old.ts", to: "/root/new.ts" }])

        // Assert
        expect(nodesOf(result).get("/root/new.ts").fileCount).toEqual({ added: 1, removed: 0, changed: 0 })
    })

    it("should ignore a rename whose new path is already in the reference map", () => {
        // Arrange
        const reference = fileOf({ "old.ts": { rloc: 10 }, "new.ts": { rloc: 2 } })
        const comparison = fileOf({ "new.ts": { rloc: 10 } })

        // Act
        const result = DeltaGenerator.getDeltaFile(reference, comparison, [{ from: "/root/old.ts", to: "/root/new.ts" }])

        // Assert
        const nodes = nodesOf(result)
        expect(nodes.get("/root/old.ts").fileCount).toEqual({ added: 0, removed: 1, changed: 0 })
        expect(nodes.get("/root/new.ts").deltas).toEqual({ rloc: 8 })
    })
})
