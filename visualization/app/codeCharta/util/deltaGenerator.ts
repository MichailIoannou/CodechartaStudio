import { hierarchy } from "d3-hierarchy"
import packageJson from "../../../package.json"
import { CCFile, CodeMapNode, FileMeta, KeyValuePair, NodeType } from "../model/codeCharta.model"
import { FileRename } from "../model/files/files"
import { FileNameHelper } from "./fileNameHelper"
import { fileRoot } from "./fileRoot"
import { getParent } from "./nodePathHelper"

export class DeltaGenerator {
    static createCodeMapFromHashMap(hashMapWithAllNodes: Map<string, CodeMapNode>) {
        let rootNode: CodeMapNode
        for (const [path, node] of hashMapWithAllNodes) {
            if (path === fileRoot.rootPath) {
                rootNode = node
            } else {
                const parentNode = getParent(hashMapWithAllNodes, path)
                parentNode.children.push(node)
            }
        }
        return rootNode
    }

    static getDeltaFile(referenceFile: CCFile, comparisonFile: CCFile, renames: readonly FileRename[] = []) {
        const deltaNodesByPath = this.getDeltaNodesByPath(referenceFile.map, comparisonFile.map, renames)
        const map = this.createCodeMapFromHashMap(deltaNodesByPath)
        const fileMeta = this.getFileMetaData(referenceFile, comparisonFile)
        return this.getNewCCFileWithDeltas(map, fileMeta)
    }

    private static getDeltaNodesByPath(referenceMap: CodeMapNode, comparisonMap: CodeMapNode, renames: readonly FileRename[]) {
        const deltaNodesByPath = new Map<string, CodeMapNode>()
        const referenceNodesByPath = this.getNodesByPath(referenceMap)

        this.keyRenamedReferenceNodesByComparisonPath(referenceNodesByPath, comparisonMap, renames)

        this.addExistingAndNewNodesToDeltaMap(referenceNodesByPath, comparisonMap, deltaNodesByPath)

        this.addDeletedNodesToDeltaMap(referenceNodesByPath, deltaNodesByPath)

        return deltaNodesByPath
    }

    private static getNodesByPath(map: CodeMapNode) {
        const nodesByPath = new Map<string, CodeMapNode>()
        for (const { data } of hierarchy(map)) {
            nodesByPath.set(data.path, data)
        }
        return nodesByPath
    }

    /** The renamed reference node takes the comparison node's path and name, so the two are compared as one file. */
    private static keyRenamedReferenceNodesByComparisonPath(
        referenceNodesByPath: Map<string, CodeMapNode>,
        comparisonMap: CodeMapNode,
        renames: readonly FileRename[]
    ) {
        if (renames.length === 0) {
            return
        }
        const comparisonNodesByPath = this.getNodesByPath(comparisonMap)
        for (const rename of renames) {
            const pathPair = this.orientTowardsTheComparison(rename, referenceNodesByPath, comparisonNodesByPath)
            if (pathPair) {
                this.moveReferenceNode(referenceNodesByPath, pathPair, comparisonNodesByPath.get(pathPair.to))
            }
        }
    }

    private static moveReferenceNode(
        referenceNodesByPath: Map<string, CodeMapNode>,
        { from, to }: FileRename,
        comparisonNode: CodeMapNode
    ) {
        const referenceNode = referenceNodesByPath.get(from)
        referenceNode.path = comparisonNode.path
        referenceNode.name = comparisonNode.name
        referenceNodesByPath.delete(from)
        referenceNodesByPath.set(to, referenceNode)
    }

    /** Git names the rename from base to head; after a swap the reference holds the head, so the pair applies reversed. */
    private static orientTowardsTheComparison(
        { from, to }: FileRename,
        referenceNodesByPath: Map<string, CodeMapNode>,
        comparisonNodesByPath: Map<string, CodeMapNode>
    ): FileRename | undefined {
        const isRenamedTowardsTheComparison = (referencePath: string, comparisonPath: string) =>
            referenceNodesByPath.has(referencePath) &&
            !referenceNodesByPath.has(comparisonPath) &&
            comparisonNodesByPath.has(comparisonPath) &&
            !comparisonNodesByPath.has(referencePath)

        if (isRenamedTowardsTheComparison(from, to)) {
            return { from, to }
        }
        if (isRenamedTowardsTheComparison(to, from)) {
            return { from: to, to: from }
        }
        return undefined
    }

    private static addExistingAndNewNodesToDeltaMap(
        referenceNodesByPath: Map<string, CodeMapNode>,
        comparisonMap: CodeMapNode,
        deltaNodesByPath: Map<string, CodeMapNode>
    ) {
        for (const { data: comparisonNode } of hierarchy(comparisonMap)) {
            const referenceNode = referenceNodesByPath.get(comparisonNode.path)
            if (referenceNode) {
                this.applyComparisonToReferenceNode(referenceNode, comparisonNode)
            } else {
                if (comparisonNode.children) {
                    comparisonNode.children = []
                }
                comparisonNode.deltas = { ...comparisonNode.attributes }

                comparisonNode.fileCount = {
                    added: comparisonNode.type === NodeType.FILE ? 1 : 0,
                    removed: 0,
                    changed: 0
                }
            }

            const node = referenceNode ?? comparisonNode
            deltaNodesByPath.set(node.path, node)
            referenceNodesByPath.delete(node.path)
        }
    }

    private static applyComparisonToReferenceNode(referenceNode: CodeMapNode, comparisonNode: CodeMapNode) {
        if (referenceNode.children || comparisonNode.children) {
            referenceNode.children = []
        }
        const { deltaList, differenceExists } = this.compareAttributeValues(referenceNode.attributes, comparisonNode.attributes)
        referenceNode.deltas = deltaList
        const changed = differenceExists ? 1 : 0
        referenceNode.attributes = comparisonNode.attributes
        referenceNode.fileCount = { added: 0, removed: 0, changed }
    }

    private static addDeletedNodesToDeltaMap(referenceNodesByPath: Map<string, CodeMapNode>, deltaNodesByPath: Map<string, CodeMapNode>) {
        for (const node of referenceNodesByPath.values()) {
            if (node.children) {
                node.children = []
            }
            node.deltas = {}
            node.fileCount = {
                added: 0,
                removed: node.type === NodeType.FILE ? 1 : 0,
                changed: 0
            }

            for (const [key, value] of Object.entries(node.attributes)) {
                node.deltas[key] = -value
                node.attributes[key] = 0
            }

            deltaNodesByPath.set(node.path, node)
        }
    }

    private static compareAttributeValues(reference: KeyValuePair, comparison: KeyValuePair) {
        const deltaList: KeyValuePair = {}
        let differenceExists = false

        const attributeKeys = new Set(Object.keys(reference))
        for (const key of Object.keys(comparison)) {
            attributeKeys.add(key)
        }

        for (const key of attributeKeys) {
            const referenceAttribute = reference[key] ?? 0
            const compAttribute = comparison[key] ?? 0

            if (referenceAttribute !== compAttribute) {
                differenceExists = true
            }

            const attributeDelta = compAttribute - referenceAttribute
            deltaList[key] = attributeDelta
        }
        return { deltaList, differenceExists }
    }

    private static getFileMetaData(referenceFile: CCFile, comparisonFile: CCFile): FileMeta {
        return {
            fileName: `delta_between_${FileNameHelper.withoutCCExtension(
                referenceFile.fileMeta.fileName
            )}_and_${FileNameHelper.withoutCCExtension(comparisonFile.fileMeta.fileName)}`,
            fileChecksum: `${referenceFile.fileMeta.fileChecksum};${comparisonFile.fileMeta.fileChecksum}`,
            apiVersion: packageJson.codecharta.apiVersion,
            projectName: `delta_between_${referenceFile.fileMeta.projectName}_and_${comparisonFile.fileMeta.projectName}`,
            exportedFileSize: referenceFile.fileMeta.exportedFileSize + comparisonFile.fileMeta.exportedFileSize
        }
    }

    private static getNewCCFileWithDeltas(rootNode: CodeMapNode, fileMeta: FileMeta): CCFile {
        return {
            map: rootNode,
            fileMeta,
            settings: {
                fileSettings: {
                    edges: [],
                    blacklist: [],
                    attributeTypes: { nodes: {}, edges: {} },
                    attributeDescriptors: {},
                    markedPackages: [],
                    domainWords: {},
                    dependencyLevels: {},
                    dependencyDeclarations: {},
                    clusterings: {}
                }
            }
        }
    }
}
