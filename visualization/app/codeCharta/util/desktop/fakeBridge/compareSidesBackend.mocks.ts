import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { SideInput } from "../../../model/coreApi/SideInput"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeComparedSide } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeCompareSidesBackend(kit: FakeBridgeKit): FakeBackend {
    const MEGABYTE = 1024 * 1024
    const WARN_BYTES = 15 * MEGABYTE
    const BLOCK_BYTES = 60 * MEGABYTE
    const { store } = kit

    function repositoryOf(folderId: string) {
        return Object.hasOwn(store.git, folderId) ? store.git[folderId] : undefined
    }

    function commitsOf(folderId: string) {
        return repositoryOf(folderId)?.commits ?? []
    }

    function namedRefsOf(folderId: string) {
        const refs = repositoryOf(folderId)?.refs
        return [...(refs?.tags ?? []), ...(refs?.localBranches ?? []), ...(refs?.remoteBranches ?? [])]
    }

    function commitAtRevision(folderId: string, revision: string) {
        if (revision === "HEAD") {
            const repository = repositoryOf(folderId)
            return repository?.status?.head.commit ?? repository?.refs?.head.commit ?? revision
        }
        return namedRefsOf(folderId).find(ref => ref.refName === revision)?.commit ?? revision
    }

    function labelOfRevision(revision: string, sha: string) {
        const prefixes = [
            ["refs/heads/", "branch"],
            ["refs/remotes/", "branch"],
            ["refs/tags/", "tag"]
        ]
        const prefix = prefixes.find(([start]) => revision.startsWith(start))
        return prefix ? { kind: prefix[1], name: revision.slice(prefix[0].length) } : { kind: "commit", name: sha.slice(0, 7) }
    }

    function reachedFrom(folderId: string, sha: string) {
        return new Set(kit.git.reachableCommits(commitsOf(folderId), [sha]).map(commit => commit.sha))
    }

    function nearestOf(folder: FolderRef, sha: string) {
        const reached = reachedFrom(folder.folderId, sha)
        const snapshots = kit.snapshots.snapshotsOf(folder.projectId, folder.folderId)
        const isAnalysedAncestor = (commitSha: string) =>
            commitSha !== sha && reached.has(commitSha) && snapshots.some(candidate => candidate.commit === commitSha)
        const ancestor = commitsOf(folder.folderId).find(commit => isAnalysedAncestor(commit.sha))
        if (!ancestor) {
            return null
        }
        const snapshot = snapshots.find(candidate => candidate.commit === ancestor.sha)
        const fromAncestor = reachedFrom(folder.folderId, ancestor.sha)
        const behind = [...reached].filter(reachedSha => !fromAncestor.has(reachedSha)).length
        return { snapshot: JSON.parse(JSON.stringify(snapshot)), relation: "ancestor", staleBy: behind, behind, ahead: 0 }
    }

    function comparedSide(folder: FolderRef, revision: string): FakeComparedSide {
        const sha = commitAtRevision(folder.folderId, revision)
        const snapshot = kit.snapshots.snapshotsOf(folder.projectId, folder.folderId).find(candidate => candidate.commit === sha)
        const requested = {
            folder,
            kind: "commit",
            commit: sha,
            shortCommit: sha.slice(0, 7),
            snapshotId: null,
            label: labelOfRevision(revision, sha)
        }
        const status = snapshot
            ? { status: "exact", snapshot: JSON.parse(JSON.stringify(snapshot)) }
            : { status: "missing", nearest: nearestOf(folder, sha) }
        return { requested, status }
    }

    function isFullRevision(name: string) {
        return name === "HEAD" || name.startsWith("refs/") || /^[0-9a-f]{40}$/.test(name)
    }

    function revisionOfTyped(folderId: string, name: string) {
        if (isFullRevision(name)) {
            return name
        }
        const named = namedRefsOf(folderId).find(ref => ref.name === name)
        const isShaPrefix = /^[0-9a-f]{4,}$/i.test(name)
        const byPrefix = commitsOf(folderId).filter(commit => isShaPrefix && commit.sha.startsWith(name.toLowerCase()))
        return named?.refName ?? (byPrefix.length === 1 ? byPrefix[0].sha : null)
    }

    function sizeVerdictOf(bytes: number) {
        if (bytes > BLOCK_BYTES) {
            return "block"
        }
        return bytes > WARN_BYTES ? "warn" : "ok"
    }

    function shownSnapshotOf(side: FakeComparedSide): SnapshotSummary | null {
        return side.status.status === "exact" ? (side.status.snapshot as SnapshotSummary) : (side.status.nearest?.snapshot ?? null)
    }

    function preflightOf(sides: FakeComparedSide[]) {
        const shown = sides.map(shownSnapshotOf)
        const checksums = shown.map(snapshot => snapshot?.checksum ?? null)
        const combinedBytes = shown.reduce((total, snapshot) => total + (snapshot?.mapBytes ?? 0), 0)
        return {
            identicalChecksums: checksums[0] !== null && checksums[0] === checksums[1],
            profilesDiffer: false,
            combinedBytes,
            sizeVerdict: sizeVerdictOf(combinedBytes)
        }
    }

    function snapshotSide(side: SideInput): FakeComparedSide | null {
        const { rev } = side
        const snapshot =
            rev.kind === "rev"
                ? undefined
                : kit.snapshots
                      .snapshotsOf(side.folder.projectId, side.folder.folderId)
                      .find(candidate => candidate.ref.snapshotId === rev.snapshotId)
        if (!snapshot) {
            return null
        }
        const label =
            rev.kind === "workingTree"
                ? { kind: "workingTree", name: "working tree" }
                : { kind: "imported", name: snapshot.originalFileName ?? "imported" }
        const requested = {
            folder: side.folder,
            kind: rev.kind,
            commit: null,
            shortCommit: null,
            snapshotId: snapshot.ref.snapshotId,
            label
        }
        return { requested, status: { status: "exact", snapshot: JSON.parse(JSON.stringify(snapshot)) } }
    }

    function sideOfInput(side: SideInput): FakeComparedSide | null {
        if (side.rev.kind !== "rev") {
            return snapshotSide(side)
        }
        const revision = revisionOfTyped(side.folder.folderId, side.rev.name)
        return revision === null ? null : comparedSide(side.folder, revision)
    }

    kit.compareSides = { repositoryOf, commitsOf, commitAtRevision, reachedFrom, comparedSide, revisionOfTyped, sideOfInput, preflightOf }

    return {}
}
