const path = require("node:path")
const { NOTHING_CHOSEN, failure, readShellSettings, writeShellSetting } = require("./shellActions")
const {
    WINDOW_BUTTONS,
    buttonOrderFromGnomeLayout,
    buttonOrderFromKwinrc,
    isTitleBarColors,
    isWindowCommand,
    windowFrameOptions
} = require("./windowPolicy")

const WINDOW_STATE_EVENT = "shell.windowState"
const WINDOW_STATE_CHANGES = ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "focus", "blur"]
const DEFAULT_TITLE_BAR_COLORS = { color: "#1e2329", symbolColor: "#e6e9ee" }
const GNOME_BUTTON_LAYOUT_QUERY = ["get", "org.gnome.desktop.wm.preferences", "button-layout"]
const GSETTINGS_TIMEOUT_MS = 2000

function createWindowShell({ fs, dataDir, platform, getWindow, openWindow, loadButtonOrder }) {
    let usesAppTitleBar = false
    let isReopening = false
    let buttonOrder = WINDOW_BUTTONS
    if (platform === "linux") {
        loadButtonOrder().then(order => {
            buttonOrder = order
        })
    }

    function frameOptionsFor(shellSettings) {
        usesAppTitleBar = shellSettings.useAppTitleBar === true
        const colors = isTitleBarColors(shellSettings.titleBarColors) ? shellSettings.titleBarColors : DEFAULT_TITLE_BAR_COLORS
        return windowFrameOptions(platform, { useAppTitleBar: usesAppTitleBar, colors })
    }

    function describeWindow(window) {
        return {
            platform,
            usesAppTitleBar,
            savedUseAppTitleBar: readShellSettings(fs, dataDir).useAppTitleBar === true,
            isMaximized: window.isMaximized(),
            isMaximizable: window.isMaximizable(),
            isFullScreen: window.isFullScreen(),
            isFocused: window.isFocused(),
            buttonOrder
        }
    }

    function withWindow(act) {
        const window = getWindow()
        return window ? act(window) : failure("NOT_FOUND", "The window is closed.")
    }

    function controlWindow({ command }) {
        if (!isWindowCommand(command)) {
            return failure("BAD_REQUEST", "The window command must be minimize, toggleMaximize or close.")
        }
        return withWindow(window => {
            runWindowCommand(window, command)
            return NOTHING_CHOSEN
        })
    }

    async function setUseAppTitleBar({ enabled }) {
        if (typeof enabled !== "boolean") {
            return failure("BAD_REQUEST", "The title bar setting must be true or false.")
        }
        await writeShellSetting(fs, dataDir, "useAppTitleBar", enabled)
        return NOTHING_CHOSEN
    }

    async function setTitleBarColors({ colors }) {
        if (!isTitleBarColors(colors)) {
            return failure("BAD_REQUEST", "The title bar colours must be written as #rrggbb.")
        }
        const titleBarColors = { color: colors.color, symbolColor: colors.symbolColor }
        if (platform === "win32" && usesAppTitleBar) {
            getWindow()?.setTitleBarOverlay(titleBarColors)
        }
        await writeShellSetting(fs, dataDir, "titleBarColors", titleBarColors)
        return NOTHING_CHOSEN
    }

    function reopenWindow() {
        const closingWindow = getWindow()
        if (closingWindow && !isReopening) {
            isReopening = true
            const placement = closingWindow.getNormalBounds()
            const wasMaximized = closingWindow.isMaximized()
            closingWindow.once("closed", () => {
                const openedWindow = openWindow(placement)
                if (wasMaximized) {
                    openedWindow.maximize()
                }
                isReopening = false
            })
            closingWindow.close()
        }
        return NOTHING_CHOSEN
    }

    function watchWindow(window, send) {
        for (const change of WINDOW_STATE_CHANGES) {
            window.on(change, () => send(WINDOW_STATE_EVENT, describeWindow(window)))
        }
        window.on("system-context-menu", event => {
            if (platform === "linux" && usesAppTitleBar) {
                event.preventDefault()
            }
        })
    }

    return {
        frameOptionsFor,
        watchWindow,
        // macOS apps stay active without windows until Cmd + Q.
        shouldQuitWhenAllClosed: () => platform !== "darwin" && !isReopening,
        windowActions: {
            windowState: () => withWindow(window => ({ ok: true, value: describeWindow(window) })),
            controlWindow,
            setUseAppTitleBar,
            setTitleBarColors,
            reopenWindow
        }
    }
}

function runWindowCommand(window, command) {
    if (command === "minimize") {
        window.minimize()
    } else if (command === "close") {
        window.close()
    } else if (window.isMaximized()) {
        window.unmaximize()
    } else if (window.isMaximizable()) {
        window.maximize()
    }
}

async function readLinuxButtonOrder({ fs, env, homeDir, execFile }) {
    try {
        if ((env.XDG_CURRENT_DESKTOP ?? "").split(":").includes("KDE")) {
            const configDir = env.XDG_CONFIG_HOME || path.join(homeDir, ".config")
            return buttonOrderFromKwinrc(await fs.promises.readFile(path.join(configDir, "kwinrc"), "utf8"))
        }
        const { stdout } = await execFile("gsettings", GNOME_BUTTON_LAYOUT_QUERY, { timeout: GSETTINGS_TIMEOUT_MS })
        return buttonOrderFromGnomeLayout(stdout)
    } catch {
        return WINDOW_BUTTONS
    }
}

module.exports = { createWindowShell, readLinuxButtonOrder }
