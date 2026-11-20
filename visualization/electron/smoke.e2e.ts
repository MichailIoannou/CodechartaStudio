import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron, ElectronApplication, expect, Page, test } from "@playwright/test"

const BUNDLE_FOLDER = join(__dirname, "..", "dist", "bundler", "browser")
const BOOT_TIMEOUT_MS = 60_000
const SECOND_INSTANCE_TIMEOUT_MS = 20_000
const DOCTOR_TIMEOUT_MS = 60_000
const TOOL_COUNT = 5
const BRIDGE_KEYS = [
    "cancel",
    "chooseStoreRoot",
    "chooseToolExecutable",
    "pickFile",
    "pickFolder",
    "protocolVersion",
    "readSnapshotMap",
    "request",
    "restartCore",
    "reveal",
    "setWindowBackground",
    "subscribe"
]

let userDataDir: string
let desktopApp: ElectronApplication

function desktopEnv(extraEnv: Record<string, string> = {}) {
    return { ...process.env, CODECHARTA_USER_DATA_DIR: userDataDir, ...extraEnv }
}

async function launchDesktopApp(extraEnv: Record<string, string> = {}) {
    return _electron.launch({ args: [BUNDLE_FOLDER], env: desktopEnv(extraEnv) })
}

async function waitForBoot(page: Page) {
    await page.locator("cc-code-charta > *").first().waitFor({ state: "attached", timeout: BOOT_TIMEOUT_MS })
    await page.locator("#loading-gif-file").waitFor({ state: "hidden", timeout: BOOT_TIMEOUT_MS })
}

async function bootedWindow(extraEnv: Record<string, string> = {}) {
    desktopApp = await launchDesktopApp(extraEnv)
    const page = await desktopApp.firstWindow()
    await waitForBoot(page)
    return page
}

test.beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "cc-desktop-e2e-"))
})

test.afterEach(async () => {
    await desktopApp?.close()
    await rm(userDataDir, { recursive: true, force: true })
})

test("should open one window that boots the app", async () => {
    // Arrange
    desktopApp = await launchDesktopApp()

    // Act
    const page = await desktopApp.firstWindow()
    await waitForBoot(page)

    // Assert
    expect(desktopApp.windows()).toHaveLength(1)
    await expect(page.locator("cc-code-charta")).toBeAttached()
})

test("should keep Node out of the page", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    const nodeGlobals = await page.evaluate(() => ({
        require: typeof (window as any).require,
        process: typeof (window as any).process,
        module: typeof (window as any).module
    }))

    // Assert
    expect(nodeGlobals).toEqual({ require: "undefined", process: "undefined", module: "undefined" })
})

test("should answer core.ping through the bridge", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    const answer = await page.evaluate(() => (window as any).codeChartaDesktop.request("core.ping", {}))

    // Assert
    expect(answer.ok).toBe(true)
    expect(typeof answer.value.coreVersion).toBe("string")
})

test("should expose nothing but the bridge", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    const exposed = await page.evaluate(() => ({
        bridgeKeys: Object.keys((window as any).codeChartaDesktop).sort(),
        ipcRenderer: typeof (window as any).ipcRenderer,
        electron: typeof (window as any).electron
    }))

    // Assert
    expect(exposed).toEqual({ bridgeKeys: BRIDGE_KEYS, ipcRenderer: "undefined", electron: "undefined" })
})

test("should refuse a method outside the allow-list", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    const answer = await page.evaluate(() =>
        (window as any).codeChartaDesktop.request("tools.setPath", { tool: "git", path: "/usr/bin/false" })
    )

    // Assert
    expect(answer).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } })
})

test("should refuse a second instance on the same data folder", async () => {
    // Arrange
    await bootedWindow()
    const electronExecutable = await desktopApp.evaluate(() => process.execPath)

    // Act
    const secondInstance = spawn(electronExecutable, [BUNDLE_FOLDER], { env: desktopEnv(), stdio: "ignore" })
    const [exitCode] = await Promise.race([
        once(secondInstance, "exit"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("second instance kept running")), SECOND_INSTANCE_TIMEOUT_MS))
    ])

    // Assert
    expect(exitCode).toBe(0)
    expect(desktopApp.windows()).toHaveLength(1)
})

test("should show the core as unavailable when the binary is missing", async () => {
    // Arrange
    const page = await bootedWindow({ CODECHARTA_CORE_PATH: join(userDataDir, "missing", "codecharta-core") })

    // Act
    const observed = await page.evaluate(async () => {
        const bridge = (window as any).codeChartaDesktop
        const coreState = await new Promise<any>(resolve => bridge.subscribe("shell.coreState", resolve))
        const answer = await bridge.request("core.ping", {})
        return { coreState, answer }
    })

    // Assert
    expect(observed.coreState.state).toBe("unavailable")
    expect(observed.coreState.message).toContain("codecharta-core")
    expect(observed.answer).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } })
})

test("should answer null when the native picker is cancelled", async () => {
    // Arrange
    const page = await bootedWindow()
    await desktopApp.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
    })

    // Act
    const answers = await page.evaluate(async () => {
        const bridge = (window as any).codeChartaDesktop
        return { folder: await bridge.pickFolder({ title: "Folder" }), tool: await bridge.chooseToolExecutable("git", {}) }
    })

    // Assert
    expect(answers).toEqual({ folder: null, tool: { ok: true, value: null } })
})

test("should hand a picked executable to the core", async () => {
    // Arrange
    const page = await bootedWindow()
    const pickedFile = join(userDataDir, "not-a-tool")
    await desktopApp.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, pickedFile)

    // Act
    const answer = await page.evaluate(() => (window as any).codeChartaDesktop.chooseToolExecutable("git", { title: "Tool" }))

    // Assert
    expect(answer.ok).toBe(false)
    expect(answer.error.code).not.toBe("NOT_ALLOWED")
    expect(answer.error.details).toBeDefined()
})

test("should list five tools from the real core", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    await page.getByRole("button", { name: "Settings", exact: true, description: "Global Configuration" }).click()

    // Assert
    await expect(page.getByTestId("desktop-tools").getByTestId("desktop-tool-name")).toHaveCount(TOOL_COUNT, {
        timeout: DOCTOR_TIMEOUT_MS
    })
})
