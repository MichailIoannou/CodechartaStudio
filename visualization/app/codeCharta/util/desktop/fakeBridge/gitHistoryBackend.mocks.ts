import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { FakeBackend, FakeBridgeKit, FakeGitRepository, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeGitHistoryBackend(kit: FakeBridgeKit): FakeBackend {
    const LOG_PAGE_SIZE = 500
    const { answer, reachableCommits, workingTreeOf } = kit.git

    function scopedCommits(repository: FakeGitRepository, scope: FakeRequestParams["scope"]) {
        const commits = repository.commits ?? []
        if (!scope || scope.kind !== "refs") {
            return commits
        }
        const refs = repository.refs
        const tips = [...(refs?.localBranches ?? []), ...(refs?.remoteBranches ?? []), ...(refs?.tags ?? [])]
            .filter(ref => scope.refNames.includes(ref.refName))
            .map(ref => ref.commit)
        return reachableCommits(commits, tips)
    }

    function contains(text: string, part: string | null | undefined) {
        return !part || text.toLowerCase().includes(part.toLowerCase())
    }

    function touchesPath(repository: FakeGitRepository, commit: GitCommitSummary, path: string | null | undefined) {
        const files = repository.details?.[commit.sha]?.files ?? []
        return !path || files.some(file => file.path === path || file.path.startsWith(`${path}/`))
    }

    function matchesLogFilter(repository: FakeGitRepository, commit: GitCommitSummary, filter: FakeRequestParams["filter"]) {
        return (
            contains(`${commit.subject} ${commit.sha}`, filter?.text) &&
            contains(`${commit.authorName} ${commit.authorEmail}`, filter?.author) &&
            touchesPath(repository, commit, filter?.path)
        )
    }

    function gitLogPage(repository: FakeGitRepository, params: FakeRequestParams) {
        if (!repository.commits) {
            return undefined
        }
        const offset = params.cursor ? Number(params.cursor.replace("page-", "")) : 0
        if (Number.isNaN(offset)) {
            return { code: "LOG_SESSION_EXPIRED", message: "The fake desktop bridge has no such log session.", details: {} }
        }
        const filter = params.filter
        const isFiltered = Boolean(filter?.text || filter?.author || filter?.path)
        const matching = scopedCommits(repository, params.scope).filter(commit => matchesLogFilter(repository, commit, filter))
        const commits = matching.slice(offset, offset + LOG_PAGE_SIZE)
        const nextCursor = offset + LOG_PAGE_SIZE < matching.length ? `page-${offset + LOG_PAGE_SIZE}` : null
        return { commits, nextCursor, isGraphAvailable: !isFiltered }
    }

    function gitCommitDetails(repository: FakeGitRepository, params: FakeRequestParams) {
        const sha = params.sha ?? ""
        const summary = repository.commits?.find(commit => commit.sha === sha)
        if (repository.details?.[sha]) {
            return repository.details[sha]
        }
        if (!summary) {
            return { code: "UNKNOWN_REVISION", message: `The fake desktop bridge has no commit ${sha}.`, details: {} }
        }
        const noChanges = { files: [], areFilesTruncated: false, totals: { filesChanged: 0, insertions: 0, deletions: 0 } }
        const committer = { committerName: summary.authorName, committerEmail: summary.authorEmail }
        return { ...summary, ...committer, ...noChanges, message: summary.subject, comparedToParent: summary.parents[0] ?? null }
    }

    function reachedShas(commits: GitCommitSummary[], tip: string) {
        return new Set(reachableCommits(commits, [tip]).map(commit => commit.sha))
    }

    function gitDistances(repository: FakeGitRepository, params: FakeRequestParams) {
        const commits = repository.commits ?? []
        const known = new Set(commits.map(commit => commit.sha))
        const reachedFromTarget = reachedShas(commits, String(params.target ?? ""))
        const distances = (params.candidates ?? [])
            .filter(candidate => known.has(candidate))
            .map(candidate => {
                const reachedFromCandidate = reachedShas(commits, candidate)
                const onlyInTarget = [...reachedFromTarget].filter(sha => !reachedFromCandidate.has(sha)).length
                const onlyInCandidate = [...reachedFromCandidate].filter(sha => !reachedFromTarget.has(sha)).length
                return { sha: candidate, onlyInCandidate, onlyInTarget }
            })
        return { distances }
    }

    function resolveRevision(repository: FakeGitRepository, params: FakeRequestParams) {
        const found = repository.commits?.find(commit => commit.sha === params.revision)
        return found ?? { code: "UNKNOWN_REVISION", message: `The fake desktop bridge has no commit ${params.revision}.`, details: {} }
    }

    function isAncestor(repository: FakeGitRepository, params: FakeRequestParams) {
        const reached = reachableCommits(repository.commits ?? [], [params.descendant ?? ""])
        return reached.some(commit => commit.sha === params.ancestor)
    }

    function infoOf(repository: FakeGitRepository) {
        return repository.info
    }

    function statusOf(repository: FakeGitRepository) {
        return repository.status
    }

    function refsOf(repository: FakeGitRepository) {
        return repository.refs
    }

    function fingerprintOf(repository: FakeGitRepository) {
        return repository.refs?.fingerprint
    }

    function workingTreeIfRepository(repository: FakeGitRepository) {
        return repository.status ? workingTreeOf(repository) : undefined
    }

    function diffOf(repository: FakeGitRepository, params: FakeRequestParams) {
        const kind = params.kind ?? "unstaged"
        const path = params.path ?? ""
        const isListed = (repository.changes ?? []).some(entry => entry.path === path && entry.kind === kind)
        if (!isListed) {
            return { code: "NOT_FOUND", message: `The fake desktop bridge lists no ${kind} ${path}.`, details: {} }
        }
        return repository.diffs?.[`${kind}:${path}`] ?? { path, text: "", isBinary: false, isTruncated: false }
    }

    return {
        "git.repositoryInfo": answer("git.repositoryInfo", infoOf),
        "git.status": answer("git.status", statusOf),
        "git.branches": answer("git.branches", refsOf),
        "git.refsFingerprint": answer("git.refsFingerprint", fingerprintOf),
        "git.log": answer("git.log", gitLogPage),
        "git.commitDetails": answer("git.commitDetails", gitCommitDetails),
        "git.measureDistances": answer("git.measureDistances", gitDistances),
        "git.resolveCommit": answer("git.resolveCommit", resolveRevision),
        "git.workingTree": answer("git.workingTree", workingTreeIfRepository),
        "git.diffFile": answer("git.diffFile", diffOf),
        "git.isAncestor": answer("git.isAncestor", isAncestor)
    }
}
