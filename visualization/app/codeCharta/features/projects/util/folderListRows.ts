import type { FolderGitFacts } from "../../../model/coreApi/FolderGitFacts"
import type { FolderKind } from "../../../model/coreApi/FolderKind"
import type { FolderRelationship } from "../../../model/coreApi/FolderRelationship"
import type { FolderRole } from "../../../model/coreApi/FolderRole"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import { remoteDisplay } from "./folderWording"

export interface FolderListRow {
    key: string
    label: string
    role: FolderRole
    kind: FolderKind
    path: string
    remote: string | null
    hint: string | null
    isMissing: boolean
    snapshotCount: number
}

export const FOLDER_ROLES: readonly { role: FolderRole; label: string }[] = [
    { role: "primary", label: "Primary" },
    { role: "fork", label: "Fork" },
    { role: "helper", label: "Helper" }
]

const LABEL_SEPARATOR = "/"

const RELATIONSHIP_WORDS: Record<FolderRelationship["kind"], string> = {
    forkOf: "fork of",
    sharesHistoryWith: "shares history with",
    sameRemote: "same remote as"
}

export function rowOfProjectFolder(folder: ProjectFolder, folders: ProjectFolder[]): FolderListRow {
    const relationship = folder.relationships[0]
    const related = relationship ? folders.find(candidate => candidate.id === relationship.folderId) : undefined
    return {
        key: folder.id,
        label: folder.label,
        role: folder.role,
        kind: folder.kind,
        path: folder.path,
        remote: firstRemote(folder.git),
        hint: relationship && related ? `${RELATIONSHIP_WORDS[relationship.kind]} ${related.label}` : null,
        isMissing: folder.status === "missing",
        snapshotCount: folder.snapshotCount
    }
}

export function firstRemote(git: FolderGitFacts | null): string | null {
    const remote = git?.remotes[0]
    return remote ? `${remote.name} ${remoteDisplay(remote)}` : null
}

export function labelProblem(label: string, otherLabels: string[]): string | null {
    if (label.includes(LABEL_SEPARATOR)) {
        return "A label cannot contain '/'."
    }
    const lowered = label.trim().toLowerCase()
    return otherLabels.some(other => other.trim().toLowerCase() === lowered) ? "Another folder already uses this label." : null
}
