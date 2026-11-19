const { contextBridge, ipcRenderer } = require("electron")

const CHANNELS = {
    hello: "codecharta:hello",
    request: "codecharta:request",
    cancel: "codecharta:cancel",
    event: "codecharta:event",
    dialog: "codecharta:dialog",
    shell: "codecharta:shell"
}
const CORE_STATE_EVENT = "shell.coreState"

const greeting = ipcRenderer.sendSync(CHANNELS.hello)
const handlersByEvent = new Map()
let latestCoreState = greeting?.coreState ?? null

function deliver(handler, payload) {
    try {
        handler(payload)
    } catch {}
}

function handlersOf(event) {
    if (!handlersByEvent.has(event)) {
        handlersByEvent.set(event, new Set())
    }
    return handlersByEvent.get(event)
}

function replayCoreState(event, handler) {
    if (event !== CORE_STATE_EVENT || latestCoreState === null) {
        return
    }
    const stateToReplay = latestCoreState
    Promise.resolve().then(() => {
        if (handlersOf(event).has(handler)) {
            deliver(handler, stateToReplay)
        }
    })
}

function subscribe(event, handler) {
    if (typeof event !== "string" || typeof handler !== "function") {
        return () => {}
    }
    handlersOf(event).add(handler)
    replayCoreState(event, handler)
    return () => handlersOf(event).delete(handler)
}

ipcRenderer.on(CHANNELS.event, (_ipcEvent, { event, payload }) => {
    if (event === CORE_STATE_EVENT) {
        latestCoreState = payload
    }
    for (const handler of [...handlersOf(event)]) {
        deliver(handler, payload)
    }
})

if (greeting) {
    contextBridge.exposeInMainWorld("codeChartaDesktop", {
        protocolVersion: greeting.protocolVersion,
        request: (method, params, options) => ipcRenderer.invoke(CHANNELS.request, { method, params, operationId: options?.operationId }),
        cancel: operationId => ipcRenderer.invoke(CHANNELS.cancel, { operationId }),
        subscribe,
        pickFolder: options => ipcRenderer.invoke(CHANNELS.dialog, { kind: "pickFolder", options }),
        pickFile: options => ipcRenderer.invoke(CHANNELS.dialog, { kind: "pickFile", options }),
        chooseToolExecutable: (tool, options) => ipcRenderer.invoke(CHANNELS.dialog, { kind: "chooseToolExecutable", tool, options }),
        chooseStoreRoot: options => ipcRenderer.invoke(CHANNELS.dialog, { kind: "chooseStoreRoot", options }),
        reveal: target => ipcRenderer.invoke(CHANNELS.shell, { kind: "reveal", target }),
        setWindowBackground: color => ipcRenderer.invoke(CHANNELS.shell, { kind: "setWindowBackground", color }),
        setColorScheme: scheme => ipcRenderer.invoke(CHANNELS.shell, { kind: "setColorScheme", scheme }),
        restartCore: () => ipcRenderer.invoke(CHANNELS.shell, { kind: "restartCore" })
    })
}
