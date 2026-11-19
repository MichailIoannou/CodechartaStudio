const path = require("node:path")
const { fileURLToPath } = require("node:url")

const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:", "vscode:"])
const LOCAL_DEV_SERVER = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/
const CORE_FILE_NAME = "codecharta-core"
const CORE_RESTART_DELAYS_MS = [500, 1000, 2000, 4000, 8000]
const CORE_FAILURE_WINDOW_MS = 60_000
const MAX_OPERATION_ID_LENGTH = 64
const MAP_FILE_ENDINGS = [".cc.json", ".cc.json.gz"]
const COLOR_SCHEMES = ["light", "dark", "system"]
const WINDOW_BACKGROUND_COLOR = /^#[0-9a-fA-F]{6}$/
const FILTER_EXTENSION = /^(\*|[A-Za-z0-9]+)$/

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

function isComposedMethod(method, composedMethods) {
    return typeof method === "string" && Object.hasOwn(composedMethods, method)
}

function isRendererEvent(event, contract) {
    return typeof event === "string" && contract.rendererEvents.includes(event)
}

function isValidOperationId(operationId) {
    return operationId === undefined || (typeof operationId === "string" && operationId.length <= MAX_OPERATION_ID_LENGTH)
}

function isInsideFolder(filePath, folder, platform) {
    const isWindows = platform === "win32"
    const pathFlavour = isWindows ? path.win32 : path.posix
    if (typeof filePath !== "string" || typeof folder !== "string" || !pathFlavour.isAbsolute(filePath)) {
        return false
    }
    const comparable = candidate => (isWindows ? pathFlavour.normalize(candidate).toLowerCase() : pathFlavour.normalize(candidate))
    const relativePath = pathFlavour.relative(comparable(folder), comparable(filePath))
    return relativePath.length > 0 && !relativePath.startsWith("..") && !pathFlavour.isAbsolute(relativePath)
}

function isReadableMapPath(filePath, { allowedRoots, platform }) {
    const isInsideARoot = allowedRoots.some(root => isInsideFolder(filePath, root, platform))
    return isInsideARoot && MAP_FILE_ENDINGS.some(ending => filePath.toLowerCase().endsWith(ending))
}

function isWindowBackgroundColor(color) {
    return typeof color === "string" && WINDOW_BACKGROUND_COLOR.test(color)
}

function isColorScheme(scheme) {
    return COLOR_SCHEMES.includes(scheme)
}

function isDialogFilter(filter) {
    return (
        typeof filter?.name === "string" &&
        Array.isArray(filter.extensions) &&
        filter.extensions.every(extension => typeof extension === "string" && FILTER_EXTENSION.test(extension))
    )
}

function toDialogOptions(options) {
    const title = options?.title
    const filters = options?.filters
    const isTitleValid = title === undefined || typeof title === "string"
    const areFiltersValid = filters === undefined || (Array.isArray(filters) && filters.every(isDialogFilter))
    if (!isTitleValid || !areFiltersValid) {
        return null
    }
    return { title, filters: filters?.map(filter => ({ name: filter.name, extensions: [...filter.extensions] })) }
}

module.exports = {
    describeTrustedPage,
    isReadableMapPath,
    isRendererEvent,
    isRendererMethod,
    isColorScheme,
    isComposedMethod,
    isInsideFolder,
    isTrustedSender,
    isValidOperationId,
    isWindowBackgroundColor,
    judgeNavigation,
    planCoreRestart,
    resolveCoreExecutable,
    toDialogOptions
}
