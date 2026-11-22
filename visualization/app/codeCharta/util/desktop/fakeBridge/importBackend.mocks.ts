import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { PickedImportFile } from "../../../model/coreApi/PickedImportFile"
import type { Project } from "../../../model/coreApi/Project"
import type { ResolvedCommit } from "../../../model/coreApi/ResolvedCommit"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeImportBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, nextId, now } = kit
    Object.assign(store, {
        importFileToPick: kit.seed.pickedImportFile ?? null,
        pickedImportFiles: new Map<string, PickedImportFile>(),
        importedContent: new Map<string, FolderRef & { snapshotId: string }>()
    })

    function pickImportFile() {
        const picked = store.importFileToPick
        if (picked) {
            const { pickToken, path, suggestedName, kind, git } = picked.containingFolder
            store.pickedImportFiles.set(picked.importToken, picked)
            store.pickedFolders.set(pickToken, { pickToken, path, suggestedLabel: suggestedName, kind, git })
        }
        return succeed(picked ? JSON.parse(JSON.stringify(picked)) : null)
    }

    function bindableCommit(file: PickedImportFile, folderId: string, bindToCommit: string): ResolvedCommit | null {
        return file.hintCommit?.commit === bindToCommit ? file.hintCommit : kit.snapshots.commitOf(folderId, bindToCommit)
    }

    function importedSnapshot(file: PickedImportFile, ref: FolderRef, commit: ResolvedCommit | null): SnapshotSummary {
        return {
            ref: { ...ref, snapshotId: nextId("imported") },
            source: "imported",
            createdAt: now,
            commit: commit?.commit ?? null,
            shortCommit: commit?.shortCommit ?? null,
            subject: commit?.subject ?? null,
            commitDate: null,
            dirty: false,
            originalFileName: file.fileName,
            fileModifiedAt: file.fileModifiedAt,
            mapBytes: file.sizeBytes,
            checksum: null,
            profileHash: null,
            target: null,
            finishedAt: null,
            durationMs: null,
            notInMap: []
        }
    }

    function earlierImportOf(file: PickedImportFile, ref: FolderRef, contentKey: string) {
        const earlierImport = store.importedContent.get(contentKey) ?? file.duplicateOf
        return earlierImport?.projectId === ref.projectId ? kit.snapshots.findSnapshot(earlierImport) : undefined
    }

    function importInto(file: PickedImportFile, ref: FolderRef, bindToCommit?: string | null) {
        const commit = bindToCommit ? bindableCommit(file, ref.folderId, bindToCommit) : null
        if (bindToCommit && !commit) {
            return refuse("NOT_A_COMMIT", `The folder has no commit ${bindToCommit}.`)
        }
        const contentKey = `${ref.projectId}/${file.fileName}/${file.sizeBytes}`
        const existing = earlierImportOf(file, ref, contentKey)
        store.pickedImportFiles.delete(file.importToken)
        const snapshot = existing ?? importedSnapshot(file, ref, commit)
        if (!existing) {
            store.snapshots.push(snapshot)
            store.importedContent.set(contentKey, snapshot.ref)
        }
        return succeed({ snapshot: JSON.parse(JSON.stringify(snapshot)), wasAlreadyImported: Boolean(existing) })
    }

    function openInto(file: PickedImportFile, ref: FolderRef, bindToCommit: string | null | undefined, createdProject: boolean) {
        const project = store.projects.find(candidate => candidate.id === ref.projectId)
        if (!project?.folders.some(folder => folder.id === ref.folderId)) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no folder ${String(ref.folderId)}.`)
        }
        const imported = importInto(file, ref, bindToCommit)
        return imported.ok
            ? succeed({ project: kit.projects.withCounts(project), ...(imported.value as object), createdProject })
            : imported
    }

    function existingTargetOf(file: PickedImportFile): FolderRef | null {
        if (file.existingTarget) {
            return { projectId: file.existingTarget.projectId, folderId: file.existingTarget.folderId }
        }
        const project = store.projects.find(candidate => candidate.folders.some(folder => folder.path === file.containingFolder.path))
        const folder = project?.folders.find(candidate => candidate.path === file.containingFolder.path)
        return project && folder ? { projectId: project.id, folderId: folder.id } : null
    }

    function openIntoNewProject(file: PickedImportFile, bindToCommit?: string | null) {
        const { pickToken, suggestedName } = file.containingFolder
        const created = kit.projects.createProject({
            name: suggestedName,
            folders: [{ pickToken, label: suggestedName, role: "primary" }]
        })
        if (!created.ok) {
            return created
        }
        const project = created.value as Project
        const opened = openInto(file, { projectId: project.id, folderId: project.folders[0].id }, bindToCommit, true)
        store.projects = opened.ok ? store.projects : store.projects.filter(candidate => candidate.id !== project.id)
        return opened
    }

    function pickedFileOf(params: FakeRequestParams) {
        return store.pickedImportFiles.get(params.importToken ?? "")
    }

    function openFile(params: FakeRequestParams) {
        const file = pickedFileOf(params)
        if (!file) {
            return refuse("TOKEN_EXPIRED", "Pick the file again.")
        }
        const target = (params.target as FolderRef | null | undefined) ?? existingTargetOf(file)
        return target ? openInto(file, target, params.bindToCommit, false) : openIntoNewProject(file, params.bindToCommit)
    }

    function importSnapshot(params: FakeRequestParams) {
        const file = pickedFileOf(params)
        if (!file) {
            return refuse("TOKEN_EXPIRED", "Pick the file again.")
        }
        const target = { projectId: params.projectId ?? "", folderId: params.folderId ?? "" }
        const opened = openInto(file, target, params.bindToCommit, false)
        return opened.ok ? succeed((opened.value as { snapshot: SnapshotSummary }).snapshot) : opened
    }

    return {
        "snapshots.pickImportFile": pickImportFile,
        "snapshots.openFile": openFile,
        "snapshots.import": importSnapshot
    }
}
