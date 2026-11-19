import { counted } from "../../../util/wording"

/** A confirmation as design H15 words it; `verb` marks a destructive one (Cancel + verb), else it is No / Yes. */
export interface GitConfirmation {
    title: string
    text: string
    verb: string | null
}

export interface SwitchEffect {
    folderLabel: string
    /** The current branch in quotes, or a short SHA when HEAD is detached. */
    from: string
    to: string
    changedFiles: number
}

export interface UnmergedEffect {
    branch: string
    into: string
    /** Null when git could not count them. */
    commits: number | null
}

export const HOOKS_NOTICE: GitConfirmation = {
    title: "Git Hooks",
    text: "Git runs this repository's hooks and filters, as it would in a terminal. Continue?",
    verb: null
}

export function quoted(name: string): string {
    return `'${name}'`
}

export function switchConfirmation({ folderLabel, from, to, changedFiles }: SwitchEffect): GitConfirmation {
    const verb = changedFiles === 1 ? "stays" : "stay"
    return {
        title: "Switch Branch",
        text:
            `Switch '${folderLabel}' from ${from} to '${to}'? Your ${counted(changedFiles, "changed file")} ${verb} as they are if git can ` +
            "carry them over; otherwise git refuses and nothing changes.",
        verb: null
    }
}

/** `keptBy` is the branch git checks the commits against: the upstream, else the current branch. */
export function deleteLocalConfirmation(branch: string, keptBy: string | null): GitConfirmation {
    const fate = keptBy ? `Its commits stay reachable from '${keptBy}'.` : "Its commits are not on any other branch and become unreachable."
    return { title: "Delete Branch", text: `Delete the local branch '${branch}'? ${fate}`, verb: "Delete" }
}

export function deleteUnmergedConfirmation({ branch, into, commits }: UnmergedEffect): GitConfirmation {
    const what = commits === null ? "commits" : counted(commits, "commit")
    return {
        title: "Delete Unmerged Branch",
        text: `'${branch}' has ${what} not merged into '${into}'. Deleting it anyway makes them unreachable (recoverable only through git reflog).`,
        verb: "Delete anyway"
    }
}

export function deleteRemoteConfirmation(branchName: string, remote: string): GitConfirmation {
    return {
        title: "Delete Remote Branch",
        text: `Delete '${branchName}' on remote '${remote}'? This removes it for everyone who uses that remote.`,
        verb: "Delete from remote"
    }
}

export function renameEffect(oldName: string, newName: string): string {
    return `Renames the local branch '${oldName}' to '${newName}'. Its upstream setting is kept; the remote branch is not renamed.`
}

export function fetchResult(updatedRefs: number): string {
    return updatedRefs === 0 ? "Already up to date" : `Fetched ${counted(updatedRefs, "updated ref")}`
}

export interface AmendedCommit {
    shortSha: string
    subject: string
    upstream: string
}

/** Design H15: amending a commit the upstream already has rewrites shared history. */
export function amendPushedConfirmation({ shortSha, subject, upstream }: AmendedCommit): GitConfirmation {
    return {
        title: "Amend Pushed Commit",
        text: `The last commit ${shortSha} '${subject}' is already on ${upstream}. Amending it rewrites it; pushing afterwards needs a force push.`,
        verb: "Amend anyway"
    }
}

export function commitResult(shortSha: string): string {
    return `Committed ${shortSha}`
}

const MAX_NAMED_FILES = 10

/** Design H15: names at most ten files, the rest as "and n more". */
export function discardConfirmation(paths: readonly string[]): GitConfirmation {
    return {
        title: "Discard Changes",
        text: `Discard changes to ${namedFiles(paths)}? Tracked files return to the last commit; untracked files go to the recycle bin.`,
        verb: "Discard"
    }
}

function namedFiles(paths: readonly string[]): string {
    const named = paths.slice(0, MAX_NAMED_FILES).map(quoted)
    const rest = paths.length - named.length
    const parts = rest > 0 ? [...named, `${rest} more`] : named
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}
