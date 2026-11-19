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

/** What the failed action was about; a sentence that needs a part it lacks falls back to "Git failed: …". */
export interface GitErrorContext {
    /** Names the operation where design H12 words its failure apart from the general sentence. */
    operation?: "commit"
    branch?: string
    worktreePath?: string | null
    remote?: string | null
}

const MAX_LISTED_FILES = 10
/** Design H6: the user runs these; CodeCharta never changes the git config. */
const IDENTITY_COMMANDS = ['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"']
const LISTED_FILE = /^\s+(\S.*)$/

export function gitErrorSentence(error: GitError, context: GitErrorContext = {}): string {
    return contextSentenceOf(error, context) ?? plainSentenceOf(error)
}

function plainSentenceOf(error: GitError): string {
    switch (error.code) {
        case "INDEX_LOCKED":
            return "Another git process is using this repository. Wait for it to finish, then retry."
        case "TIMEOUT":
            return "Git did not answer in time."
        case "AUTHENTICATION_CANCELLED":
            return "Sign-in cancelled. Nothing was changed."
        case "LOCAL_CHANGES_WOULD_BE_OVERWRITTEN":
            return localChangesSentence(error.detail)
        case "CHANGED_SINCE_LISTED":
            return "The files changed since they were listed. The list is refreshed — check it and try again."
        case "IDENTITY_UNKNOWN":
            return ["Git does not know who you are. Run these in a terminal, then commit again:", ...IDENTITY_COMMANDS].join("\n")
        case "NOTHING_TO_COMMIT":
            return "Nothing to commit. Stage files first."
        case "HOOK_FAILED":
            return "A git hook stopped the operation."
        default:
            return `Git failed: ${error.message}`
    }
}

function contextSentenceOf(error: GitError, { operation, branch, worktreePath, remote }: GitErrorContext): string | null {
    switch (error.code) {
        case "HOOK_FAILED":
            return operation === "commit" ? "A git hook stopped the commit." : null
        case "BRANCH_CHECKED_OUT_ELSEWHERE":
            return branch && worktreePath ? `'${branch}' is checked out in another worktree (${worktreePath}).` : null
        case "BRANCH_EXISTS":
            return branch ? `A branch named '${branch}' already exists.` : null
        case "AUTHENTICATION_REQUIRED":
            return remote
                ? `Git could not sign in to '${remote}'. Check your credential helper or ssh key; CodeCharta asks only when git asks.`
                : null
        case "NETWORK_UNAVAILABLE":
            return remote ? `'${remote}' could not be reached. Check your connection.` : null
        default:
            return null
    }
}

/** git lists the files it would overwrite indented, one per line. */
function localChangesSentence(detail: string | null): string {
    const files = (detail ?? "").split("\n").flatMap(line => LISTED_FILE.exec(line)?.[1] ?? [])
    const listed = files.slice(0, MAX_LISTED_FILES)
    const more = files.length > MAX_LISTED_FILES ? [`and ${files.length - MAX_LISTED_FILES} more`] : []
    return ["Git did not switch: your changes to these files would be overwritten:", ...listed, ...more].join("\n")
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
