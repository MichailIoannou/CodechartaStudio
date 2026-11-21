import type { PrunePolicy } from "../../../model/coreApi/PrunePolicy"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeRetentionBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, emit } = kit

    function isAnalysedCommit(snapshot: SnapshotSummary) {
        return snapshot.source === "analysed" && snapshot.target === "commit"
    }

    function bytesOf(snapshots: SnapshotSummary[]) {
        return snapshots.reduce((total, snapshot) => total + snapshot.mapBytes, 0)
    }

    function newestAnalysedOf(params: FakeRequestParams) {
        return kit.snapshots
            .snapshotsOf(params.projectId ?? "", params.folderId)
            .filter(snapshot => snapshot.source === "analysed")
            .sort((first, second) => (second.finishedAt ?? "").localeCompare(first.finishedAt ?? ""))
    }

    function tipCommitsOf(folderId: string) {
        const refs = store.git[folderId]?.refs
        return new Set([...(refs?.localBranches ?? []), ...(refs?.tags ?? [])].map(ref => ref.commit))
    }

    function keptOf(params: FakeRequestParams, analysed: SnapshotSummary[]) {
        const policy = params.policy as PrunePolicy
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        const shownId = project?.view.shownSnapshotIdByFolder[params.folderId ?? ""]
        const tips = tipCommitsOf(params.folderId ?? "")
        const isKeptTip = (snapshot: SnapshotSummary) =>
            policy.keepBranchTipsAndTags && snapshot.commit !== null && tips.has(snapshot.commit)
        return new Set([
            ...analysed.filter(isAnalysedCommit).slice(0, policy.keepNewestCommitSnapshots),
            ...analysed.filter(snapshot => !isAnalysedCommit(snapshot)).slice(0, policy.keepNewestWorkingTreeSnapshots),
            ...analysed.filter(snapshot => snapshot.ref.snapshotId === shownId),
            ...analysed.filter(isKeptTip)
        ])
    }

    function planPrune(params: FakeRequestParams) {
        const analysed = newestAnalysedOf(params)
        const kept = keptOf(params, analysed)
        const toDelete = analysed.filter(snapshot => !kept.has(snapshot))
        return succeed({ delete: JSON.parse(JSON.stringify(toDelete)), keep: kept.size, freedBytes: bytesOf(toDelete) })
    }

    function prune(params: FakeRequestParams) {
        const ids = new Set(params.snapshotIds ?? [])
        const removed = kit.snapshots
            .snapshotsOf(params.projectId ?? "", params.folderId)
            .filter(snapshot => ids.has(snapshot.ref.snapshotId))
        store.snapshots = store.snapshots.filter(snapshot => !removed.includes(snapshot))
        if (removed.length > 0) {
            emit("snapshots.changed", { projectId: params.projectId, folderId: params.folderId })
        }
        return succeed({ deleted: removed.length, freedBytes: bytesOf(removed) })
    }

    return {
        "snapshots.planPrune": planPrune,
        "snapshots.prune": prune
    }
}
