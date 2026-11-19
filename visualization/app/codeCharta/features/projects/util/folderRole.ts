import type { FolderGitFacts } from "../../../model/coreApi/FolderGitFacts"
import type { FolderRole } from "../../../model/coreApi/FolderRole"

interface FolderWithRole {
    role: FolderRole
    git: FolderGitFacts | null
}

export function defaultRoleFor(git: FolderGitFacts | null, folders: FolderWithRole[]): FolderRole {
    if (folders.length === 0) {
        return "primary"
    }
    const primary = folders.find(folder => folder.role === "primary")
    return sharesHistory(git, primary?.git ?? null) ? "fork" : "helper"
}

export function sharesHistory(first: FolderGitFacts | null, second: FolderGitFacts | null): boolean {
    const roots = new Set(first?.rootCommits ?? [])
    return (second?.rootCommits ?? []).some(commit => roots.has(commit))
}
