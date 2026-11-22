import type { GitAbortableOperation } from "../../../model/coreApi/GitAbortableOperation"
import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import type { GitRemoteBranch } from "../../../model/coreApi/GitRemoteBranch"
import type { GitUpstream } from "../../../model/coreApi/GitUpstream"
import type { FakeBackend, FakeBridgeKit, FakeGitRepository, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeGitSyncBackend(kit: FakeBridgeKit): FakeBackend {
    const { refuse } = kit
    const { write, countChanges } = kit.git

    function currentBranchOf(repository: FakeGitRepository) {
        return repository.refs?.localBranches.find(branch => branch.isCurrent)
    }

    function localBranchOf(repository: FakeGitRepository, refName: string) {
        return repository.refs?.localBranches.find(branch => branch.refName === refName)
    }

    function remoteBranchOf(repository: FakeGitRepository, refName: string | undefined) {
        return repository.refs?.remoteBranches.find(branch => branch.refName === refName)
    }

    function upstreamOf(remote: { refName: string; name: string }): GitUpstream {
        return { refName: remote.refName, name: remote.name, ahead: 0, behind: 0, isGone: false }
    }

    function track(repository: FakeGitRepository, branch: GitLocalBranch, upstream: GitUpstream) {
        branch.upstream = upstream
        if (branch.isCurrent && repository.status) {
            repository.status.upstream = upstream
        }
    }

    function moveCurrentBranch(repository: FakeGitRepository, branch: GitLocalBranch, commit: string) {
        branch.commit = commit
        if (repository.refs && repository.status) {
            repository.refs.head = { kind: "branch", name: branch.name, commit }
            repository.status.head = repository.refs.head
        }
    }

    function pull(repository: FakeGitRepository, params: FakeRequestParams) {
        const mode = params.mode ?? "ffOnly"
        const refusal = repository.pullRefusals?.[mode]
        if (refusal) {
            return { ok: false as const, error: refusal }
        }
        const branch = currentBranchOf(repository)
        const remote = remoteBranchOf(repository, branch?.upstream?.refName)
        if (!branch?.upstream || !remote) {
            return refuse("NO_UPSTREAM", "There is no tracking information for the current branch.")
        }
        const conflicts = repository.pullConflicts ?? []
        if (mode !== "ffOnly" && conflicts.length > 0) {
            return stopOnConflicts(repository, mode, conflicts)
        }
        moveCurrentBranch(repository, branch, remote.commit)
        track(repository, branch, { ...branch.upstream, behind: 0 })
        return null
    }

    function stopOnConflicts(repository: FakeGitRepository, mode: GitAbortableOperation, paths: string[]) {
        if (repository.status) {
            repository.status.operationInProgress = mode
        }
        const conflicted = paths.map(path => ({
            path,
            previousPath: null,
            kind: "conflicted" as const,
            change: "modified" as const,
            conflict: "UU"
        }))
        repository.changes = [...(repository.changes ?? []), ...conflicted]
        countChanges(repository)
        return refuse("CONFLICTS", `CONFLICT (content): Merge conflict in ${paths[0]}`)
    }

    function push(repository: FakeGitRepository, params: FakeRequestParams) {
        const branch = localBranchOf(repository, params.branchRefName ?? "")
        if (!branch || !repository.refs) {
            return refuse("NOT_FOUND", `The fake desktop bridge has no branch ${params.branchRefName}.`)
        }
        const lease = params.forceWithLeaseExpected ?? null
        const destination =
            remoteBranchOf(repository, branch.upstream?.refName) ?? publishedBranch(repository.refs, branch, params.remote ?? "")
        if (lease === null && (branch.upstream?.behind ?? 0) > 0) {
            return refuse("PUSH_REJECTED", `!\t${branch.refName}\t[rejected] (non-fast-forward)`)
        }
        if (lease !== null && lease !== destination.commit) {
            return refuse("STALE_PUSH_LEASE", `!\t${branch.refName}\t[rejected] (stale info)`)
        }
        destination.commit = branch.commit
        if (branch.upstream || params.setUpstream) {
            track(repository, branch, upstreamOf(destination))
        }
        return null
    }

    function publishedBranch(refs: GitRefs, branch: GitLocalBranch, remote: string): GitRemoteBranch {
        const published = {
            refName: `refs/remotes/${remote}/${branch.name}`,
            remote,
            name: `${remote}/${branch.name}`,
            branchName: branch.name,
            commit: branch.commit,
            lastCommit: branch.lastCommit
        }
        refs.remoteBranches.push(published)
        return published
    }

    function abortOperation(repository: FakeGitRepository, params: FakeRequestParams) {
        const status = repository.status
        if (!status || status.operationInProgress !== params.operation) {
            return refuse("NOT_ALLOWED", `No ${params.operation} is in progress.`)
        }
        status.operationInProgress = null
        repository.changes = (repository.changes ?? []).filter(entry => entry.kind !== "conflicted")
        countChanges(repository)
        return null
    }

    return {
        "git.pull": write("git.pull", pull),
        "git.push": write("git.push", push),
        "git.abortOperation": write("git.abortOperation", abortOperation)
    }
}
