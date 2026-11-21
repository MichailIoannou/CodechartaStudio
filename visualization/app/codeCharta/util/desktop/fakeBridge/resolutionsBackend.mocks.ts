import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeResolutionsBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, seed } = kit
    Object.assign(store, { snapshotLogs: { ...seed.snapshotLogs }, resolutions: JSON.parse(JSON.stringify(seed.resolutions ?? {})) })

    function copyOf<Value>(value: Value): Value {
        return JSON.parse(JSON.stringify(value))
    }

    function resolutionKeyOf(folderId: string, target: AnalysisTarget) {
        return `${folderId}/${target.kind === "commit" ? target.sha : "workingTree"}`
    }

    function setResolution(folder: FolderRef, target: AnalysisTarget, resolution: SnapshotResolution) {
        store.resolutions[resolutionKeyOf(folder.folderId, target)] = copyOf(resolution)
    }

    function forget(folderId: string, target: AnalysisTarget) {
        delete store.resolutions[resolutionKeyOf(folderId, target)]
    }

    function headCommitOf(folderId: string) {
        return store.git[folderId]?.status?.head.commit ?? null
    }

    function snapshotFor(snapshots: SnapshotSummary[], folderId: string, target: AnalysisTarget) {
        const workingTree = target.kind === "workingTree" ? snapshots.find(snapshot => snapshot.target === "workingTree") : undefined
        const sha = target.kind === "commit" ? target.sha : headCommitOf(folderId)
        return workingTree ?? snapshots.find(snapshot => sha !== null && snapshot.commit === sha)
    }

    function newestSnapshotsOf(params: FakeRequestParams) {
        const snapshots = kit.snapshots.snapshotsOf(params.projectId ?? "", params.folderId ?? "")
        return snapshots.sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    }

    function folderOf(params: FakeRequestParams) {
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        return project?.folders.find(candidate => candidate.id === params.folderId)
    }

    function resolutionOf(params: FakeRequestParams, target: AnalysisTarget) {
        const snapshots = newestSnapshotsOf(params)
        if (snapshots.length === 0) {
            return { kind: "none", reason: "NO_SNAPSHOTS" }
        }
        if (folderOf(params)?.kind === "plain") {
            return { kind: "latest", snapshot: snapshots[0], reason: "PLAIN_FOLDER" }
        }
        const match = snapshotFor(snapshots, params.folderId ?? "", target)
        return match
            ? { kind: "exact", snapshot: match, isCurrentProfile: match.source === "analysed" }
            : { kind: "none", reason: "UNRELATED" }
    }

    function resolveForCommit(params: FakeRequestParams) {
        const target = params.target as AnalysisTarget
        const scripted = store.resolutions[resolutionKeyOf(params.folderId ?? "", target)]
        return succeed(copyOf(scripted ?? resolutionOf(params, target)))
    }

    function readSnapshotLog(params: FakeRequestParams) {
        const snapshotId = params.snapshotId ?? ""
        return Object.hasOwn(store.snapshotLogs, snapshotId)
            ? succeed({ log: store.snapshotLogs[snapshotId] })
            : refuse("NOT_FOUND", `The fake desktop bridge has no log for ${snapshotId}.`)
    }

    function storeUsage(params: FakeRequestParams) {
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        const folders = (project?.folders ?? []).map(folder => {
            const snapshots = kit.snapshots.snapshotsOf(project?.id ?? "", folder.id)
            const bytes = snapshots.reduce((total, snapshot) => total + snapshot.mapBytes, 0)
            return { folderId: folder.id, snapshotCount: snapshots.length, bytes }
        })
        return succeed({ totalBytes: folders.reduce((total, folder) => total + folder.bytes, 0), folders })
    }

    kit.resolutions = { forget }
    Object.assign(kit.controls, { setResolution })

    return {
        "snapshots.resolveForCommit": resolveForCommit,
        "snapshots.readLog": readSnapshotLog,
        "snapshots.usage": storeUsage
    }
}
