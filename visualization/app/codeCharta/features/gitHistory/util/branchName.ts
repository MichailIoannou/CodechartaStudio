const FORBIDDEN_PARTS = [" ", "..", "~", "^", ":", "?", "*", "[", "\\", "@{"]

export interface BranchNameCheck {
    isValid: boolean
    /** Design H14's rule message; null for a valid or an empty name. */
    message: string | null
}

/**
 * The rules design H14 words while the name is typed. Git checks the rest (control characters, `.lock`, a part
 * starting with `.`) and the core refuses those names with git's own message.
 */
export function checkBranchName(name: string, takenNames: readonly string[]): BranchNameCheck {
    if (name === "") {
        return { isValid: false, message: null }
    }
    const message = ruleMessageOf(name, takenNames)
    return { isValid: message === null, message }
}

function ruleMessageOf(name: string, takenNames: readonly string[]): string | null {
    if (name.startsWith("-")) {
        return "A branch name cannot start with '-'."
    }
    if (FORBIDDEN_PARTS.some(part => name.includes(part))) {
        return "A branch name cannot contain spaces, '..', '~', '^', ':', '?', '*', '[', '\\' or '@{'."
    }
    return takenNames.includes(name) ? `A branch named '${name}' already exists.` : null
}
