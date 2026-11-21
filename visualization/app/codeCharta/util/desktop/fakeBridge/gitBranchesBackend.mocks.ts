import type { FakeBackend, FakeBridgeKit, FakeGitRepository, FakeGitTarget, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeGitBranchesBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse } = kit
    const { write } = kit.git

    function localBranchOf(repository: FakeGitRepository, refName: string) {
        return repository.refs?.localBranches.find(branch => branch.refName === refName)
    }

    function upstreamOf(remote: { refName: string; name: string }) {
        return { refName: remote.refName, name: remote.name, ahead: 0, behind: 0, isGone: false }
    }

    function noBranch(refName: string | undefined) {
        return refuse("NOT_FOUND", `The fake desktop bridge has no branch ${refName}.`)
    }

    function checkOut(repository: FakeGitRepository, refName: string) {
        const refs = repository.refs
        const status = repository.status
        const branch = localBranchOf(repository, refName)
        if (!refs || !status || !branch) {
            return noBranch(refName)
        }
        for (const candidate of refs.localBranches) {
            candidate.isCurrent = candidate.refName === refName
        }
        refs.head = { kind: "branch", name: branch.name, commit: branch.commit }
        Object.assign(status, { head: refs.head, upstream: branch.upstream })
        return null
    }

    function addLocalBranch(repository: FakeGitRepository, name: string, commit: string) {
        const refs = repository.refs
        if (!refs) {
            return refuse("NOT_A_REPOSITORY", "The fake desktop bridge has no refs.")
        }
        if (refs.localBranches.some(branch => branch.name === name)) {
            return refuse("BRANCH_EXISTS", "A branch with that name already exists.")
        }
        const subject = repository.commits?.find(candidate => candidate.sha === commit)?.subject ?? ""
        refs.localBranches.push({
            refName: `refs/heads/${name}`,
            name,
            commit,
            isCurrent: false,
            upstream: null,
            checkedOutInOtherWorktree: null,
            lastCommit: { subject, committedAt: 0 }
        })
        return null
    }

    function trackRemote(repository: FakeGitRepository, target: { remoteRefName: string; localName: string }) {
        const remote = repository.refs?.remoteBranches.find(branch => branch.refName === target.remoteRefName)
        if (!remote) {
            return noBranch(target.remoteRefName)
        }
        const refusal = addLocalBranch(repository, target.localName, remote.commit)
        const created = localBranchOf(repository, `refs/heads/${target.localName}`)
        if (refusal || !created) {
            return refusal
        }
        created.upstream = upstreamOf(remote)
        return checkOut(repository, created.refName)
    }

    function switchBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const target = params.target as unknown as FakeGitTarget
        if (target.kind === "local") {
            return checkOut(repository, target.refName)
        }
        return target.kind === "remote"
            ? refuse("BAD_REQUEST", "The fake desktop bridge cannot switch to that.")
            : trackRemote(repository, target)
    }

    function createBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const name = params.name ?? ""
        const refusal = addLocalBranch(repository, name, params.startPoint ?? "")
        return refusal ?? (params.checkout ? checkOut(repository, `refs/heads/${name}`) : null)
    }

    function renameBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const branch = localBranchOf(repository, params.refName ?? "")
        const newName = params.newName ?? ""
        if (!branch) {
            return noBranch(params.refName)
        }
        if (repository.refs?.localBranches.some(candidate => candidate.name === newName)) {
            return refuse("BRANCH_EXISTS", "A branch with that name already exists.")
        }
        Object.assign(branch, { name: newName, refName: `refs/heads/${newName}` })
        return branch.isCurrent ? checkOut(repository, branch.refName) : null
    }

    function deleteLocalBranch(repository: FakeGitRepository, target: { refName: string; force?: boolean }) {
        const refs = repository.refs
        const branch = localBranchOf(repository, target.refName)
        if (branch && !target.force && repository.unmergedBranches?.includes(branch.name)) {
            return refuse("BRANCH_NOT_FULLY_MERGED", "The branch has commits that no other branch contains.")
        }
        if (refs) {
            refs.localBranches = refs.localBranches.filter(candidate => candidate.refName !== target.refName)
        }
        return null
    }

    function deleteBranch(repository: FakeGitRepository, params: FakeRequestParams) {
        const target = params.target as unknown as FakeGitTarget
        const refs = repository.refs
        if (!refs || target.kind === "trackRemote") {
            return refuse("BAD_REQUEST", "The fake desktop bridge cannot delete that.")
        }
        if (target.kind === "remote") {
            refs.remoteBranches = refs.remoteBranches.filter(branch => branch.refName !== target.remoteRefName)
            return null
        }
        return deleteLocalBranch(repository, target)
    }

    function setUpstream(repository: FakeGitRepository, params: FakeRequestParams) {
        const branch = localBranchOf(repository, params.refName ?? "")
        const remote = repository.refs?.remoteBranches.find(candidate => candidate.refName === params.upstreamRefName)
        if (!branch) {
            return noBranch(params.refName)
        }
        branch.upstream = remote ? upstreamOf(remote) : null
        if (branch.isCurrent && repository.status) {
            repository.status.upstream = branch.upstream
        }
        return null
    }

    function leaveUnchanged() {
        return null
    }

    const fetchWrite = write("git.fetch", leaveUnchanged)

    function fetchAll(params: FakeRequestParams) {
        const answer = fetchWrite(params)
        const repository = store.git[params.repo?.folderId ?? ""]
        return answer.ok ? succeed({ updatedRefs: repository?.fetchedRefs ?? 0, refs: repository?.refs }) : answer
    }

    return {
        "git.fetch": fetchAll,
        "git.switch": write("git.switch", switchBranch),
        "git.branchCreate": write("git.branchCreate", createBranch),
        "git.branchRename": write("git.branchRename", renameBranch),
        "git.branchDelete": write("git.branchDelete", deleteBranch),
        "git.setUpstream": write("git.setUpstream", setUpstream)
    }
}
