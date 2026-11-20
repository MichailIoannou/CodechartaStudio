export type DiffLineKind = "header" | "hunk" | "added" | "removed" | "context" | "note"

export interface DiffLine {
    kind: DiffLineKind
    text: string
    /** Line number in the old file; null where the line is not in it or the diff does not say. */
    oldNumber: number | null
    newNumber: number | null
}

/** Design H13 / plan 4.7: the colour of each kind of diff line. */
export const DIFF_LINE_CLASSES: Record<DiffLineKind, string> = {
    header: "text-base-content/60",
    hunk: "text-info",
    added: "bg-success/10 text-success",
    removed: "bg-error/10 text-error",
    context: "",
    note: "text-base-content/60"
}

const FILE_HEADER = /^diff (--git|--cc|--combined) /
/** `@@ -12,3 +12,4 @@` or, for a conflicted file, `@@@ -1,2 -1,2 +1,3 @@@`. */
const HUNK_HEADER = /^(@{2,}) ((?:-\d+(?:,\d+)? )+)\+(\d+)/
const NO_NEWLINE_NOTE = "\\"

interface ParserState {
    /** Inside a hunk; null in a file header. */
    prefixWidth: number | null
    oldNumber: number | null
    newNumber: number
}

/** Splits git's unified diff into lines that know their kind and line numbers; the text is kept verbatim. */
export function diffLinesOf(text: string): DiffLine[] {
    const rawLines = text.split("\n")
    if (rawLines.at(-1) === "") {
        rawLines.pop()
    }
    const state: ParserState = { prefixWidth: null, oldNumber: null, newNumber: 0 }
    return rawLines.map(line => classify(line, state))
}

function classify(line: string, state: ParserState): DiffLine {
    if (FILE_HEADER.test(line)) {
        state.prefixWidth = null
        return unnumbered("header", line)
    }
    const hunk = HUNK_HEADER.exec(line)
    if (hunk) {
        return startHunk(line, hunk, state)
    }
    if (state.prefixWidth === null) {
        return unnumbered("header", line)
    }
    return line.startsWith(NO_NEWLINE_NOTE) ? unnumbered("note", line) : numberedLine(line, state)
}

function startHunk(line: string, hunk: RegExpExecArray, state: ParserState): DiffLine {
    const [, atSigns, oldRanges, newStart] = hunk
    const parentCount = atSigns.length - 1
    state.prefixWidth = parentCount
    state.oldNumber = parentCount === 1 ? Number(oldRanges.slice(1).split(",")[0]) : null
    state.newNumber = Number(newStart)
    return unnumbered("hunk", line)
}

function numberedLine(line: string, state: ParserState): DiffLine {
    const prefix = line.slice(0, state.prefixWidth ?? 1)
    const kind: DiffLineKind = prefix.includes("+") ? "added" : prefix.includes("-") ? "removed" : "context"
    const oldNumber = kind === "added" ? null : state.oldNumber
    const newNumber = kind === "removed" ? null : state.newNumber
    if (kind !== "added" && state.oldNumber !== null) {
        state.oldNumber += 1
    }
    if (kind !== "removed") {
        state.newNumber += 1
    }
    return { kind, text: line, oldNumber, newNumber }
}

function unnumbered(kind: DiffLineKind, text: string): DiffLine {
    return { kind, text, oldNumber: null, newNumber: null }
}
