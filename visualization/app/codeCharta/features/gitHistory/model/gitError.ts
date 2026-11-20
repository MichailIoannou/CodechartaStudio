import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"

export interface GitError {
    code: ErrorCode
    message: string
    /** Git's own text, shown verbatim. */
    detail: string | null
    /** Only for `DUBIOUS_OWNERSHIP`: the folder to name in the safe-directory command. */
    repositoryPath: string | null
}

export type GitResult<Value> = { ok: true; value: Value } | { ok: false; error: GitError }

export function gitErrorOf({ code, message, details }: ErrorPayload): GitError {
    return { code, message, detail: textOf(details.detail), repositoryPath: textOf(details.repositoryPath) }
}

export function gitErrorFromThrown(thrown: unknown): GitError {
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    return { code: "COMMAND_FAILED", message, detail: null, repositoryPath: null }
}

function textOf(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null
}
