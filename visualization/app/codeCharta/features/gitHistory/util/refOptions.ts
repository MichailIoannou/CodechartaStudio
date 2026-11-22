import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitRefs } from "../../../model/coreApi/GitRefs"

/** Branches and tags list at most this many matches each; the commit search asks for no more either. */
const REF_GROUP_LIMIT = 50
export const RECENT_BRANCH_COUNT = 5
const SHORTEST_HASH_PREFIX = 4
const HASH_PREFIX = /^[0-9a-f]+$/i

type RefOptionKind = "branch" | "remoteBranch" | "tag" | "commit"

export interface RefOption {
    id: string
    kind: RefOptionKind
    /** What the input takes when the option is picked: the ref's name, or the full commit hash. */
    name: string
    sha: string
    subject: string | null
}

interface RefOptionGroup {
    id: "branches" | "tags" | "commits"
    label: string
    options: RefOption[]
}

/** What a typed or picked text names, when the refs or the found commits know it. */
export type RefResolution = Omit<RefOption, "id">

/** Without a query: the current, the default and the most recent branches, then tags; with one, the matches. */
export function refOptionGroups(refs: GitRefs, query: string, commits: readonly GitCommitSummary[], defaultBranch: string | null) {
    const needle = query.trim().toLowerCase()
    const branches = needle ? matchingBranches(refs, needle) : suggestedBranches(refs, defaultBranch)
    const tags = [...refs.tags]
        .sort((first, second) => second.createdAt - first.createdAt)
        .filter(tag => tag.name.toLowerCase().includes(needle))
        .slice(0, REF_GROUP_LIMIT)
        .map(tag => option("tag", tag.name, tag.commit, null))
    const groups: RefOptionGroup[] = [
        { id: "branches", label: "Branches", options: branches },
        { id: "tags", label: "Tags", options: tags },
        { id: "commits", label: "Commits", options: needle ? commits.map(commitOption) : [] }
    ]
    return groups.filter(group => group.options.length > 0)
}

/** A tag, a local branch, a remote branch of that name (git's order), else a found commit the hash starts. */
export function resolveRefText(refs: GitRefs, text: string, commits: readonly GitCommitSummary[]): RefResolution | null {
    const name = text.trim()
    const tag = refs.tags.find(candidate => candidate.name === name)
    const local = refs.localBranches.find(candidate => candidate.name === name)
    const remote = refs.remoteBranches.find(candidate => candidate.name === name)
    const named =
        (tag && option("tag", tag.name, tag.commit, null)) ??
        (local && localOption(local)) ??
        (remote && option("remoteBranch", remote.name, remote.commit, remote.lastCommit.subject))
    const commit = isHashPrefix(name) ? commits.find(candidate => candidate.sha.startsWith(name.toLowerCase())) : undefined
    const found = named ?? (commit && commitOption(commit))
    return found ? { kind: found.kind, name: found.name, sha: found.sha, subject: found.subject } : null
}

/** Commits whose hash starts with the query come first, then those whose subject matches. */
export function commitMatches(query: string, recent: readonly GitCommitSummary[], bySubject: readonly GitCommitSummary[]) {
    const prefix = query.trim().toLowerCase()
    const byHash = isHashPrefix(prefix) ? recent.filter(commit => commit.sha.startsWith(prefix)) : []
    const seen = new Set<string>()
    return [...byHash, ...bySubject].filter(commit => !seen.has(commit.sha) && seen.add(commit.sha)).slice(0, REF_GROUP_LIMIT)
}

function isHashPrefix(text: string): boolean {
    return text.length >= SHORTEST_HASH_PREFIX && HASH_PREFIX.test(text)
}

function suggestedBranches(refs: GitRefs, defaultBranch: string | null): RefOption[] {
    const current = refs.localBranches.find(branch => branch.isCurrent)
    const fallback = refs.localBranches.find(branch => branch.name === defaultBranch && branch !== current)
    const recent = refs.localBranches
        .filter(branch => branch !== current && branch !== fallback)
        .sort((first, second) => second.lastCommit.committedAt - first.lastCommit.committedAt)
        .slice(0, RECENT_BRANCH_COUNT)
    return [current, fallback, ...recent].filter(branch => branch !== undefined).map(localOption)
}

function matchingBranches(refs: GitRefs, needle: string): RefOption[] {
    const locals = refs.localBranches.filter(branch => branch.name.toLowerCase().includes(needle)).map(localOption)
    const remotes = refs.remoteBranches
        .filter(branch => branch.name.toLowerCase().includes(needle))
        .map(branch => option("remoteBranch", branch.name, branch.commit, branch.lastCommit.subject))
    return [...locals, ...remotes].slice(0, REF_GROUP_LIMIT)
}

function localOption(branch: GitLocalBranch): RefOption {
    return option("branch", branch.name, branch.commit, branch.lastCommit.subject)
}

function commitOption(commit: GitCommitSummary): RefOption {
    return option("commit", commit.sha, commit.sha, commit.subject)
}

function option(kind: RefOptionKind, name: string, sha: string, subject: string | null): RefOption {
    return { id: `${kind}:${name}`, kind, name, sha, subject }
}
