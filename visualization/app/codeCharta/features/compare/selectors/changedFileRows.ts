import type { CodeMapNode } from "../../../model/codeCharta.model"
import type { ChangedFile } from "../../../model/coreApi/ChangedFile"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import { displayNameOf } from "../../gitHistory/facade"

export interface ChangedFileRow {
    /** The node path, `/root/src/a.ts`. */
    path: string
    change: GitFileChange
    /** The file name, or "old.ts → new.ts" for a rename or copy. */
    name: string
    /** The folder relative to the project folder, `src/billing`; empty at the top. */
    folder: string
    /** The node path of the folder, for "Focus folder". */
    folderPath: string
    /** The height metric's delta of the node, when it has one. */
    heightDelta: number | null
    hasNode: boolean
}

interface RowContext {
    rootPath: string
    pathToNode: ReadonlyMap<string, CodeMapNode>
    heightMetric: string
}

/** One row per file git lists, in git's order; a path the map does not hold keeps its row without a node. */
export function gitChangedFileRows(files: readonly ChangedFile[], context: RowContext): ChangedFileRow[] {
    return files.map(file => {
        const path = `${context.rootPath}/${file.path}`
        const node = context.pathToNode.get(path)
        return rowOf({ path, change: file.change, name: displayNameOf(file.path, file.previousPath), node }, context)
    })
}

/** The fallback without git: every leaf of the delta tree that was added, removed or changed. */
export function metricChangedFileRows(root: CodeMapNode | undefined, context: Omit<RowContext, "pathToNode">): ChangedFileRow[] {
    const rows: ChangedFileRow[] = []
    const visit = (node: CodeMapNode) => {
        const change = metricChangeOf(node)
        if (change) {
            rows.push(rowOf({ path: node.path, change, name: node.name, node }, context))
        }
        for (const child of node.children ?? []) {
            visit(child)
        }
    }
    if (root) {
        visit(root)
    }
    return rows
}

interface ListedFile {
    path: string
    change: GitFileChange
    name: string
    node: CodeMapNode | undefined
}

function rowOf({ path, change, name, node }: ListedFile, context: Omit<RowContext, "pathToNode">): ChangedFileRow {
    const folderPath = path.slice(0, path.lastIndexOf("/"))
    const folder = folderPath.length > context.rootPath.length ? folderPath.slice(context.rootPath.length + 1) : ""
    return {
        path,
        change,
        name,
        folder,
        folderPath,
        heightDelta: node?.deltas?.[context.heightMetric] ?? null,
        hasNode: node !== undefined
    }
}

function metricChangeOf(node: CodeMapNode): GitFileChange | null {
    if ((node.children?.length ?? 0) > 0 || !node.fileCount) {
        return null
    }
    if (node.fileCount.added > 0) {
        return "added"
    }
    if (node.fileCount.removed > 0) {
        return "deleted"
    }
    return node.fileCount.changed > 0 ? "modified" : null
}
