import { CcJson2 } from "../../../../../model/ccjson2.model"
import { ExportCCFile } from "../../../../../model/codeCharta.api.model"
import { isCcJson2 } from "./fileValidator"

export const PROJECT_ROOT_NAME = "root"

type CcFileContent = ExportCCFile | CcJson2

interface RenamedRoot {
    content: CcFileContent
    originalRootName: string
}

export function withRootName(content: CcFileContent, rootName: string): RenamedRoot {
    const originalRootName = rootNameOf(content)
    if (originalRootName === rootName) {
        return { content, originalRootName }
    }
    const renamed = isCcJson2(content) ? renameCcJson2Root(content, rootName) : renameLegacyRoot(content, originalRootName, rootName)
    return { content: renamed, originalRootName }
}

function rootNameOf(content: CcFileContent): string {
    return isCcJson2(content) ? content.files[0].name : content.nodes[0].name
}

function renameCcJson2Root(content: CcJson2, rootName: string): CcJson2 {
    const [root, ...otherFiles] = content.files
    return { ...content, files: [{ ...root, name: rootName }, ...otherFiles] }
}

function renameLegacyRoot(content: ExportCCFile, originalRootName: string, rootName: string): ExportCCFile {
    const rewritePath = (path: string) => withRootPrefix(path, originalRootName, rootName)
    const [root, ...otherNodes] = content.nodes
    const renamed: ExportCCFile = { ...content, nodes: [{ ...root, name: rootName }, ...otherNodes] }
    if (content.edges) {
        renamed.edges = content.edges.map(edge => ({
            ...edge,
            fromNodeName: rewritePath(edge.fromNodeName),
            toNodeName: rewritePath(edge.toNodeName)
        }))
    }
    if (content.blacklist) {
        renamed.blacklist = content.blacklist.map(item => ({ ...item, path: rewritePath(item.path) }))
    }
    if (content.markedPackages) {
        renamed.markedPackages = content.markedPackages.map(markedPackage => ({ ...markedPackage, path: rewritePath(markedPackage.path) }))
    }
    return renamed
}

function withRootPrefix(path: string, originalRootName: string, rootName: string): string {
    const originalRoot = `/${originalRootName}`
    if (path === originalRoot || path.startsWith(`${originalRoot}/`)) {
        return `/${rootName}${path.slice(originalRoot.length)}`
    }
    return path
}
