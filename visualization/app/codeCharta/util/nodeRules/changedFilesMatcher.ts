import type { ChangedFilesFilter, CodeMapNode } from "../../model/codeCharta.model"

const NOTHING_IS_UNCHANGED = () => false

/** True for a file the filter greys out: one git did not change, or one without a metric change. */
export function createChangedFilesMatcher(filter: ChangedFilesFilter | null): (node: CodeMapNode) => boolean {
    if (filter === null) {
        return NOTHING_IS_UNCHANGED
    }
    if (filter.source === "git") {
        const changedPaths = new Set(filter.paths)
        return node => !changedPaths.has(node.path)
    }
    return node => node.fileCount !== undefined && node.fileCount.added + node.fileCount.removed + node.fileCount.changed === 0
}
