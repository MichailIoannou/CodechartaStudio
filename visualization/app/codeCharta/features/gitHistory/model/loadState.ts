import type { GitError, GitResult } from "./gitError"

export type LoadState<Value> =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; value: Value }
    | { kind: "failed"; error: GitError }

export const IDLE: LoadState<never> = { kind: "idle" }
export const LOADING: LoadState<never> = { kind: "loading" }

export function loadStateOf<Value>(result: GitResult<Value>): LoadState<Value> {
    return "error" in result ? { kind: "failed", error: result.error } : { kind: "ready", value: result.value }
}

export function readyValueOf<Value>(state: LoadState<Value>): Value | null {
    return state.kind === "ready" ? state.value : null
}

export function failureOf(state: LoadState<unknown>): GitError | null {
    return state.kind === "failed" ? state.error : null
}
