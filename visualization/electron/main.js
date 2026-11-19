const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require("electron")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const contract = require("./coreMethods.generated.json")
const { CoreClient } = require("./coreClient")
const { createProjectsShell } = require("./projectsShell")
const { createShellActions, readShellSettings, runAction } = require("./shellActions")
const policy = require("./shellPolicy")

const CHANNELS = {
    hello: "codecharta:hello",
    request: "codecharta:request",
    cancel: "codecharta:cancel",
    event: "codecharta:event",
    dialog: "codecharta:dialog",
    shell: "codecharta:shell"
}
const CORE_STATE_EVENT = "shell.coreState"
const PROGRESS_EVENT = "core.progress"
const CLIENT_NAME = "codecharta-visualization"
const WINDOW_SIZE = { width: 1400, height: 900 }
const DEFAULT_WINDOW_BACKGROUND = "#1e2329"
const DEFAULT_COLOR_SCHEME = "dark"
const CORE_LOG_FILE = "core.log"
const PREVIOUS_CORE_LOG_FILE = "core.log.1"
// Only Windows reads .ico; elsewhere Electron fails to decode it and the window ends up iconless.
const WINDOW_ICON_FILE = process.platform === "win32" ? "icon.ico" : "icon.png"

let mainWindow = null
let coreClient = null
let trustedPage = null
let isCoreStopped = false
let composedMethods = {}
const operationsBySender = new Map()

function applyUserDataOverride() {
    const userDataDir = process.env.CODECHARTA_USER_DATA_DIR
    if (userDataDir && path.isAbsolute(userDataDir)) {
        app.setPath("userData", userDataDir)
    }
}

function failure(code, message) {
    return { ok: false, error: { code, message, details: {} } }
}

function openCoreLog(userDataDir) {
    const logsDir = path.join(userDataDir, "logs")
    fs.mkdirSync(logsDir, { recursive: true })
    const logFile = path.join(logsDir, CORE_LOG_FILE)
    if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, path.join(logsDir, PREVIOUS_CORE_LOG_FILE))
    }
    return fs.createWriteStream(logFile, { flags: "a" })
}

function startCore() {
    const userDataDir = app.getPath("userData")
    coreClient = new CoreClient({
        executable: policy.resolveCoreExecutable({
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            appDir: __dirname,
            env: process.env,
            platform: process.platform
        }),
        args: ["serve", "--data-dir", userDataDir],
        spawn,
        logStream: openCoreLog(userDataDir),
        now: Date.now,
        setTimeout,
        clearTimeout,
        clientName: CLIENT_NAME,
        protocolVersion: contract.protocolVersion
    })
    coreClient.on("notification", forwardCoreNotification)
    coreClient.on("state", coreState => sendToPage(CORE_STATE_EVENT, coreState))
    coreClient.start()
}

function sendToPage(event, payload) {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CHANNELS.event, { event, payload })
    }
}

function forwardCoreNotification(method, params) {
    if (!policy.isRendererEvent(method, contract)) {
        return
    }
    if (method !== PROGRESS_EVENT) {
        sendToPage(method, params)
        return
    }
    const operationId = operationIdOf(params?.requestId)
    if (operationId !== undefined) {
        sendToPage(method, { ...params, requestId: operationId })
    }
}

function operationIdOf(wireId) {
    for (const operations of operationsBySender.values()) {
        for (const [operationId, operationWireId] of operations) {
            if (operationWireId === wireId) {
                return operationId
            }
        }
    }
    return undefined
}

function operationsOf(webContentsId) {
    if (!operationsBySender.has(webContentsId)) {
        operationsBySender.set(webContentsId, new Map())
    }
    return operationsBySender.get(webContentsId)
}

function relayToCore(webContentsId, method, params, operationId) {
    const { id, promise } = coreClient.request(method, params)
    if (operationId === undefined) {
        return promise
    }
    const operations = operationsOf(webContentsId)
    operations.set(operationId, id)
    return promise.finally(() => {
        if (operations.get(operationId) === id) {
            operations.delete(operationId)
        }
    })
}

function cancelOperationsOf(webContentsId) {
    for (const wireId of operationsOf(webContentsId).values()) {
        coreClient?.cancel(wireId)
    }
    operationsBySender.delete(webContentsId)
}

function relayRequest(sender, { method, params, operationId }) {
    if (policy.isComposedMethod(method, composedMethods)) {
        return composedMethods[method](params ?? {})
    }
    if (!policy.isRendererMethod(method, contract)) {
        return failure("NOT_ALLOWED", `${String(method)} cannot be called from the page.`)
    }
    if (!policy.isValidOperationId(operationId)) {
        return failure("BAD_REQUEST", "The operation id must be a string of at most 64 characters.")
    }
    return relayToCore(sender.webContentsId, method, params ?? {}, operationId)
}

function relayCancel(sender, { operationId }) {
    const wireId = operationsOf(sender.webContentsId).get(operationId)
    if (wireId !== undefined) {
        coreClient.cancel(wireId)
    }
}

function requestCore(method, params) {
    return coreClient.request(method, params).promise
}

function shellPorts() {
    return { dialog, shell, fs, getWindow: () => mainWindow, requestCore, platform: process.platform }
}

function createActions() {
    return createShellActions({
        ...shellPorts(),
        nativeTheme,
        restartCore: () => coreClient.restart(),
        dataDir: app.getPath("userData")
    })
}

function createComposedMethods() {
    return { ...createProjectsShell(shellPorts()) }
}

function captureSender(event) {
    const frame = event.senderFrame
    return {
        hasFrame: frame !== null && frame !== undefined,
        isMainFrame: frame?.parent === null,
        frameUrl: frame?.url,
        webContentsId: event.sender.id
    }
}

function isTrusted(sender) {
    if (mainWindow === null || mainWindow.isDestroyed()) {
        return false
    }
    return policy.isTrustedSender(sender, { mainWebContentsId: mainWindow.webContents.id, trustedPage })
}

function handleTrusted(channel, handler) {
    ipcMain.handle(channel, (event, payload) => {
        const sender = captureSender(event)
        if (!isTrusted(sender)) {
            console.warn(`Refused ${channel} from ${sender.frameUrl ?? "a frame that is gone"}`)
            throw new Error("Forbidden")
        }
        return handler(sender, payload ?? {})
    })
}

function registerIpcHandlers() {
    const { dialogActions, shellActions } = createActions()
    composedMethods = createComposedMethods()
    ipcMain.on(CHANNELS.hello, event => {
        const isTrustedSender = isTrusted(captureSender(event))
        event.returnValue = isTrustedSender ? { protocolVersion: contract.protocolVersion, coreState: coreClient.currentState() } : null
    })
    handleTrusted(CHANNELS.request, relayRequest)
    handleTrusted(CHANNELS.cancel, relayCancel)
    handleTrusted(CHANNELS.dialog, (_sender, payload) => runAction(dialogActions, payload))
    handleTrusted(CHANNELS.shell, (_sender, payload) => runAction(shellActions, payload))
}

function guardNavigation(webContents) {
    webContents.on("will-navigate", event => {
        const verdict = policy.judgeNavigation(event.url, trustedPage)
        if (verdict !== "internal") {
            event.preventDefault()
        }
        if (verdict === "external") {
            shell.openExternal(event.url)
        }
    })
    webContents.setWindowOpenHandler(({ url }) => {
        if (policy.judgeNavigation(url, trustedPage) === "external") {
            shell.openExternal(url)
        }
        return { action: "deny" }
    })
    webContents.on("will-attach-webview", event => event.preventDefault())
}

function cancelOperationsWhenThePageGoes(window) {
    const webContentsId = window.webContents.id
    window.webContents.on("did-start-navigation", details => {
        if (details.isMainFrame && !details.isSameDocument) {
            cancelOperationsOf(webContentsId)
        }
    })
    window.webContents.on("render-process-gone", () => cancelOperationsOf(webContentsId))
    window.on("closed", () => {
        cancelOperationsOf(webContentsId)
        mainWindow = null
    })
}

function createWindow() {
    const indexHtmlPath = path.join(__dirname, "index.html")
    trustedPage = policy.describeTrustedPage({
        isPackaged: app.isPackaged,
        indexHtmlPath,
        devServerUrl: process.env.CODECHARTA_DEV_SERVER_URL,
        platform: process.platform
    })
    const shellSettings = readShellSettings(fs, app.getPath("userData"))
    nativeTheme.themeSource = policy.isColorScheme(shellSettings.colorScheme) ? shellSettings.colorScheme : DEFAULT_COLOR_SCHEME
    mainWindow = new BrowserWindow({
        ...WINDOW_SIZE,
        icon: path.join(__dirname, "codeCharta/assets", WINDOW_ICON_FILE),
        backgroundColor: policy.isWindowBackgroundColor(shellSettings.windowBackgroundColor)
            ? shellSettings.windowBackgroundColor
            : DEFAULT_WINDOW_BACKGROUND,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        }
    })
    guardNavigation(mainWindow.webContents)
    cancelOperationsWhenThePageGoes(mainWindow)
    if (trustedPage.kind === "devServer") {
        mainWindow.loadURL(trustedPage.origin)
    } else {
        mainWindow.loadFile(indexHtmlPath)
    }
}

function focusMainWindow() {
    if (mainWindow === null) {
        return
    }
    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }
    mainWindow.focus()
}

function stopCoreBeforeQuit(event) {
    if (isCoreStopped || coreClient === null) {
        return
    }
    event.preventDefault()
    isCoreStopped = true
    coreClient.stop().finally(() => app.quit())
}

applyUserDataOverride()

if (app.requestSingleInstanceLock()) {
    app.on("second-instance", focusMainWindow)
    app.enableSandbox()
    registerIpcHandlers()
    app.whenReady().then(() => {
        startCore()
        createWindow()
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            }
        })
    })
    app.on("before-quit", stopCoreBeforeQuit)
    // Quit when all windows are closed, except on macOS, where apps stay active until Cmd + Q.
    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit()
        }
    })
} else {
    app.quit()
}
