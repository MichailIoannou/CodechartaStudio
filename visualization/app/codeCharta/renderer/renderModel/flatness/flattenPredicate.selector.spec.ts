import { CodeMapNode, NodeType } from "../../../model/codeCharta.model"
import { flattenPredicateSelector } from "./flattenPredicate.selector"

function file(path: string): CodeMapNode {
    return { name: path.split("/").at(-1), path, type: NodeType.FILE, attributes: {} }
}

function folder(path: string): CodeMapNode {
    return { name: path.split("/").at(-1), path, type: NodeType.FOLDER, attributes: {}, children: [file(`${path}/inner.ts`)] }
}

const NO_FLATTEN_RULES = { isFlattened: () => false }

describe("flattenPredicateSelector", () => {
    it("should flatten unchanged leaves while the filter is on", () => {
        // Arrange
        const filter = { source: "git" as const, paths: ["/root/changed.ts"] }

        // Act
        const isFlat = flattenPredicateSelector.projector(NO_FLATTEN_RULES, [], [], filter)

        // Assert
        expect(isFlat(file("/root/changed.ts"))).toBe(false)
        expect(isFlat(file("/root/same.ts"))).toBe(true)
        expect(isFlat(folder("/root"))).toBe(false)
    })

    it("should flatten nothing without the filter or a rule", () => {
        // Act
        const isFlat = flattenPredicateSelector.projector(NO_FLATTEN_RULES, [], [], null)

        // Assert
        expect(isFlat(file("/root/same.ts"))).toBe(false)
    })

    it("should flatten what a flatten rule names", () => {
        // Arrange
        const rules = { isFlattened: (path: string) => path === "/root/generated" }

        // Act
        const isFlat = flattenPredicateSelector.projector(rules, [], [], null)

        // Assert
        expect(isFlat(folder("/root/generated"))).toBe(true)
    })
})
