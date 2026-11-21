import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeSnapshotsBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, nextId } = kit
    Object.assign(store, {
        snapshots: JSON.parse(JSON.stringify(kit.seed.snapshots ?? [])),
        snapshotMaps: { ...kit.seed.snapshotMaps },
        commits: { ...kit.seed.commits }
    })

    function snapshotsOf(projectId: string, folderId?: string) {
        return store.snapshots.filter(
            snapshot => snapshot.ref.projectId === projectId && (folderId === undefined || snapshot.ref.folderId === folderId)
        )
    }

    function findSnapshot(params: FakeRequestParams) {
        return store.snapshots.find(
            snapshot =>
                snapshot.ref.projectId === params.projectId &&
                snapshot.ref.folderId === params.folderId &&
                snapshot.ref.snapshotId === params.snapshotId
        )
    }

    function commitOf(folderId: string, hash: string) {
        return (store.commits[folderId] ?? []).find(candidate => candidate.commit.startsWith(hash)) ?? null
    }

    function noSnapshot(params: FakeRequestParams) {
        return refuse("NOT_FOUND", `The fake desktop bridge has no snapshot ${String(params.snapshotId)}.`)
    }

    function listSnapshots(params: FakeRequestParams) {
        const snapshots = snapshotsOf(params.projectId ?? "", params.folderId)
        snapshots.sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        return succeed({ snapshots: JSON.parse(JSON.stringify(snapshots)) })
    }

    function deleteSnapshot(params: FakeRequestParams) {
        const snapshot = findSnapshot(params)
        if (!snapshot) {
            return noSnapshot(params)
        }
        store.snapshots = store.snapshots.filter(candidate => candidate !== snapshot)
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        if (project?.view.shownSnapshotIdByFolder[snapshot.ref.folderId] === snapshot.ref.snapshotId) {
            delete project.view.shownSnapshotIdByFolder[snapshot.ref.folderId]
        }
        return succeed(null)
    }

    function recordMapFacts(params: FakeRequestParams) {
        const snapshot = findSnapshot(params)
        if (snapshot) {
            snapshot.checksum = params.checksum ?? null
        }
        return snapshot ? succeed(null) : noSnapshot(params)
    }

    function resolveCommit(params: FakeRequestParams) {
        return succeed({ commit: commitOf(params.folderId ?? "", params.hash ?? "") })
    }

    function moveSnapshot(params: FakeRequestParams) {
        const snapshot = findSnapshot(params)
        const project = store.projects.find(candidate => candidate.id === params.projectId)
        const toFolderId = params.toFolderId ?? ""
        if (!(snapshot && project?.folders.some(folder => folder.id === toFolderId))) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no snapshot ${String(params.snapshotId)} or folder ${toFolderId}.`)
        }
        const commit = params.bindToCommit ? commitOf(toFolderId, params.bindToCommit) : null
        if (params.bindToCommit && !commit) {
            return refuse("NOT_A_COMMIT", `The folder has no commit ${params.bindToCommit}.`)
        }
        const fromFolderId = snapshot.ref.folderId
        const wasShown = project.view.shownSnapshotIdByFolder[fromFolderId] === snapshot.ref.snapshotId
        Object.assign(snapshot, {
            ref: { ...snapshot.ref, folderId: toFolderId, snapshotId: nextId("imported") },
            commit: commit?.commit ?? null,
            shortCommit: commit?.shortCommit ?? null,
            subject: commit?.subject ?? null
        })
        if (wasShown) {
            delete project.view.shownSnapshotIdByFolder[fromFolderId]
            project.view.shownSnapshotIdByFolder[toFolderId] = snapshot.ref.snapshotId
        }
        return succeed(JSON.parse(JSON.stringify(snapshot)))
    }

    function readMapChunk(params: FakeRequestParams) {
        const snapshotId = params.snapshotId ?? ""
        if (!Object.hasOwn(store.snapshotMaps, snapshotId)) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no map for ${snapshotId}.`)
        }
        const map = store.snapshotMaps[snapshotId]
        const offset = params.offset ?? 0
        return succeed({ bytes: new Uint8Array(map.slice(offset, offset + (params.length ?? 0))), offset, totalBytes: map.length })
    }

    kit.snapshots = { snapshotsOf, findSnapshot, commitOf }

    return {
        "projects.resolveCommit": resolveCommit,
        "snapshots.list": listSnapshots,
        "snapshots.delete": deleteSnapshot,
        "snapshots.recordMapFacts": recordMapFacts,
        "snapshots.move": moveSnapshot,
        "snapshots.readMapChunk": readMapChunk
    }
}
