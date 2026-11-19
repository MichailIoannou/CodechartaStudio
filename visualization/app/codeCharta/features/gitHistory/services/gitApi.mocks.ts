import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import type { GitRemoteBranch } from "../../../model/coreApi/GitRemoteBranch"
import type { GitRepositoryInfo } from "../../../model/coreApi/GitRepositoryInfo"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { GitTag } from "../../../model/coreApi/GitTag"
import type { GitUpstream } from "../../../model/coreApi/GitUpstream"

const LAST_COMMIT = { subject: "Fix invoice rounding", committedAt: 1_763_500_000 }

function shaOf(seed: string): string {
    return seed.repeat(40).slice(0, 40)
}

export function aRepositoryInfo(overrides: Partial<GitRepositoryInfo> = {}): GitRepositoryInfo {
    return {
        repositoryId: "/work/billing-api/.git",
        rootPath: "/work/billing-api",
        folderPrefix: "",
        isShallow: false,
        isLinkedWorktree: false,
        gitVersion: "2.56.0",
        ...overrides
    }
}

export function aStatusOn(branch: string, overrides: Partial<GitStatus> = {}): GitStatus {
    return {
        head: { kind: "branch", name: branch, commit: shaOf("a") },
        upstream: null,
        counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
        operationInProgress: null,
        ...overrides
    }
}

export function anUpstream(name: string, overrides: Partial<GitUpstream> = {}): GitUpstream {
    return { refName: `refs/remotes/${name}`, name, ahead: 0, behind: 0, isGone: false, ...overrides }
}

export function aLocalBranch(name: string, overrides: Partial<GitLocalBranch> = {}): GitLocalBranch {
    return {
        refName: `refs/heads/${name}`,
        name,
        commit: shaOf("b"),
        isCurrent: false,
        upstream: null,
        checkedOutInOtherWorktree: null,
        lastCommit: LAST_COMMIT,
        ...overrides
    }
}

export function aRemoteBranch(remote: string, branchName: string): GitRemoteBranch {
    return {
        refName: `refs/remotes/${remote}/${branchName}`,
        remote,
        name: `${remote}/${branchName}`,
        branchName,
        commit: shaOf("c"),
        lastCommit: LAST_COMMIT
    }
}

export function aTag(name: string): GitTag {
    return { refName: `refs/tags/${name}`, name, commit: shaOf("d"), isAnnotated: true, createdAt: LAST_COMMIT.committedAt }
}

export function aRefs(overrides: Partial<GitRefs> = {}): GitRefs {
    return {
        fingerprint: "fingerprint-1",
        head: { kind: "branch", name: "main", commit: shaOf("a") },
        localBranches: [aLocalBranch("main", { isCurrent: true, commit: shaOf("a") })],
        remoteBranches: [],
        tags: [],
        remotes: [],
        ...overrides
    }
}

export function anErrorPayload(code: ErrorCode, message = "Git said no.", details: ErrorPayload["details"] = {}): ErrorPayload {
    return { code, message, details }
}
