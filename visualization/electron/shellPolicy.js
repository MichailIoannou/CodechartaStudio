const path = require("node:path")
const { fileURLToPath } = require("node:url")

const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:", "vscode:"])
const LOCAL_DEV_SERVER = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/
const CORE_FILE_NAME = "codecharta-core"
const CORE_RESTART_DELAYS_MS = [500, 1000, 2000, 4000, 8000]
const CORE_FAILURE_WINDOW_MS = 60_000
const MAX_OPERATION_ID_LENGTH = 64

function describeTrustedPage({ isPackaged, indexHtmlPath, devServerUrl, platform }) {
    if (!isPackaged && LOCAL_DEV_SERVER.test(devServerUrl ?? "")) {
        return { kind: "devServer", origin: new URL(devServerUrl).origin }
    }
    return { kind: "file", path: indexHtmlPath, platform }
}

function isTrustedSender(sender, { mainWebContentsId, trustedPage }) {
    return (
        sender.hasFrame &&
        sender.isMainFrame &&
        sender.webContentsId === mainWebContentsId &&
        isTrustedPageUrl(sender.frameUrl, trustedPage)
    )
}

function isTrustedPageUrl(url, trustedPage) {
    const parsedUrl = parseUrl(url)
    if (parsedUrl === null) {
        return false
    }
    if (trustedPage.kind === "devServer") {
        return parsedUrl.origin === trustedPage.origin
    }
    return parsedUrl.protocol === "file:" && isSameFile(parsedUrl, trustedPage)
}

function isSameFile(fileUrl, trustedPage) {
    const isWindows = trustedPage.platform === "win32"
    const pathFlavour = isWindows ? path.win32 : path.posix
    const comparable = filePath => {
        const normalized = pathFlavour.normalize(filePath)
        return isWindows ? normalized.toLowerCase() : normalized
    }
    try {
        return comparable(fileURLToPath(fileUrl, { windows: isWindows })) === comparable(trustedPage.path)
    } catch {
        return false
    }
}

function judgeNavigation(url, trustedPage) {
    if (isTrustedPageUrl(url, trustedPage)) {
        return "internal"
    }
    const parsedUrl = parseUrl(url)
    return parsedUrl !== null && EXTERNAL_PROTOCOLS.has(parsedUrl.protocol) ? "external" : "blocked"
}

function parseUrl(url) {
    try {
        return new URL(url)
    } catch {
        return null
    }
}

function resolveCoreExecutable({ isPackaged, resourcesPath, appDir, env, platform }) {
    const fileName = platform === "win32" ? `${CORE_FILE_NAME}.exe` : CORE_FILE_NAME
    if (isPackaged) {
        return path.join(resourcesPath, fileName)
    }
    if (env.CODECHARTA_CORE_PATH) {
        return path.resolve(env.CODECHARTA_CORE_PATH)
    }
    const repositoryRoot = path.resolve(appDir, "..", "..", "..", "..")
    return path.join(repositoryRoot, "core", "target", "debug", fileName)
}

function planCoreRestart(failureTimes, now) {
    const recentFailures = [...failureTimes.filter(failureTime => now - failureTime < CORE_FAILURE_WINDOW_MS), now]
    const delayMs = recentFailures.length > CORE_RESTART_DELAYS_MS.length ? null : CORE_RESTART_DELAYS_MS[recentFailures.length - 1]
    return { recentFailures, delayMs }
}

function isRendererMethod(method, contract) {
    return typeof method === "string" && contract.rendererMethods.includes(method)
}

function isRendererEvent(event, contract) {
    return typeof event === "string" && contract.rendererEvents.includes(event)
}

function isValidOperationId(operationId) {
    return operationId === undefined || (typeof operationId === "string" && operationId.length <= MAX_OPERATION_ID_LENGTH)
}

module.exports = {
    describeTrustedPage,
    isRendererEvent,
    isRendererMethod,
    isTrustedSender,
    isValidOperationId,
    judgeNavigation,
    planCoreRestart,
    resolveCoreExecutable
}
