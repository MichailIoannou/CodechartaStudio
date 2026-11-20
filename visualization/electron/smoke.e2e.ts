import { spawn } from "node:child_process"
import { once } from "node:events"
import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron, ElectronApplication, expect, Page, test } from "@playwright/test"

const BUNDLE_FOLDER = join(__dirname, "..", "dist", "bundler", "browser")
const BOOT_TIMEOUT_MS = 60_000
const SECOND_INSTANCE_TIMEOUT_MS = 20_000
const DOCTOR_TIMEOUT_MS = 60_000
const TOOL_COUNT = 5
const SAMPLE_MAP = join(__dirname, "..", "app", "codeCharta", "assets", "sample1.cc.json")
const MAP_CHUNK_BYTES = 16 * 1024 * 1024
const GZIP_MAGIC_BYTES = [31, 139]
const BRIDGE_KEYS = [
    "cancel",
    "chooseStoreRoot",
    "chooseToolExecutable",
    "openDroppedFile",
    "pickFile",
    "pickFolder",
    "protocolVersion",
    "request",
    "restartCore",
    "reveal",
    "setColorScheme",
    "setWindowBackground",
    "subscribe"
]

// CI runners have no GPU, and Electron no longer falls back to software WebGL by itself: without this
// switch the map is never drawn and its loading overlay covers the window.
const SOFTWARE_WEBGL_SWITCH = "--enable-unsafe-swiftshader"

let userDataDir: string
let desktopApp: ElectronApplication

function desktopEnv(extraEnv: Record<string, string> = {}) {
    return { ...process.env, CODECHARTA_USER_DATA_DIR: userDataDir, ...extraEnv }
}

async function launchDesktopApp(extraEnv: Record<string, string> = {}) {
    return _electron.launch({ args: [SOFTWARE_WEBGL_SWITCH, BUNDLE_FOLDER], env: desktopEnv(extraEnv) })
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

async function pickWithTheNativeDialog(pickedPath: string) {
    await desktopApp.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, pickedPath)
}

test("should create and list a project from a picked folder", async () => {
    // Arrange
    const page = await bootedWindow()
    const projectFolder = join(userDataDir, "work", "demo")
    await mkdir(join(projectFolder, "src"), { recursive: true })
    await writeFile(join(projectFolder, "src", "app.ts"), "export {}")
    await pickWithTheNativeDialog(projectFolder)
    await desktopApp.evaluate(({ shell }) => {
        const opened: string[] = []
        ;(globalThis as any).openedFolders = opened
        shell.openPath = async folder => {
            opened.push(folder)
            return ""
        }
    })

    // Act
    const observed = await page.evaluate(async () => {
        const bridge = (window as any).codeChartaDesktop
        const picked = await bridge.request("projects.pickFolder", { title: "Add Folder" })
        const folder = { pickToken: picked.value.pickToken, label: picked.value.suggestedLabel, role: "primary" }
        const created = await bridge.request("projects.create", { name: "Demo", folders: [folder] })
        const listed = await bridge.request("projects.list", {})
        const folderRef = { projectId: created.value.id, folderId: created.value.folders[0].id }
        const sourceFile = await bridge.request("projects.readSourceFile", { ...folderRef, relativePath: "src/app.ts" })
        await bridge.request("projects.revealFolder", folderRef)
        return {
            picked: picked.value,
            projectNames: listed.value.projects.map((project: any) => project.name),
            sourceText: new TextDecoder().decode(sourceFile.value.bytes)
        }
    })

    // Assert
    expect(observed.picked).toMatchObject({ suggestedLabel: "demo", kind: "plain" })
    expect(observed.picked.pickToken).toMatch(/^[0-9a-f]{32}$/)
    expect(observed.projectNames).toEqual(["Demo"])
    expect(observed.sourceText).toBe("export {}")
    expect(await desktopApp.evaluate(() => (globalThis as any).openedFolders)).toEqual([projectFolder])
})

test("should refuse the shell-only project methods from the page", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    const answers = await page.evaluate(async () => {
        const bridge = (window as any).codeChartaDesktop
        const folderRef = { projectId: "p-1", folderId: "f-1" }
        return [
            await bridge.request("projects.inspectFolder", { path: "/" }),
            await bridge.request("projects.folderPath", folderRef),
            await bridge.request("projects.sourceFileLocation", { ...folderRef, relativePath: "a" })
        ]
    })

    // Assert
    expect(answers.map(answer => answer.error.code)).toEqual(["NOT_ALLOWED", "NOT_ALLOWED", "NOT_ALLOWED"])
})

test("should open a picked cc.json file into a project and read its stored map", async () => {
    // Arrange
    const page = await bootedWindow()
    const importFile = join(userDataDir, "imports", "assets", "sample1.cc.json")
    await mkdir(join(userDataDir, "imports", "assets"), { recursive: true })
    await copyFile(SAMPLE_MAP, importFile)
    await pickWithTheNativeDialog(importFile)

    // Act
    const observed = await page.evaluate(async chunkBytes => {
        const bridge = (window as any).codeChartaDesktop
        const openPickedFile = async () => {
            const options = { title: "Open cc.json", filters: [{ name: "cc.json", extensions: ["json", "gz"] }] }
            const picked = await bridge.request("snapshots.pickImportFile", options)
            const opened = await bridge.request("snapshots.openFile", {
                importToken: picked.value.importToken,
                target: null,
                bindToCommit: null
            })
            return opened.value
        }
        const opened = await openPickedFile()
        const openedAgain = await openPickedFile()
        const chunk = await bridge.request("snapshots.readMapChunk", { ...opened.snapshot.ref, offset: 0, length: chunkBytes })
        return {
            projectName: opened.project.name,
            createdProject: opened.createdProject,
            wasAlreadyImported: openedAgain.wasAlreadyImported,
            leadingBytes: [...chunk.value.bytes.slice(0, 2)],
            chunkLength: chunk.value.bytes.length,
            totalBytes: chunk.value.totalBytes,
            mapBytes: opened.snapshot.mapBytes
        }
    }, MAP_CHUNK_BYTES)

    // Assert
    expect(observed).toMatchObject({ projectName: "assets", createdProject: true, wasAlreadyImported: true })
    expect(observed.leadingBytes).toEqual(GZIP_MAGIC_BYTES)
    expect(observed.chunkLength).toBe(observed.totalBytes)
    expect(observed.totalBytes).toBe(observed.mapBytes)
})

test("should refuse the shell-only snapshot methods from the page", async () => {
    // Arrange
    const page = await bootedWindow()

    // Act
    const answers = await page.evaluate(async () => {
        const bridge = (window as any).codeChartaDesktop
        const snapshotRef = { projectId: "p-1", folderId: "f-1", snapshotId: "s-1" }
        return [
            await bridge.request("snapshots.inspectImportFile", { path: "/etc/passwd" }),
            await bridge.request("snapshots.mapLocation", snapshotRef)
        ]
    })

    // Assert
    expect(answers.map(answer => answer.error.code)).toEqual(["NOT_ALLOWED", "NOT_ALLOWED"])
})

test("should copy the store into a picked folder and serve it without a restart", async () => {
    // Arrange
    const page = await bootedWindow()
    const chosenFolder = join(userDataDir, "elsewhere")
    await mkdir(chosenFolder)
    await pickWithTheNativeDialog(chosenFolder)

    // Act
    const observed = await page.evaluate(async () => {
        const bridge = (window as any).codeChartaDesktop
        const changed = await bridge.chooseStoreRoot({ title: "Choose the store folder" })
        const status = await bridge.request("store.status", {})
        const refused = await bridge.request("store.changeRoot", { path: "/" })
        return { changed: changed.value, problem: status.value.problem, refusedCode: refused.error.code }
    })

    // Assert
    expect(observed.changed).toMatchObject({ storeRoot: chosenFolder, isDefaultStoreRoot: false })
    expect(observed.problem).toBeNull()
    expect(observed.refusedCode).toBe("NOT_ALLOWED")
    await access(join(chosenFolder, "store.json"))
    await access(join(userDataDir, "store", "store.json"))
})

test("should inspect a dropped cc.json file once the native confirmation is accepted", async () => {
    // Arrange
    const page = await bootedWindow()
    const droppedFile = join(userDataDir, "dropped", "sample1.cc.json")
    await mkdir(join(userDataDir, "dropped"), { recursive: true })
    await copyFile(SAMPLE_MAP, droppedFile)
    await desktopApp.evaluate(({ dialog }) => {
        ;(globalThis as any).confirmations = []
        dialog.showMessageBox = (async (_window: unknown, options: { message: string }) => {
            ;(globalThis as any).confirmations.push(options.message)
            return { response: 0, checkboxChecked: false }
        }) as any
    })
    await page.evaluate(() => {
        const input = document.createElement("input")
        input.type = "file"
        input.id = "smoke-dropped-file"
        document.body.append(input)
    })
    await page.setInputFiles("#smoke-dropped-file", droppedFile)

    // Act
    const picked = await page.evaluate(async () => {
        const input = document.getElementById("smoke-dropped-file") as HTMLInputElement
        const answer = await (window as any).codeChartaDesktop.openDroppedFile((input.files as FileList)[0])
        return answer.value
    })

    // Assert
    expect(picked).toMatchObject({ fileName: "sample1.cc.json", containingFolder: { suggestedName: "dropped" } })
    expect(await desktopApp.evaluate(() => (globalThis as any).confirmations)).toEqual([
        `Open 'sample1.cc.json' from '${join(userDataDir, "dropped")}'?`
    ])
})
