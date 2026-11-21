import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
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
export function fakeGitBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, seed } = kit
    store.git = JSON.parse(JSON.stringify(seed.git ?? {}))
    for (const [folderId, status] of Object.entries(seed.gitStatuses ?? {})) {
        store.git[folderId] = { ...store.git[folderId], status }
    }
    for (const [folderId, commits] of Object.entries(seed.gitLogs ?? {})) {
        store.git[folderId] = { ...store.git[folderId], commits }
    }

    function repositoryOf(params: FakeRequestParams) {
        const folderId = params.repo?.folderId ?? ""
        return Object.hasOwn(store.git, folderId) ? store.git[folderId] : undefined
    }

    function answerOf(value: unknown, folderId: string): FakeAnswer {
        if (value && typeof value === "object" && "code" in value) {
            return { ok: false, error: value as ErrorPayload }
        }
        return value === undefined
            ? refuse("NOT_A_REPOSITORY", `The fake desktop bridge has no repository for ${folderId}.`)
            : succeed(JSON.parse(JSON.stringify(value)))
    }

    function gitAnswer(method: FakeGitMethod, read: (repository: FakeGitRepository, params: FakeRequestParams) => unknown) {
        return (params: FakeRequestParams): FakeAnswer => {
            const repository = repositoryOf(params)
            const failure = repository?.failures?.[method]
            if (failure) {
                return { ok: false, error: failure }
            }
            return answerOf(repository ? read(repository, params) : undefined, params.repo?.folderId ?? "")
        }
    }

    function announceChange(params: FakeRequestParams) {
        const repository = repositoryOf(params)
        if (params.repo && repository?.refs) {
            const parts = ["status", "refs", "workingTree"]
            const change = { repo: params.repo, repositoryId: repository.info?.repositoryId ?? "", parts }
            const fingerprint = repository.refs.fingerprint
            Promise.resolve().then(() => kit.emit("repository.changed", { ...change, fingerprint }))
        }
    }

    function gitWrite(method: FakeGitMethod, change: FakeGitChange) {
        const read = gitAnswer(method, (repository, params) => {
            if (!repository.refs || !repository.status) {
                return undefined
            }
            const refusal = change(repository, params)
            if (refusal && "error" in refusal) {
                return refusal.error
            }
            repository.refs.fingerprint = `${repository.refs.fingerprint}+`
            return { status: repository.status, refs: repository.refs, message: null }
        })
        return (params: FakeRequestParams): FakeAnswer => {
            const answer = read(params)
            announceChange(params)
            return answer
        }
    }

    function countChanges(repository: FakeGitRepository) {
        const entries = repository.changes ?? []
        const countOf = (kind: GitEntryKind) => entries.filter(entry => entry.kind === kind).length
        if (repository.status) {
            const counts = { staged: countOf("staged"), unstaged: countOf("unstaged"), untracked: countOf("untracked") }
            repository.status.counts = { ...counts, conflicted: countOf("conflicted") }
        }
    }

    function workingTreeOf(repository: FakeGitRepository) {
        const entries = repository.changes ?? []
        return { status: repository.status, entries, areEntriesTruncated: repository.areChangesTruncated ?? false }
    }

    function reachableCommits(commits: GitCommitSummary[], tips: string[]) {
        const parentsBySha = new Map(commits.map(commit => [commit.sha, commit.parents]))
        const reached = new Set<string>()
        const waiting = [...tips]
        while (waiting.length > 0) {
            const sha = waiting.pop() as string
            if (!reached.has(sha) && parentsBySha.has(sha)) {
                reached.add(sha)
                waiting.push(...(parentsBySha.get(sha) ?? []))
            }
        }
        return commits.filter(commit => reached.has(commit.sha))
    }

    for (const repository of Object.values(store.git).filter(candidate => candidate.changes)) {
        countChanges(repository)
    }

    kit.git = { answer: gitAnswer, write: gitWrite, announceChange, countChanges, workingTreeOf, reachableCommits }

    return {}
}
