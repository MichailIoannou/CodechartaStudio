import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { GitWorkingTreeEntry } from "../../../model/coreApi/GitWorkingTreeEntry"
import type {
    FakeAnswer,
    FakeBackend,
    FakeBridgeKit,
    FakeGitChange,
    FakeGitMethod,
    FakeGitRepository,
    FakeRequestParams
} from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeGitWorkingTreeBackend(kit: FakeBridgeKit): FakeBackend {
    const STAGEABLE: GitEntryKind[] = ["unstaged", "untracked", "conflicted"]
    const { refuse, nextId } = kit
    const { answer, write, announceChange, countChanges, workingTreeOf } = kit.git

    function workingTreeWrite(method: FakeGitMethod, change: FakeGitChange) {
        const read = answer(method, (repository, params) => {
            if (!repository.status) {
                return undefined
            }
            const refusal = change(repository, params)
            if (refusal && "error" in refusal) {
                return refusal.error
            }
            countChanges(repository)
            return workingTreeOf(repository)
        })
        return (params: FakeRequestParams): FakeAnswer => {
            const written = read(params)
            announceChange(params)
            return written
        }
    }

    function changedSinceListed() {
        return refuse("CHANGED_SINCE_LISTED", "The working tree changed since it was listed.")
    }

    function listedEntry(repository: FakeGitRepository, path: string, kinds: GitEntryKind[]) {
        return (repository.changes ?? []).find(entry => entry.path === path && kinds.includes(entry.kind))
    }

    function moveEntry(repository: FakeGitRepository, entry: GitWorkingTreeEntry, kind: GitEntryKind, change: GitFileChange) {
        const others = (repository.changes ?? []).filter(candidate => candidate !== entry)
        const isMerged = others.some(candidate => candidate.path === entry.path && candidate.kind === kind)
        repository.changes = isMerged ? others : [...others, { ...entry, kind, change, conflict: null }]
    }

    function stagedPaths(repository: FakeGitRepository, params: FakeRequestParams) {
        const target = params.target as unknown as { kind: "paths"; paths: string[] } | { kind: "all" }
        if (target.kind === "paths") {
            return target.paths
        }
        return (repository.changes ?? []).filter(entry => STAGEABLE.includes(entry.kind)).map(entry => entry.path)
    }

    function stageChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const entries = stagedPaths(repository, params).map(path => listedEntry(repository, path, STAGEABLE))
        if (entries.some(entry => !entry)) {
            return changedSinceListed()
        }
        for (const entry of entries as GitWorkingTreeEntry[]) {
            moveEntry(repository, entry, "staged", entry.kind === "untracked" ? "added" : entry.change)
        }
        return null
    }

    function unstageChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const entries = (params.paths ?? []).map(path => listedEntry(repository, path, ["staged"]))
        if (entries.some(entry => !entry)) {
            return changedSinceListed()
        }
        for (const entry of entries as GitWorkingTreeEntry[]) {
            moveEntry(repository, entry, entry.change === "added" ? "untracked" : "unstaged", entry.change)
        }
        return null
    }

    function discardChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const rows = params.entries ?? []
        if (rows.some(row => row.kind === "conflicted")) {
            return refuse("NOT_ALLOWED", "A conflicted file cannot be discarded.")
        }
        const changes = repository.changes ?? []
        const listed = rows.map(row =>
            changes.find(entry => entry.path === row.path && entry.kind === row.kind && entry.change === row.change)
        )
        if (listed.some(entry => !entry)) {
            return changedSinceListed()
        }
        repository.changes = changes.filter(entry => !listed.includes(entry))
        return null
    }

    function refusalToCommit(repository: FakeGitRepository, params: FakeRequestParams) {
        const changes = repository.changes ?? []
        if (changes.some(entry => entry.kind === "conflicted")) {
            return refuse("CONFLICTS", "Committing is not possible because you have unmerged files.")
        }
        const isMerging = repository.status?.operationInProgress === "merge"
        const hasStaged = changes.some(entry => entry.kind === "staged")
        return !params.amend && !isMerging && !hasStaged ? refuse("NOTHING_TO_COMMIT", "nothing added to commit") : null
    }

    function moveHeadTo(repository: FakeGitRepository, sha: string) {
        const { status, refs } = repository
        if (!(status && refs)) {
            return
        }
        status.head = { ...status.head, commit: sha }
        refs.head = status.head
        for (const branch of refs.localBranches.filter(candidate => candidate.isCurrent)) {
            branch.commit = sha
        }
    }

    function commitChanges(repository: FakeGitRepository, params: FakeRequestParams) {
        const refusal = refusalToCommit(repository, params)
        if (refusal) {
            return refusal
        }
        const head = repository.status?.head.commit ?? null
        const replaced = params.amend ? repository.commits?.find(commit => commit.sha === head) : undefined
        const sha = nextId("commit").replace(/\D/g, "").padStart(40, "c")
        const parents = replaced ? replaced.parents : head ? [head] : []
        const authored = { authorName: "Mia Chen", authorEmail: "mia@example.com", authoredAt: 0, committedAt: 0 }
        const commit = { sha, parents, subject: params.subject ?? "", ...authored }
        repository.commits = [commit, ...(repository.commits ?? []).filter(candidate => candidate !== replaced)]
        repository.changes = (repository.changes ?? []).filter(entry => entry.kind !== "staged")
        countChanges(repository)
        moveHeadTo(repository, sha)
        return null
    }

    return {
        "git.stage": workingTreeWrite("git.stage", stageChanges),
        "git.unstage": workingTreeWrite("git.unstage", unstageChanges),
        "git.discard": workingTreeWrite("git.discard", discardChanges),
        "git.commit": write("git.commit", commitChanges)
    }
}
