import type { GitCommitDistance } from "../../../model/coreApi/GitCommitDistance"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { StatusCounts } from "../../../model/coreApi/StatusCounts"
import { counted, shortSha } from "../../../util/wording"

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

/** Design H9's two-commit sentence: "a1b2c3d is 3 commits ahead of and 1 behind 9f8e7d6". */
export function distanceSentence(newerSha: string, olderSha: string, distance: GitCommitDistance): string {
    const ahead = counted(distance.onlyInTarget, "commit")
    return `${shortSha(newerSha)} is ${ahead} ahead of and ${distance.onlyInCandidate} behind ${shortSha(olderSha)}`
}
