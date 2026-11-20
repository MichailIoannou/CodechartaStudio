import type { ErrorCode } from "../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { CoreResult } from "./desktopBridge"

export class DesktopBridgeError extends Error {
    readonly code: ErrorCode
    readonly details: ErrorPayload["details"]

    constructor({ code, message, details }: Pick<ErrorPayload, "code" | "message"> & Partial<Pick<ErrorPayload, "details">>) {
        super(message)
        this.name = "DesktopBridgeError"
        this.code = code
        this.details = details ?? {}
    }
}

export function valueOrThrow<Value>(result: CoreResult<Value>): Value {
    if ("error" in result) {
        throw new DesktopBridgeError(result.error)
    }
    return result.value
}
