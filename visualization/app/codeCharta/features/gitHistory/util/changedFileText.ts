import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { StatusCounts } from "../../../model/coreApi/StatusCounts"
import { counted } from "../../../util/wording"

export interface ChangeBadge {
    label: string
    toneClass: string
    title: string | null
}

const CHANGE_BADGES: Record<GitFileChange, ChangeBadge> = {
    added: { label: "added", toneClass: "badge-success", title: null },
    modified: { label: "modified", toneClass: "badge-info", title: null },
    deleted: { label: "deleted", toneClass: "badge-error", title: null },
    renamed: { label: "renamed", toneClass: "badge-accent", title: null },
    copied: { label: "copied", toneClass: "badge-accent", title: null },
    typeChanged: { label: "type", toneClass: "badge-ghost", title: "File type changed, e.g. file to symlink" },
    unknown: { label: "unknown", toneClass: "badge-ghost", title: null }
}

/** The worded change of design H9, never a bare letter. */
export function changeBadgeOf(change: GitFileChange): ChangeBadge {
    return CHANGE_BADGES[change]
}

export function fileNameOf(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1)
}

export function folderOf(path: string): string {
    const separator = path.lastIndexOf("/")
    return separator === -1 ? "" : path.slice(0, separator)
}

/** "3 changed files: 1 staged, 2 unstaged", naming only the kinds present. */
export function workingTreeSummary({ staged, unstaged, untracked, conflicted }: StatusCounts): string {
    const parts = [
        [staged, "staged"],
        [unstaged, "unstaged"],
        [untracked, "untracked"],
        [conflicted, "conflicted"]
    ] as const
    const present = parts.filter(([count]) => count > 0).map(([count, kind]) => `${count} ${kind}`)
    return `${counted(staged + unstaged + untracked + conflicted, "changed file")}: ${present.join(", ")}`
}
