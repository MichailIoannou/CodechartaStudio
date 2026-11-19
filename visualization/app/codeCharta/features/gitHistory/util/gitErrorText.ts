import type { GitError } from "../model/gitError"

type ProblemAction = "openDesktopTools" | "relinkFolder"

/** A problem of the whole repository: it replaces the panes, since nothing in them could be read. */
export interface GitProblemNotice {
    text: string
    /** A command the user may run in a terminal; CodeCharta never runs it. */
    command: string | null
    action: ProblemAction | null
}

export interface ProblemFolder {
    label: string
    path: string
}

const TOO_OLD_VERSION = /^git (\S+) is older/

export function problemNoticeOf(error: GitError, folder: ProblemFolder): GitProblemNotice | null {
    switch (error.code) {
        case "TOOL_NOT_FOUND":
            return notice("Git was not found. CodeCharta uses the git installed on this computer.", "openDesktopTools")
        case "GIT_TOO_OLD":
            return notice(tooOldText(error.message), "openDesktopTools")
        case "NOT_A_REPOSITORY":
            return notice(`'${folder.label}' is not a git repository.`)
        case "NOT_FOUND":
        case "FOLDER_UNAVAILABLE":
            return notice(`'${folder.label}' was not found on disk.`, "relinkFolder")
        case "DUBIOUS_OWNERSHIP":
            return dubiousOwnershipNotice(error.repositoryPath ?? folder.path)
        case "BARE_REPOSITORY":
            return notice("Bare repositories are not supported.")
        default:
            return null
    }
}

export function gitErrorSentence(error: GitError): string {
    switch (error.code) {
        case "INDEX_LOCKED":
            return "Another git process is using this repository. Wait for it to finish, then retry."
        case "TIMEOUT":
            return "Git did not answer in time."
        default:
            return `Git failed: ${error.message}`
    }
}

function notice(text: string, action: ProblemAction | null = null): GitProblemNotice {
    return { text, command: null, action }
}

/** The core names the version only in its message ("git 2.30.9 is older than the minimum 2.31.0."). */
function tooOldText(message: string): string {
    const version = TOO_OLD_VERSION.exec(message)?.[1]
    return version ? `Git ${version} is too old. CodeCharta needs git 2.31 or newer.` : message
}

function dubiousOwnershipNotice(path: string): GitProblemNotice {
    return {
        text: `Git does not trust '${path}' because another user owns it. If you trust it, run this in a terminal:`,
        command: `git config --global --add safe.directory ${path}`,
        action: null
    }
}
