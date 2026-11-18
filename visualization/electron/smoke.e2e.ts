import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron, ElectronApplication, expect, Page, test } from "@playwright/test"

const BUNDLE_FOLDER = join(__dirname, "..", "dist", "bundler", "browser")
const BOOT_TIMEOUT_MS = 60_000

let userDataDir: string
let desktopApp: ElectronApplication

async function launchDesktopApp(extraEnv: Record<string, string> = {}) {
    return _electron.launch({
        args: [BUNDLE_FOLDER],
        env: { ...process.env, CODECHARTA_USER_DATA_DIR: userDataDir, ...extraEnv }
    })
}

async function waitForBoot(page: Page) {
    await page.locator("cc-code-charta > *").first().waitFor({ state: "attached", timeout: BOOT_TIMEOUT_MS })
    await page.locator("#loading-gif-file").waitFor({ state: "hidden", timeout: BOOT_TIMEOUT_MS })
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
    desktopApp = await launchDesktopApp()
    const page = await desktopApp.firstWindow()
    await waitForBoot(page)

    // Act
    const nodeGlobals = await page.evaluate(() => ({
        require: typeof (window as any).require,
        process: typeof (window as any).process,
        module: typeof (window as any).module
    }))

    // Assert
    expect(nodeGlobals).toEqual({ require: "undefined", process: "undefined", module: "undefined" })
})
