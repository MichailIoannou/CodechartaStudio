import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitRefs } from "../../../model/coreApi/GitRefs"

/** Remote and tag groups list this many refs until "Show all". */
export const GROUP_ROW_CAP = 200
export const ALL_BRANCHES_ROW_ID = "all"

export interface BranchRef {
    refName: string
    /** The full name the filter searches, as git shows it: `feature/x`, `origin/main`, `v1.0`. */
    fullName: string
    kind: "local" | "remote" | "tag"
    local: GitLocalBranch | null
    lastCommit: { subject: string; committedAt: number } | null
}

interface RefNode {
    kind: "ref"
    id: string
    label: string
    ref: BranchRef
}

interface ContainerNode {
    kind: "group" | "folder"
    id: string
    label: string
    /** Shown next to a group's label; folders and the remote group have none. */
    count: number | null
    /** Remote and tag groups are capped. */
    isCapped: boolean
    isExpandedByDefault: boolean
    children: BranchNode[]
}

type BranchNode = RefNode | ContainerNode

export type BranchRow =
    | { kind: "all"; id: string; depth: number }
    | { kind: "group" | "folder"; id: string; label: string; count: number | null; depth: number; isExpanded: boolean; isRemote: boolean }
    | { kind: "ref"; id: string; label: string; depth: number; ref: BranchRef }
    | { kind: "showAll"; id: string; groupId: string; total: number; depth: number }

export interface BranchRowOptions {
    filter: string
    /** Ids whose expansion differs from their default. */
    toggledIds: ReadonlySet<string>
    uncappedIds: ReadonlySet<string>
}

export function buildBranchTree(refs: GitRefs): BranchNode[] {
    const groups: ContainerNode[] = [localGroup(refs)]
    if (refs.remoteBranches.length > 0) {
        groups.push(remoteGroup(refs))
    }
    if (refs.tags.length > 0) {
        groups.push(tagGroup(refs))
    }
    return groups
}

export function branchRows(tree: BranchNode[], options: BranchRowOptions): BranchRow[] {
    const filter = options.filter.trim().toLowerCase()
    const visible = filter === "" ? tree : filterNodes(tree, filter)
    const rows: BranchRow[] = [{ kind: "all", id: ALL_BRANCHES_ROW_ID, depth: 0 }]
    for (const node of visible) {
        appendRows(rows, node, 0, { ...options, isFiltering: filter !== "" })
    }
    return rows
}

export function hasAnyRef(tree: BranchNode[]): boolean {
    return tree.some(node => node.kind === "ref" || node.children.length > 0)
}

function localGroup(refs: GitRefs): ContainerNode {
    const branches = refs.localBranches.map(branch => ({
        refName: branch.refName,
        fullName: branch.name,
        kind: "local" as const,
        local: branch,
        lastCommit: branch.lastCommit
    }))
    const currentFolders = new Set(foldersOf(refs.localBranches.find(branch => branch.isCurrent)?.name ?? "", "local"))
    return group(
        "local",
        "Local",
        branches.length,
        false,
        nest("local", branches, branch => branch.fullName, currentFolders)
    )
}

function remoteGroup(refs: GitRefs): ContainerNode {
    const remoteNames = [...new Set(refs.remoteBranches.map(branch => branch.remote))]
    const remotes = remoteNames.map(remote => {
        const branches = refs.remoteBranches
            .filter(branch => branch.remote === remote)
            .map(branch => ({
                refName: branch.refName,
                fullName: branch.name,
                kind: "remote" as const,
                local: null,
                lastCommit: branch.lastCommit
            }))
        const id = `remote:${remote}`
        const branchNameOf = (branch: BranchRef) => branch.fullName.slice(remote.length + 1)
        return group(id, remote, branches.length, true, nest(id, branches, branchNameOf, new Set()))
    })
    return group("remote", "Remote", null, false, remotes)
}

function tagGroup(refs: GitRefs): ContainerNode {
    const tags = refs.tags.map(tag => ({ refName: tag.refName, fullName: tag.name, kind: "tag" as const, local: null, lastCommit: null }))
    return {
        ...group(
            "tags",
            "Tags",
            tags.length,
            true,
            nest("tags", tags, tag => tag.fullName, new Set())
        ),
        isExpandedByDefault: false
    }
}

function group(id: string, label: string, count: number | null, isCapped: boolean, children: BranchNode[]): ContainerNode {
    return { kind: "group", id, label, count, isCapped, isExpandedByDefault: true, children }
}

/** A "/" opens a folder only where two or more refs share it, so a lone `feature/x` stays one row. */
function nest(parentId: string, refs: BranchRef[], nameOf: (ref: BranchRef) => string, openFolders: ReadonlySet<string>): BranchNode[] {
    const membersBySegment = new Map<string, BranchRef[]>()
    for (const ref of refs) {
        const name = nameOf(ref)
        if (name.includes("/")) {
            const members = membersBySegment.get(firstSegmentOf(name)) ?? []
            members.push(ref)
            membersBySegment.set(firstSegmentOf(name), members)
        }
    }
    const nodes: BranchNode[] = []
    const placedSegments = new Set<string>()
    for (const ref of refs) {
        const name = nameOf(ref)
        const segment = firstSegmentOf(name)
        const members = name.includes("/") ? (membersBySegment.get(segment) ?? []) : []
        if (members.length < 2) {
            nodes.push({ kind: "ref", id: ref.refName, label: name, ref })
        } else if (!placedSegments.has(segment)) {
            placedSegments.add(segment)
            nodes.push(folder(parentId, segment, members, nameOf, openFolders))
        }
    }
    return nodes
}

function firstSegmentOf(name: string): string {
    return name.split("/")[0]
}

function folder(
    parentId: string,
    segment: string,
    members: BranchRef[],
    nameOf: (ref: BranchRef) => string,
    openFolders: ReadonlySet<string>
): ContainerNode {
    const id = `${parentId}/${segment}/`
    const restOf = (ref: BranchRef) => nameOf(ref).slice(segment.length + 1)
    return {
        kind: "folder",
        id,
        label: `${segment}/`,
        count: null,
        isCapped: false,
        isExpandedByDefault: openFolders.has(id),
        children: nest(id, members, restOf, openFolders)
    }
}

function foldersOf(name: string, groupId: string): string[] {
    const segments = name.split("/").slice(0, -1)
    return segments.map((_, index) => `${groupId}/${segments.slice(0, index + 1).join("/")}/`)
}

function filterNodes(nodes: BranchNode[], filter: string): BranchNode[] {
    return nodes.flatMap((node): BranchNode[] => {
        if (node.kind === "ref") {
            return node.ref.fullName.toLowerCase().includes(filter) ? [node] : []
        }
        const children = filterNodes(node.children, filter)
        return children.length > 0 ? [{ ...node, children }] : []
    })
}

interface AppendOptions extends BranchRowOptions {
    isFiltering: boolean
}

function appendRows(rows: BranchRow[], node: BranchNode, depth: number, options: AppendOptions): void {
    if (node.kind === "ref") {
        rows.push({ kind: "ref", id: node.id, label: node.label, depth, ref: node.ref })
        return
    }
    const isExpanded = options.isFiltering || node.isExpandedByDefault !== options.toggledIds.has(node.id)
    const isRemote = node.id.startsWith("remote:")
    rows.push({ kind: node.kind, id: node.id, label: node.label, count: node.count, depth, isExpanded, isRemote })
    if (isExpanded) {
        appendChildren(rows, node, depth + 1, options)
    }
}

function appendChildren(rows: BranchRow[], node: ContainerNode, depth: number, options: AppendOptions): void {
    const total = countRefs(node)
    const limit = node.isCapped && !options.uncappedIds.has(node.id) ? GROUP_ROW_CAP : Number.POSITIVE_INFINITY
    const firstChildRow = rows.length
    for (const child of node.children) {
        appendRows(rows, child, depth, options)
    }
    const childRows = rows.splice(firstChildRow)
    let shownRefs = 0
    for (const row of childRows) {
        shownRefs += row.kind === "ref" ? 1 : 0
        if (shownRefs > limit) {
            rows.push({ kind: "showAll", id: `${node.id}#showAll`, groupId: node.id, total, depth })
            return
        }
        rows.push(row)
    }
}

function countRefs(node: BranchNode): number {
    return node.kind === "ref" ? 1 : node.children.reduce((total, child) => total + countRefs(child), 0)
}
