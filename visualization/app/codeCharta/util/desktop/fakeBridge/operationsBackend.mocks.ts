import type { BridgeMethod } from "../desktopBridge"
import type { FakeAnswer, FakeBackend, FakeBridgeKit, FakeGitMethod, FakeRequestParams, FakeSlowOperation } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeOperationsBackend(kit: FakeBridgeKit): FakeBackend {
    const { store, succeed, refuse, nextId, emit } = kit
    store.heldOperations = new Map()

    function slowOperationOf(method: BridgeMethod, params: unknown) {
        const folderId = (params as FakeRequestParams | undefined)?.repo?.folderId ?? ""
        return Object.hasOwn(store.git, folderId) ? store.git[folderId].slow?.[method as FakeGitMethod] : undefined
    }

    function folderLabelOf(folderId: string) {
        const folders = store.projects.flatMap(project => project.folders)
        return folders.find(folder => folder.id === folderId)?.label ?? null
    }

    function announceHeld(operationId: string, slow: FakeSlowOperation, prompts: { promptId: string }[]) {
        Promise.resolve().then(() => {
            if (slow.progress) {
                emit("core.progress", { requestId: operationId, ...slow.progress })
            }
            for (const prompt of prompts) {
                emit("prompt.requested", prompt)
            }
        })
    }

    function holdOperation(method: BridgeMethod, params: FakeRequestParams, operationId: string, slow: FakeSlowOperation) {
        return new Promise<FakeAnswer>(resolve => {
            const repositoryLabel = folderLabelOf(params.repo?.folderId ?? "")
            const prompts = (slow.prompts ?? []).map(prompt => ({
                promptId: nextId("prompt"),
                requestId: operationId,
                repositoryLabel,
                ...prompt
            }))
            const promptIds = new Set(prompts.map(prompt => prompt.promptId))
            store.heldOperations.set(operationId, { method, params, promptIds, finish: resolve })
            announceHeld(operationId, slow, prompts)
        })
    }

    function holdIfSlow(method: BridgeMethod, params: unknown, operationId: string | undefined) {
        const slow = slowOperationOf(method, params)
        return slow && operationId ? holdOperation(method, params as FakeRequestParams, operationId, slow) : null
    }

    function releaseOperation(operationId: string, answer: FakeAnswer) {
        const held = store.heldOperations.get(operationId)
        if (!held) {
            return
        }
        store.heldOperations.delete(operationId)
        for (const promptId of held.promptIds) {
            emit("prompt.closed", { promptId })
        }
        held.finish(answer)
    }

    function cancel(operationId: string) {
        releaseOperation(operationId, refuse("CANCELLED", "The operation was cancelled."))
    }

    function heldOperationOfPrompt(promptId: string) {
        return [...store.heldOperations.entries()].find(([, held]) => held.promptIds.has(promptId))
    }

    function closedPrompt() {
        return refuse("NOT_FOUND", "The prompt is closed.")
    }

    function answerPrompt(params: FakeRequestParams) {
        const promptId = params.promptId ?? ""
        const found = heldOperationOfPrompt(promptId)
        if (!found) {
            return closedPrompt()
        }
        const [operationId, held] = found
        held.promptIds.delete(promptId)
        emit("prompt.closed", { promptId })
        if (held.promptIds.size === 0) {
            releaseOperation(operationId, kit.answer(held.method, held.params))
        }
        return succeed(null)
    }

    function cancelPrompt(params: FakeRequestParams) {
        const found = heldOperationOfPrompt(params.promptId ?? "")
        if (!found) {
            return closedPrompt()
        }
        releaseOperation(found[0], refuse("AUTHENTICATION_CANCELLED", "The sign-in was cancelled."))
        return succeed(null)
    }

    kit.operations = { holdIfSlow, cancel }

    return {
        "prompt.answer": answerPrompt,
        "prompt.cancel": cancelPrompt
    }
}
