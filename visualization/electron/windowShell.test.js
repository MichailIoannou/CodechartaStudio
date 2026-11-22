const { afterEach, beforeEach, describe, test } = require("node:test")
const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { readShellSettings, runAction } = require("./shellActions")
const { createWindowShell, readLinuxButtonOrder } = require("./windowShell")

const DEFAULT_ORDER = ["minimize", "maximize", "close"]
const COLORS = { color: "#1e2329", symbolColor: "#e6e9ee" }

let dataDir

class FakeWindow extends EventEmitter {
    constructor({ isMaximizable = true } = {}) {
        super()
        this.calls = []
        this.maximized = false
        this.maximizable = isMaximizable
        this.fullScreen = false
        this.focused = true
    }
    isMaximized() {
        return this.maximized
    }
    isMaximizable() {
        return this.maximizable
    }
    isFullScreen() {
        return this.fullScreen
    }
    isFocused() {
        return this.focused
    }
    getNormalBounds() {
        return { x: 40, y: 30, width: 1400, height: 900 }
    }
    minimize() {
        this.calls.push("minimize")
    }
    maximize() {
        this.calls.push("maximize")
    }
    unmaximize() {
        this.calls.push("unmaximize")
    }
    close() {
        this.calls.push("close")
        this.emit("closed")
    }
    setTitleBarOverlay(colors) {
        this.calls.push({ overlay: colors })
    }
}

function createHarness({ platform = "linux", usesAppTitleBar = true, window = new FakeWindow(), buttonOrder = DEFAULT_ORDER } = {}) {
    const sent = []
    const opened = []
    let currentWindow = window
    const windowShell = createWindowShell({
        fs,
        dataDir,
        platform,
        getWindow: () => currentWindow,
        openWindow: placement => {
            currentWindow = new FakeWindow()
            opened.push({ placement, window: currentWindow })
            return currentWindow
        },
        loadButtonOrder: async () => buttonOrder
    })
    windowShell.frameOptionsFor({ useAppTitleBar: usesAppTitleBar })
    windowShell.watchWindow(window, (event, payload) => sent.push({ event, payload }))
    return { ...windowShell, window, sent, opened }
}

beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-window-shell-"))
})

afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true })
})

describe("window state", () => {
    test("should describe the window and the title bar it was opened with", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.windowActions, { kind: "windowState" })

        // Assert
        assert.deepEqual(answer, {
            ok: true,
            value: {
                platform: "linux",
                usesAppTitleBar: true,
                savedUseAppTitleBar: false,
                isMaximized: false,
                isMaximizable: true,
                isFullScreen: false,
                isFocused: true,
                buttonOrder: DEFAULT_ORDER
            }
        })
    })

    test("should tell the page whenever the window is maximized, focused or full screen", () => {
        // Arrange
        const harness = createHarness()
        harness.window.maximized = true

        // Act
        for (const change of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "focus", "blur"]) {
            harness.window.emit(change)
        }

        // Assert
        assert.equal(harness.sent.length, 6)
        assert.deepEqual(
            harness.sent.map(({ event, payload }) => [event, payload.isMaximized]),
            Array.from({ length: 6 }, () => ["shell.windowState", true])
        )
    })

    test("should answer NOT_FOUND once the window is gone", async () => {
        // Arrange
        const windowShell = createWindowShell({
            fs,
            dataDir,
            platform: "linux",
            getWindow: () => null,
            openWindow: () => new FakeWindow(),
            loadButtonOrder: async () => DEFAULT_ORDER
        })

        // Act
        const answer = await runAction(windowShell.windowActions, { kind: "windowState" })

        // Assert
        assert.equal(answer.error.code, "NOT_FOUND")
    })
})

describe("window commands", () => {
    test("should minimize, maximize, restore and close the window", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        await runAction(harness.windowActions, { kind: "controlWindow", command: "minimize" })
        await runAction(harness.windowActions, { kind: "controlWindow", command: "toggleMaximize" })
        harness.window.maximized = true
        await runAction(harness.windowActions, { kind: "controlWindow", command: "toggleMaximize" })
        await runAction(harness.windowActions, { kind: "controlWindow", command: "close" })

        // Assert
        assert.deepEqual(harness.window.calls, ["minimize", "maximize", "unmaximize", "close"])
    })

    test("should not maximize a window that cannot grow", async () => {
        // Arrange
        const harness = createHarness({ window: new FakeWindow({ isMaximizable: false }) })

        // Act
        const answer = await runAction(harness.windowActions, { kind: "controlWindow", command: "toggleMaximize" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(harness.window.calls, [])
    })

    test("should refuse an unknown window command", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.windowActions, { kind: "controlWindow", command: "destroy" })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
        assert.deepEqual(harness.window.calls, [])
    })
})

describe("title bar setting", () => {
    test("should remember the title bar setting for the next start", async () => {
        // Arrange
        const harness = createHarness({ usesAppTitleBar: false })

        // Act
        const answer = await runAction(harness.windowActions, { kind: "setUseAppTitleBar", enabled: true })
        const state = await runAction(harness.windowActions, { kind: "windowState" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(readShellSettings(fs, dataDir), { useAppTitleBar: true })
        assert.equal(state.value.usesAppTitleBar, false)
        assert.equal(state.value.savedUseAppTitleBar, true)
    })

    test("should refuse a title bar setting that is not a boolean", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.windowActions, { kind: "setUseAppTitleBar", enabled: "yes" })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
        assert.deepEqual(readShellSettings(fs, dataDir), {})
    })

    test("should reopen the window where it was once the old one is closed, without quitting meanwhile", async () => {
        // Arrange
        const harness = createHarness()
        let shouldQuitWhileClosing = null
        harness.window.once("closed", () => (shouldQuitWhileClosing = harness.shouldQuitWhenAllClosed()))

        // Act
        const answer = await runAction(harness.windowActions, { kind: "reopenWindow" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.equal(shouldQuitWhileClosing, false)
        assert.equal(harness.shouldQuitWhenAllClosed(), true)
        assert.deepEqual(
            harness.opened.map(({ placement }) => placement),
            [{ x: 40, y: 30, width: 1400, height: 900 }]
        )
        assert.deepEqual(harness.opened[0].window.calls, [])
    })

    test("should maximize the reopened window when the old one was maximized", async () => {
        // Arrange
        const harness = createHarness()
        harness.window.maximized = true

        // Act
        await runAction(harness.windowActions, { kind: "reopenWindow" })

        // Assert
        assert.deepEqual(harness.opened[0].window.calls, ["maximize"])
    })

    test("should keep macOS running without windows", () => {
        // Act
        const shouldQuit = createHarness({ platform: "darwin" }).shouldQuitWhenAllClosed()

        // Assert
        assert.equal(shouldQuit, false)
    })
})

describe("title bar colours", () => {
    test("should recolour the Windows caption buttons and remember the colours", async () => {
        // Arrange
        const harness = createHarness({ platform: "win32" })

        // Act
        const answer = await runAction(harness.windowActions, { kind: "setTitleBarColors", colors: COLORS })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(harness.window.calls, [{ overlay: COLORS }])
        assert.deepEqual(readShellSettings(fs, dataDir), { titleBarColors: COLORS })
    })

    test("should only remember the colours where no caption buttons are drawn over the page", async () => {
        // Arrange
        const onLinux = createHarness({ platform: "linux" })
        const withSystemTitleBar = createHarness({ platform: "win32", usesAppTitleBar: false })

        // Act
        await runAction(onLinux.windowActions, { kind: "setTitleBarColors", colors: COLORS })
        await runAction(withSystemTitleBar.windowActions, { kind: "setTitleBarColors", colors: COLORS })

        // Assert
        assert.deepEqual(onLinux.window.calls, [])
        assert.deepEqual(withSystemTitleBar.window.calls, [])
        assert.deepEqual(readShellSettings(fs, dataDir), { titleBarColors: COLORS })
    })

    test("should refuse malformed title bar colours", async () => {
        // Arrange
        const harness = createHarness({ platform: "win32" })

        // Act
        const answer = await runAction(harness.windowActions, { kind: "setTitleBarColors", colors: { color: "red" } })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
        assert.deepEqual(harness.window.calls, [])
    })
})

describe("window menu", () => {
    test("should keep any system menu away from a right-click on the Linux drag area, where the page shows its own", () => {
        // Arrange
        const harness = createHarness({ platform: "linux" })
        let isPrevented = false

        // Act
        harness.window.emit("system-context-menu", { preventDefault: () => (isPrevented = true) }, { x: 400, y: 70 })

        // Assert
        assert.equal(isPrevented, true)
        assert.deepEqual(harness.sent, [])
    })

    test("should leave the right-click to the system on Windows and with the system title bar", () => {
        // Arrange
        const onWindows = createHarness({ platform: "win32" })
        const withSystemTitleBar = createHarness({ platform: "linux", usesAppTitleBar: false })
        let isPrevented = false
        const event = { preventDefault: () => (isPrevented = true) }

        // Act
        onWindows.window.emit("system-context-menu", event, { x: 400, y: 70 })
        withSystemTitleBar.window.emit("system-context-menu", event, { x: 400, y: 70 })

        // Assert
        assert.equal(isPrevented, false)
        assert.deepEqual([...onWindows.sent, ...withSystemTitleBar.sent], [])
    })
})

describe("linux button order", () => {
    test("should read the order from kwinrc on KDE", async () => {
        // Arrange
        const configDir = path.join(dataDir, "config")
        fs.mkdirSync(configDir)
        fs.writeFileSync(path.join(configDir, "kwinrc"), "[org.kde.kdecoration2]\nButtonsOnLeft=X\nButtonsOnRight=AI\n")

        // Act
        const order = await readLinuxButtonOrder({
            fs,
            env: { XDG_CURRENT_DESKTOP: "KDE", XDG_CONFIG_HOME: configDir },
            homeDir: dataDir,
            execFile: async () => assert.fail("KDE needs no gsettings")
        })

        // Assert
        assert.deepEqual(order, ["close", "maximize", "minimize"])
    })

    test("should read the order from GNOME's button layout elsewhere", async () => {
        // Arrange
        const queries = []

        // Act
        const order = await readLinuxButtonOrder({
            fs,
            env: { XDG_CURRENT_DESKTOP: "ubuntu:GNOME" },
            homeDir: dataDir,
            execFile: async (file, args) => {
                queries.push([file, ...args])
                return { stdout: "'close:'\n" }
            }
        })

        // Assert
        assert.deepEqual(order, ["close", "minimize", "maximize"])
        assert.deepEqual(queries, [["gsettings", "get", "org.gnome.desktop.wm.preferences", "button-layout"]])
    })

    test("should fall back to minimize, maximize, close when the system order cannot be read", async () => {
        // Act
        const order = await readLinuxButtonOrder({
            fs,
            env: { XDG_CURRENT_DESKTOP: "KDE" },
            homeDir: path.join(dataDir, "nobody"),
            execFile: async () => {
                throw new Error("gsettings is not installed")
            }
        })
        const elsewhere = await readLinuxButtonOrder({
            fs,
            env: {},
            homeDir: dataDir,
            execFile: async () => {
                throw new Error("gsettings is not installed")
            }
        })

        // Assert
        assert.deepEqual(order, DEFAULT_ORDER)
        assert.deepEqual(elsewhere, DEFAULT_ORDER)
    })
})

describe("window frame options", () => {
    test("should open the window with the remembered title bar setting and colours", () => {
        // Arrange
        const harness = createHarness({ platform: "win32", usesAppTitleBar: false })

        // Act
        const options = harness.frameOptionsFor({ useAppTitleBar: true, titleBarColors: { color: "#ffffff", symbolColor: "#1f2328" } })

        // Assert
        assert.deepEqual(options, {
            titleBarStyle: "hidden",
            titleBarOverlay: { color: "#ffffff", symbolColor: "#1f2328", height: 48 }
        })
    })

    test("should fall back to the dark theme's colours when none are remembered", () => {
        // Arrange
        const harness = createHarness({ platform: "win32" })

        // Act
        const options = harness.frameOptionsFor({ useAppTitleBar: true, titleBarColors: { color: "red" } })

        // Assert
        assert.deepEqual(options.titleBarOverlay, { color: "#1e2329", symbolColor: "#e6e9ee", height: 48 })
    })

    test("should tell the page the button order read from the system on Linux", async () => {
        // Arrange
        const harness = createHarness({ buttonOrder: ["close", "minimize", "maximize"] })
        await Promise.resolve()

        // Act
        const state = await runAction(harness.windowActions, { kind: "windowState" })

        // Assert
        assert.deepEqual(state.value.buttonOrder, ["close", "minimize", "maximize"])
    })
})
