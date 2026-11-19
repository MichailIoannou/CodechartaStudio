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
