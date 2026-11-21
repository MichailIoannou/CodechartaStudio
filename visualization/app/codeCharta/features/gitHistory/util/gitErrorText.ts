import type { OperationInProgress } from "../../../model/coreApi/OperationInProgress"
import { counted } from "../../../util/wording"
import type { GitError } from "../model/gitError"
import { OPERATION_NAMES } from "./operationNames"

type ProblemAction = "openDesktopTools" | "relinkFolder" | "workInFolder" | "chooseWorkingFolder"

/** Another git folder of the project that could become the working folder. */
export interface GitFolderChoice {
    id: string
    label: string
}

/** A problem of the whole repository: it replaces the panes, since nothing in them could be read. */
export interface GitProblemNotice {
    text: string
    /** A command the user may run in a terminal; CodeCharta never runs it. */
    command: string | null
    action: ProblemAction | null
    /** The folder "Work in '<label>'" switches to, for the action `workInFolder`. */
    workInFolder?: GitFolderChoice
}

export interface ProblemFolder {
    label: string
    path: string
}

const TOO_OLD_VERSION = /^git (\S+) is older/

export function problemNoticeOf(
    error: GitError,
    folder: ProblemFolder,
    otherGitFolders: readonly GitFolderChoice[] = []
): GitProblemNotice | null {
    switch (error.code) {
        case "TOOL_NOT_FOUND":
            return notice("Git was not found. CodeCharta uses the git installed on this computer.", "openDesktopTools")
        case "GIT_TOO_OLD":
            return notice(tooOldText(error.message), "openDesktopTools")
        case "NOT_A_REPOSITORY":
            return notARepositoryNotice(folder, otherGitFolders)
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
    operation?: "commit" | "pull" | "merge" | "stashPop"
    /** How many files git stopped on, for conflicts after a pull, merge or stash pop. */
    conflictedFiles?: number
    /** What the repository is in the middle of, for `OPERATION_IN_PROGRESS`. */
    inProgress?: OperationInProgress | null
    branch?: string
    worktreePath?: string | null
    remote?: string | null
}

const MAX_LISTED_FILES = 10
/** Design H6: the user runs these; CodeCharta never changes the git config. */
const IDENTITY_COMMANDS = ['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"']
const LISTED_FILE = /^\s+(\S.*)$/

/** Commands the user must run to fix the failure, shown as copy blocks next to its sentence. */
export function gitErrorCommands(error: GitError): string[] {
    return error.code === "IDENTITY_UNKNOWN" ? [...IDENTITY_COMMANDS] : []
}

/** The one follow-up action design H6 offers in the toast of a failure. */
export interface GitFollowUp {
    kind: "pull" | "fetch" | "publish"
    label: string
}

const FOLLOW_UPS: Partial<Record<GitError["code"], GitFollowUp>> = {
    PUSH_REJECTED: { kind: "pull", label: "Pull" },
    STALE_PUSH_LEASE: { kind: "fetch", label: "Fetch" },
    NO_UPSTREAM: { kind: "publish", label: "Publish branch" }
}

export function gitErrorFollowUp(error: GitError): GitFollowUp | null {
    return FOLLOW_UPS[error.code] ?? null
}

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
            return "Git does not know who you are. Run these in a terminal, then commit again:"
        case "NOTHING_TO_COMMIT":
            return "Nothing to commit. Stage files first."
        case "HOOK_FAILED":
            return "A git hook stopped the operation."
        case "PUSH_REJECTED":
            return "The remote has commits you do not have. Pull first, then push."
        case "STALE_PUSH_LEASE":
            return "The remote branch moved since you last fetched. Fetch, review, and try again."
        default:
            return `Git failed: ${error.message}`
    }
}

type ContextSentence = (context: GitErrorContext) => string | null

const CONTEXT_SENTENCES: Partial<Record<GitError["code"], ContextSentence>> = {
    HOOK_FAILED: ({ operation }) => (operation === "commit" ? "A git hook stopped the commit." : null),
    CONFLICTS: conflictsSentence,
    OPERATION_IN_PROGRESS: ({ inProgress }) =>
        inProgress ? `A ${OPERATION_NAMES[inProgress]} is in progress. Finish or abort it first.` : null,
    BRANCH_CHECKED_OUT_ELSEWHERE: ({ branch, worktreePath }) =>
        branch && worktreePath ? `'${branch}' is checked out in another worktree (${worktreePath}).` : null,
    BRANCH_EXISTS: ({ branch }) => (branch ? `A branch named '${branch}' already exists.` : null),
    NO_UPSTREAM: ({ branch }) => (branch ? `'${branch}' has no upstream branch.` : null),
    AUTHENTICATION_REQUIRED: ({ remote }) =>
        remote
            ? `Git could not sign in to '${remote}'. Check your credential helper or ssh key; CodeCharta asks only when git asks.`
            : null,
    NETWORK_UNAVAILABLE: ({ remote }) => (remote ? `'${remote}' could not be reached. Check your connection.` : null)
}

function contextSentenceOf(error: GitError, context: GitErrorContext): string | null {
    return CONTEXT_SENTENCES[error.code]?.(context) ?? null
}

function conflictsSentence({ operation, conflictedFiles }: GitErrorContext): string | null {
    if (operation === "commit") {
        return "Git did not commit: some files still have conflicts. Resolve them in your editor, stage them, then commit."
    }
    if (!operation || conflictedFiles === undefined) {
        return null
    }
    const sentence = `Git stopped on conflicts in ${counted(conflictedFiles, "file")}. The notice above the list says how to finish or abort.`
    return operation === "stashPop" ? `${sentence} The stash was kept.` : sentence
}

/** git lists the files it would overwrite indented, one per line. */
function localChangesSentence(detail: string | null): string {
    const files = (detail ?? "").split("\n").flatMap(line => LISTED_FILE.exec(line)?.[1] ?? [])
    const listed = files.slice(0, MAX_LISTED_FILES)
    const more = files.length > MAX_LISTED_FILES ? [`and ${files.length - MAX_LISTED_FILES} more`] : []
    return ["Git did not switch: your changes to these files would be overwritten:", ...listed, ...more].join("\n")
}

function notARepositoryNotice(folder: ProblemFolder, otherGitFolders: readonly GitFolderChoice[]): GitProblemNotice {
    const text = `'${folder.label}' is not a git repository.`
    if (otherGitFolders.length === 1) {
        return { ...notice(text, "workInFolder"), workInFolder: otherGitFolders[0] }
    }
    return notice(text, otherGitFolders.length > 1 ? "chooseWorkingFolder" : null)
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
