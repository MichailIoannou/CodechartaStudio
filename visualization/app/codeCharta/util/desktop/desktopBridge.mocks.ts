import type { ErrorCode } from "../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { BridgeMethod, CoreState, DesktopBridge } from "./desktopBridge"
import type {
    FakeAnswer,
    FakeAnswerKey,
    FakeBackend,
    FakeBackendGroup,
    FakeBridgeKit,
    FakeDesktopSeed,
    FakeRequestParams
} from "./fakeBridge/fakeBridgeKit"
import { fakeFoldersBackend } from "./fakeBridge/foldersBackend.mocks"
import { fakeGitBackend } from "./fakeBridge/gitBackend.mocks"
import { fakeGitBranchesBackend } from "./fakeBridge/gitBranchesBackend.mocks"
import { fakeGitHistoryBackend } from "./fakeBridge/gitHistoryBackend.mocks"
import { fakeGitWorkingTreeBackend } from "./fakeBridge/gitWorkingTreeBackend.mocks"
import { fakeImportBackend } from "./fakeBridge/importBackend.mocks"
import { fakeOperationsBackend } from "./fakeBridge/operationsBackend.mocks"
import { fakeProjectsBackend } from "./fakeBridge/projectsBackend.mocks"
import { fakeSnapshotsBackend } from "./fakeBridge/snapshotsBackend.mocks"

export type { FakeDesktopSeed } from "./fakeBridge/fakeBridgeKit"

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

const FAKE_BACKEND_GROUPS: FakeBackendGroup[] = [
    fakeSnapshotsBackend,
    fakeProjectsBackend,
    fakeFoldersBackend,
    fakeImportBackend,
    fakeGitBackend,
    fakeGitHistoryBackend,
    fakeGitBranchesBackend,
    fakeGitWorkingTreeBackend,
    fakeOperationsBackend
]

/** The source of an expression that builds the fake bridge, for a page that cannot import it. */
export function fakeDesktopBridgeSource(seed: FakeDesktopSeed): string {
    const backendGroups = FAKE_BACKEND_GROUPS.map(group => group.toString()).join(", ")
    return `(${createFakeDesktopBridge.toString()})(${JSON.stringify(seed)}, [${backendGroups}])`
}

/*
 * Rebuilt from this function's source text by the Playwright stand-in, together with the source of each backend group:
 * keep the body free of imports and outer helpers. The ignore keeps coverage counters out of that text.
 */
/* istanbul ignore next */
export function createFakeDesktopBridge(
    seed: FakeDesktopSeed = {},
    backendGroups: FakeBackendGroup[] = FAKE_BACKEND_GROUPS
): FakeDesktopBridge {
    const FALLBACK_PROTOCOL_VERSION = 1
    const CORE_STATE_EVENT = "shell.coreState"
    const FALLBACK_NOW = "2026-01-01T00:00:00Z"
    const responses = { ...seed.responses }
    const failures = { ...seed.failures }
    const handlersByEvent = new Map<string, Set<(payload: unknown) => void>>()
    const calls: FakeCall[] = []
    let coreState: CoreState = seed.coreState ?? { state: "ready", message: null }
    let createdIds = 0

    const succeed = (value: unknown): FakeAnswer => ({ ok: true, value })
    const refuse = (code: ErrorCode, message: string): FakeAnswer => ({ ok: false, error: { code, message, details: {} } })
    const missing = (key: string) => refuse("NOT_FOUND", `The fake desktop bridge has no answer for ${key}.`)

    function nextId(prefix: string) {
        createdIds += 1
        return `${prefix}-${String(createdIds).padStart(16, "0")}`
    }

    const kit = {
        seed,
        store: {},
        now: seed.now ?? FALLBACK_NOW,
        succeed,
        refuse,
        nextId,
        emit,
        answer: answerFromBackend
    } as FakeBridgeKit
    const backend: FakeBackend = Object.assign({}, ...backendGroups.map(group => group(kit)))

    function answerFor(key: FakeAnswerKey, fallback: () => unknown) {
        if (failures[key]) {
            return { ok: false as const, error: failures[key] }
        }
        return key in responses ? succeed(responses[key]) : fallback()
    }

    function record(name: keyof DesktopBridge, ...args: unknown[]) {
        calls.push({ name, args })
    }

    function recordAndAnswer(name: keyof DesktopBridge, key: FakeAnswerKey, fallback: () => unknown, ...args: unknown[]) {
        record(name, ...args)
        return Promise.resolve(answerFor(key, fallback))
    }

    function answeredWithNull(name: keyof DesktopBridge & FakeAnswerKey) {
        return (...args: unknown[]) => recordAndAnswer(name, name, () => succeed(null), ...args)
    }

    function pick(name: "pickFolder" | "pickFile", options: unknown) {
        record(name, options)
        return Promise.resolve(name in responses ? responses[name] : null)
    }

    function answerFromBackend(method: FakeAnswerKey, params: unknown) {
        const handler = backend[method]
        return handler ? handler((params ?? {}) as FakeRequestParams) : missing(method)
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

    function request(method: BridgeMethod, params: unknown, options?: { operationId?: string }) {
        const held = kit.operations?.holdIfSlow(method, params, options?.operationId)
        if (held) {
            record("request", method, params, options)
            return held
        }
        return recordAndAnswer("request", method, () => answerFromBackend(method, params), method, params, options)
    }

    function openDroppedFile(file: unknown) {
        return recordAndAnswer("openDroppedFile", "openDroppedFile", () => answerFromBackend("snapshots.pickImportFile", {}), file)
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
        request: request as DesktopBridge["request"],
        cancel: operationId => {
            record("cancel", operationId)
            kit.operations?.cancel(operationId)
            return Promise.resolve()
        },
        subscribe: subscribe as DesktopBridge["subscribe"],
        pickFolder: options => pick("pickFolder", options),
        pickFile: options => pick("pickFile", options),
        chooseToolExecutable: answeredWithNull("chooseToolExecutable"),
        chooseStoreRoot: answeredWithNull("chooseStoreRoot"),
        openDroppedFile: openDroppedFile as DesktopBridge["openDroppedFile"],
        reveal: answeredWithNull("reveal"),
        setWindowBackground: answeredWithNull("setWindowBackground"),
        setColorScheme: answeredWithNull("setColorScheme"),
        restartCore: answeredWithNull("restartCore")
    } as FakeDesktopBridge
}
