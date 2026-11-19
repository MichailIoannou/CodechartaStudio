import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { BridgeMethod, CoreState, DesktopBridge } from "./desktopBridge"

type FakeAnswerKey =
    | BridgeMethod
    | "pickFolder"
    | "pickFile"
    | "chooseToolExecutable"
    | "chooseStoreRoot"
    | "reveal"
    | "readSnapshotMap"
    | "setWindowBackground"
    | "setColorScheme"
    | "restartCore"

export interface FakeDesktopSeed {
    protocolVersion?: number
    coreState?: CoreState
    responses?: Partial<Record<FakeAnswerKey, unknown>>
    failures?: Partial<Record<FakeAnswerKey, ErrorPayload>>
}

interface FakeCall {
    name: keyof DesktopBridge
    args: unknown[]
}

export interface FakeDesktopBridge extends DesktopBridge {
    readonly calls: FakeCall[]
    emit(event: string, payload: unknown): void
    respondWith(key: FakeAnswerKey, value: unknown): void
    failWith(key: FakeAnswerKey, error: ErrorPayload): void
}

/*
 * Rebuilt from this function's source text by the Playwright stand-in: keep the body free of imports and outer helpers.
 * The ignore keeps coverage counters out of that text.
 */
/* istanbul ignore next */
export function createFakeDesktopBridge(seed: FakeDesktopSeed = {}): FakeDesktopBridge {
    const FALLBACK_PROTOCOL_VERSION = 1
    const CORE_STATE_EVENT = "shell.coreState"
    const NOTHING_PICKED_OR_FOUND: Partial<Record<FakeAnswerKey, null>> = {
        "projects.pickFolder": null,
        "projects.readSourceFile": null,
        "projects.revealFolder": null
    }
    const responses = { ...seed.responses }
    const failures = { ...seed.failures }
    const handlersByEvent = new Map<string, Set<(payload: unknown) => void>>()
    const calls: FakeCall[] = []
    let coreState: CoreState = seed.coreState ?? { state: "ready", message: null }

    const succeed = (value: unknown) => ({ ok: true as const, value })
    const missing = (key: string) => ({
        ok: false as const,
        error: { code: "NOT_FOUND" as const, message: `The fake desktop bridge has no answer for ${key}.`, details: {} }
    })

    function answerFor(key: FakeAnswerKey, fallback: unknown) {
        if (failures[key]) {
            return { ok: false as const, error: failures[key] }
        }
        return key in responses ? succeed(responses[key]) : fallback
    }

    function record(name: keyof DesktopBridge, ...args: unknown[]) {
        calls.push({ name, args })
    }

    function recordAndAnswer(name: keyof DesktopBridge, key: FakeAnswerKey, fallback: unknown, ...args: unknown[]) {
        record(name, ...args)
        return Promise.resolve(answerFor(key, fallback))
    }

    function pick(name: "pickFolder" | "pickFile", options: unknown) {
        record(name, options)
        return Promise.resolve(name in responses ? responses[name] : null)
    }

    function handlersOf(event: string) {
        const handlers = handlersByEvent.get(event) ?? new Set<(payload: unknown) => void>()
        handlersByEvent.set(event, handlers)
        return handlers
    }

    function emit(event: string, payload: unknown) {
        if (event === CORE_STATE_EVENT) {
            coreState = payload as CoreState
        }
        for (const handler of [...handlersOf(event)]) {
            handler(payload)
        }
    }

    function subscribe(event: string, handler: (payload: unknown) => void) {
        record("subscribe", event)
        handlersOf(event).add(handler)
        if (event === CORE_STATE_EVENT) {
            const stateToReplay = coreState
            Promise.resolve().then(() => handlersOf(event).has(handler) && handler(stateToReplay))
        }
        return () => handlersOf(event).delete(handler)
    }

    return {
        calls,
        emit,
        respondWith: (key, value) => {
            delete failures[key]
            responses[key] = value
        },
        failWith: (key, error) => {
            failures[key] = error
        },
        protocolVersion: seed.protocolVersion ?? FALLBACK_PROTOCOL_VERSION,
        request: ((method: BridgeMethod, params: unknown, options?: unknown) =>
            recordAndAnswer(
                "request",
                method,
                method in NOTHING_PICKED_OR_FOUND ? succeed(null) : missing(method),
                method,
                params,
                options
            )) as DesktopBridge["request"],
        cancel: operationId => {
            record("cancel", operationId)
            return Promise.resolve()
        },
        subscribe: subscribe as DesktopBridge["subscribe"],
        pickFolder: options => pick("pickFolder", options),
        pickFile: options => pick("pickFile", options),
        chooseToolExecutable: (tool, options) =>
            recordAndAnswer("chooseToolExecutable", "chooseToolExecutable", succeed(null), tool, options),
        chooseStoreRoot: options => recordAndAnswer("chooseStoreRoot", "chooseStoreRoot", succeed(null), options),
        reveal: target => recordAndAnswer("reveal", "reveal", succeed(null), target),
        readSnapshotMap: target => recordAndAnswer("readSnapshotMap", "readSnapshotMap", missing("readSnapshotMap"), target),
        setWindowBackground: color => recordAndAnswer("setWindowBackground", "setWindowBackground", succeed(null), color),
        setColorScheme: scheme => recordAndAnswer("setColorScheme", "setColorScheme", succeed(null), scheme),
        restartCore: () => recordAndAnswer("restartCore", "restartCore", succeed(null))
    } as FakeDesktopBridge
}
