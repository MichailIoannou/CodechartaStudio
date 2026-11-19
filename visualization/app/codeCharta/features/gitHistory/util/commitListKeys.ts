export type MoveTarget = "previous" | "next" | "first" | "last" | "pageUp" | "pageDown"

/** What a key does in the commit list (design H8 "Keyboard"); F5 is left to the History panel. */
export type CommitListCommand =
    | { kind: "move"; target: MoveTarget; isExtending: boolean }
    | { kind: "copySha" }
    | { kind: "focusSearch" }
    | { kind: "dropSecond" }
    | { kind: "runPrimary" }
    | { kind: "openMenu" }

const MOVE_KEYS: Readonly<Record<string, MoveTarget>> = {
    ArrowUp: "previous",
    ArrowDown: "next",
    Home: "first",
    End: "last",
    PageUp: "pageUp",
    PageDown: "pageDown"
}
const EXTENDING_MOVES: ReadonlySet<MoveTarget> = new Set(["previous", "next"])

export function commitListCommandOf(event: KeyboardEvent): CommitListCommand | null {
    const isCommand = event.ctrlKey || event.metaKey
    const target = MOVE_KEYS[event.key]
    if (target && !isCommand && !event.altKey) {
        return { kind: "move", target, isExtending: event.shiftKey && EXTENDING_MOVES.has(target) }
    }
    if (isCommand) {
        return commandWithModifier(event.key.toLowerCase())
    }
    return plainCommandOf(event)
}

function commandWithModifier(key: string): CommitListCommand | null {
    if (key === "c") {
        return { kind: "copySha" }
    }
    return key === "f" ? { kind: "focusSearch" } : null
}

function plainCommandOf(event: KeyboardEvent): CommitListCommand | null {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        return { kind: "openMenu" }
    }
    if (event.altKey || event.shiftKey) {
        return null
    }
    switch (event.key) {
        case "/":
            return { kind: "focusSearch" }
        case "Escape":
            return { kind: "dropSecond" }
        case "Enter":
            return { kind: "runPrimary" }
        default:
            return null
    }
}

/** The row a move lands on; with nothing focused yet, every move starts at the first row. */
export function rowIndexAfter(target: MoveTarget, current: number | null, rowCount: number, pageSize: number): number {
    const lastIndex = rowCount - 1
    if (current === null) {
        return target === "last" ? lastIndex : 0
    }
    const steps: Record<MoveTarget, number> = {
        previous: current - 1,
        next: current + 1,
        first: 0,
        last: lastIndex,
        pageUp: current - pageSize,
        pageDown: current + pageSize
    }
    return Math.max(0, Math.min(lastIndex, steps[target]))
}
