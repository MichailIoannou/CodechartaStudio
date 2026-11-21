import type { Project } from "../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { ProjectSummary } from "../../../model/coreApi/ProjectSummary"
import type { ProjectView } from "../../../model/coreApi/ProjectView"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"

export type SnapshotsByFolder = Record<string, SnapshotSummary[]>

export interface FolderSnapshot {
    folder: ProjectFolder
    snapshot: SnapshotSummary
}

export interface ViewChange {
    workingFolderId?: string
    shownSnapshotIdByFolder?: Record<string, string>
}

export function workingFolderOf(project: Project | null): ProjectFolder | null {
    if (!project) {
        return null
    }
    const working = project.folders.find(folder => folder.id === project.view.workingFolderId)
    return working ?? project.folders.find(folder => folder.role === "primary") ?? project.folders[0] ?? null
}

export function findSnapshot(snapshotsByFolder: SnapshotsByFolder, ref: SnapshotRef): SnapshotSummary | undefined {
    return (snapshotsByFolder[ref.folderId] ?? []).find(snapshot => snapshot.ref.snapshotId === ref.snapshotId)
}

/** The snapshots of a folder that can still be read, the one shown last first. */
export function candidatesOf(
    snapshotsByFolder: SnapshotsByFolder,
    folder: ProjectFolder,
    unreadableIds: ReadonlySet<string>,
    rememberedId: string | undefined
): SnapshotSummary[] {
    const readable = (snapshotsByFolder[folder.id] ?? []).filter(snapshot => !unreadableIds.has(snapshot.ref.snapshotId))
    const remembered = readable.find(snapshot => snapshot.ref.snapshotId === rememberedId)
    return remembered ? [remembered, ...readable.filter(snapshot => snapshot !== remembered)] : readable
}

/** Null unless every ref names a listed snapshot of a folder of the project. */
export function entriesOf(project: Project | null, snapshotsByFolder: SnapshotsByFolder, refs: SnapshotRef[]): FolderSnapshot[] | null {
    const entries = refs.flatMap(ref => {
        const folder = ref.projectId === project?.id ? project.folders.find(candidate => candidate.id === ref.folderId) : undefined
        const snapshot = findSnapshot(snapshotsByFolder, ref)
        return folder && snapshot ? [{ folder, snapshot }] : []
    })
    return entries.length === refs.length ? entries : null
}

export function viewWith(view: ProjectView, change: ViewChange): ProjectView {
    return {
        workingFolderId: change.workingFolderId ?? view.workingFolderId,
        shownSnapshotIdByFolder: { ...view.shownSnapshotIdByFolder, ...change.shownSnapshotIdByFolder }
    }
}

export function folderLabelOf(projects: ProjectSummary[], projectId: string, folderId: string): string {
    const summary = projects.find(project => project.id === projectId)
    return summary?.folders.find(folder => folder.id === folderId)?.label ?? folderId
}
