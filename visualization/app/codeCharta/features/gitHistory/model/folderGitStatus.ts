import type { GitStatus } from "../../../model/coreApi/GitStatus"

export interface GitProblem {
    problem: string
}

/** `undefined` while unknown. */
export type FolderGitStatus = GitStatus | GitProblem | undefined

export function isGitStatus(status: FolderGitStatus): status is GitStatus {
    return status !== undefined && !("problem" in status)
}
