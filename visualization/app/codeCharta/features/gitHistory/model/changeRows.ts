import type { DiscardEntry } from "../../../model/coreApi/DiscardEntry"
import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitWorkingTreeEntry } from "../../../model/coreApi/GitWorkingTreeEntry"

export interface ChangeRow {
    /** A file changed in the index and in the working tree is listed twice, so the kind is part of the key. */
    key: string
    entry: GitWorkingTreeEntry
}

export interface ChangeGroup {
    kind: GitEntryKind
    label: string
    rows: readonly ChangeRow[]
}

/** Design H11's groups, in its order. */
const GROUPS: readonly { kind: GitEntryKind; label: string }[] = [
    { kind: "conflicted", label: "Conflicted" },
    { kind: "staged", label: "Staged" },
    { kind: "unstaged", label: "Changes" },
    { kind: "untracked", label: "Untracked" }
]

const STAGEABLE_KINDS: ReadonlySet<GitEntryKind> = new Set(["unstaged", "untracked", "conflicted"])
/** A staged row would need the file's unstaged row too, and a conflicted one is undone by aborting the merge. */
const DISCARDABLE_KINDS: ReadonlySet<GitEntryKind> = new Set(["unstaged", "untracked"])

function rowKeyOf({ kind, path }: Pick<GitWorkingTreeEntry, "kind" | "path">): string {
    return `${kind}:${path}`
}

/** The non-empty groups, each sorted by path. */
export function changeGroupsOf(entries: readonly GitWorkingTreeEntry[]): ChangeGroup[] {
    return GROUPS.map(({ kind, label }) => {
        const rows = entries
            .filter(entry => entry.kind === kind)
            .sort((first, second) => first.path.localeCompare(second.path))
            .map(entry => ({ key: rowKeyOf(entry), entry }))
        return { kind, label, rows }
    }).filter(group => group.rows.length > 0)
}

export function isStageable(row: ChangeRow): boolean {
    return STAGEABLE_KINDS.has(row.entry.kind)
}

export function isDiscardable(row: ChangeRow): boolean {
    return DISCARDABLE_KINDS.has(row.entry.kind)
}

/** The row exactly as listed: the core refuses the discard when the listing no longer matches it. */
export function discardEntryOf({ entry }: ChangeRow): DiscardEntry {
    return { path: entry.path, kind: entry.kind, change: entry.change }
}
