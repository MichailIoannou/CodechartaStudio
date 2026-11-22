import type { CompareIntent } from "../../../model/coreApi/CompareIntent"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { FakeBackend, FakeBridgeKit, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeCompareBackend(kit: FakeBridgeKit): FakeBackend {
    const MEGABYTE = 1024 * 1024
    const WARN_BYTES = 15 * MEGABYTE
    const BLOCK_BYTES = 60 * MEGABYTE
    const { store, succeed, refuse } = kit

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

    function comparedSide(folder: FolderRef, revision: string) {
        const sha = commitAtRevision(folder.folderId, revision)
        const snapshot = kit.snapshots.snapshotsOf(folder.projectId, folder.folderId).find(candidate => candidate.commit === sha)
        const requested = { folder, commit: sha, shortCommit: sha.slice(0, 7), label: labelOfRevision(revision, sha) }
        const status = snapshot
            ? { status: "exact", snapshot: JSON.parse(JSON.stringify(snapshot)) }
            : { status: "missing", nearest: nearestOf(folder, sha) }
        return { requested, status }
    }

    function comparedFolder(intent: CompareIntent): FolderRef {
        return intent.kind === "explicit" ? intent.base.folder : intent.folder
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

    function branchTarget(folderId: string, branch: string, target: string | null) {
        if (target) {
            return target
        }
        const current = repositoryOf(folderId)?.refs?.localBranches.find(candidate => candidate.isCurrent)
        return current && current.refName !== branch ? current.refName : "refs/heads/main"
    }

    function positionOf(folderId: string, revision: string) {
        const sha = commitAtRevision(folderId, revision)
        return commitsOf(folderId).findIndex(commit => commit.sha === sha)
    }

    function withParentRevisions(folderId: string, commit: string) {
        const parent = commitsOf(folderId)[positionOf(folderId, commit)]?.parents[0]
        return parent ? [parent, commit] : null
    }

    function comparedRevisions(intent: CompareIntent, shownCommit: string | null): (string | null)[] | null {
        const folderId = comparedFolder(intent).folderId
        switch (intent.kind) {
            case "commits":
                return positionOf(folderId, intent.b) > positionOf(folderId, intent.a) ? [intent.b, intent.a] : [intent.a, intent.b]
            case "withParent":
                return withParentRevisions(folderId, intent.commit)
            case "withCurrent":
                return [intent.commit, shownCommit ?? "HEAD"]
            case "branch":
                return [branchTarget(folderId, intent.branch, intent.target), intent.branch]
            case "explicit":
                return [revisionOfTyped(folderId, intent.base.rev.name), revisionOfTyped(folderId, intent.head.rev.name)]
            default:
                return null
        }
    }

    function mergeBaseOf(folderId: string, tip: string, head: string) {
        const fromTip = reachedFrom(folderId, commitAtRevision(folderId, tip))
        const fromHead = reachedFrom(folderId, commitAtRevision(folderId, head))
        return commitsOf(folderId).find(commit => fromHead.has(commit.sha) && fromTip.has(commit.sha))?.sha ?? null
    }

    function usesMergeBase(intent: CompareIntent, base: string) {
        const isNamedRef = base.startsWith("refs/")
        return (intent.kind === "branch" || intent.kind === "explicit") && intent.baseMode === "mergeBase" && isNamedRef
    }

    function sizeVerdictOf(bytes: number) {
        if (bytes > BLOCK_BYTES) {
            return "block"
        }
        return bytes > WARN_BYTES ? "warn" : "ok"
    }

    function shownSnapshotOf(side: ReturnType<typeof comparedSide>): SnapshotSummary | null {
        return side.status.status === "exact" ? (side.status.snapshot as SnapshotSummary) : (side.status.nearest?.snapshot ?? null)
    }

    function preflightOf(sides: ReturnType<typeof comparedSide>[]) {
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

    function originOf(intent: CompareIntent, baseRevision: string) {
        return intent.kind === "branch" || (intent.kind === "explicit" && baseRevision.startsWith("refs/")) ? "branches" : "commits"
    }

    function comparison(intent: CompareIntent, baseRevision: string, headRevision: string) {
        const folder = comparedFolder(intent)
        const mergeBase = usesMergeBase(intent, baseRevision) ? mergeBaseOf(folder.folderId, baseRevision, headRevision) : null
        const isTipTheMergeBase = mergeBase === commitAtRevision(folder.folderId, baseRevision)
        const base = comparedSide(folder, mergeBase && !isTipTheMergeBase ? mergeBase : baseRevision)
        const head = comparedSide(folder, headRevision)
        return {
            status: { kind: base.requested.commit === head.requested.commit ? "sameCommit" : "ready" },
            origin: originOf(intent, baseRevision),
            baseMode: mergeBase ? "mergeBase" : "tip",
            base,
            head,
            baseTip: mergeBase ? comparedSide(folder, baseRevision).requested : null,
            preflight: preflightOf([base, head])
        }
    }

    function resolveComparison(params: FakeRequestParams) {
        const intent = params.intent as CompareIntent
        const revisions = comparedRevisions(intent, params.shownCommit ?? null)
        if (!revisions) {
            return refuse("UNKNOWN_REVISION", "The commit has no parent to compare with.")
        }
        if (revisions.some(revision => revision === null)) {
            return refuse("UNKNOWN_REVISION", "The revision is not in the repository.")
        }
        const [baseRevision, headRevision] = revisions as string[]
        return succeed(comparison(intent, baseRevision, headRevision))
    }

    return {
        "compare.resolve": resolveComparison
    }
}
