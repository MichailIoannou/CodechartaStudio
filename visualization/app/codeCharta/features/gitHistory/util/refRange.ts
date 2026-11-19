const MERGE_BASE_SEPARATOR = "..."
const TIP_SEPARATOR = ".."

export interface RefRange {
    base: string
    head: string
    /** Three dots compare from the merge base, two dots tip with tip. */
    isMergeBase: boolean
}

/** `a..b` or `a...b`, as git writes a range; null for anything else. */
export function parseRefRange(text: string): RefRange | null {
    const trimmed = text.trim()
    const separator = trimmed.includes(MERGE_BASE_SEPARATOR) ? MERGE_BASE_SEPARATOR : TIP_SEPARATOR
    const [base, head, ...rest] = trimmed.split(separator)
    if (rest.length > 0 || !base || !head) {
        return null
    }
    return { base, head, isMergeBase: separator === MERGE_BASE_SEPARATOR }
}
