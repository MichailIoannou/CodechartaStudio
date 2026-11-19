import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import type { GitRepositoryInfo } from "../../../model/coreApi/GitRepositoryInfo"
import type { GitStatus } from "../../../model/coreApi/GitStatus"

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

export function aRefs(overrides: Partial<GitRefs> = {}): GitRefs {
    return {
        fingerprint: "fingerprint-1",
        head: { kind: "branch", name: "main", commit: shaOf("a") },
        localBranches: [
            {
                refName: "refs/heads/main",
                name: "main",
                commit: shaOf("a"),
                isCurrent: true,
                upstream: null,
                checkedOutInOtherWorktree: null,
                lastCommit: { subject: "Fix invoice rounding", committedAt: 1_763_500_000 }
            }
        ],
        remoteBranches: [],
        tags: [],
        remotes: [],
        ...overrides
    }
}

export function anErrorPayload(code: ErrorCode, message = "Git said no.", details: ErrorPayload["details"] = {}): ErrorPayload {
    return { code, message, details }
}
