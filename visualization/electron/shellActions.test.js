const { afterEach, beforeEach, describe, test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createShellActions, readShellSettings, runAction } = require("./shellActions")

let dataDir

function createHarness({ pickedPaths = [], coreAnswers = {} } = {}) {
    const calls = { dialogs: [], requests: [], opened: [], shown: [], backgrounds: [], schemes: [], restarts: 0 }
    const window = { setBackgroundColor: color => calls.backgrounds.push(color) }
    const actions = createShellActions({
        dialog: {
            showOpenDialog: async (_window, options) => {
                calls.dialogs.push(options)
                return { canceled: pickedPaths.length === 0, filePaths: pickedPaths }
            }
        },
        shell: {
            openPath: async folder => {
                calls.opened.push(folder)
                return ""
            },
            showItemInFolder: filePath => calls.shown.push(filePath)
        },
        fs,
        nativeTheme: {
            set themeSource(scheme) {
                calls.schemes.push(scheme)
            }
        },
        getWindow: () => window,
        requestCore: async (method, params) => {
            calls.requests.push({ method, params })
            return coreAnswers[method] ?? { ok: true, value: null }
        },
        restartCore: () => calls.restarts++,
        dataDir,
        platform: process.platform
    })
    return { ...actions, calls }
}

beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-shell-actions-"))
})

afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true })
})

describe("dialog actions", () => {
    test("should answer null when the picker is cancelled", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const pickedFolder = await runAction(harness.dialogActions, { kind: "pickFolder", options: { title: "Folder" } })
        const chosenTool = await runAction(harness.dialogActions, { kind: "chooseToolExecutable", tool: "git", options: {} })

        // Assert
        assert.equal(pickedFolder, null)
        assert.deepEqual(chosenTool, { ok: true, value: null })
        assert.deepEqual(harness.calls.requests, [])
    })

    test("should pass a picked executable to tools.setPath", async () => {
        // Arrange
        const report = { ok: true, value: { tools: [] } }
        const harness = createHarness({ pickedPaths: ["/usr/local/bin/git"], coreAnswers: { "tools.setPath": report } })
        const options = { title: "Git", filters: [{ name: "Programs", extensions: ["exe", "cmd", "bat"] }] }

        // Act
        const answer = await runAction(harness.dialogActions, { kind: "chooseToolExecutable", tool: "git", options })

        // Assert
        assert.deepEqual(answer, report)
        assert.deepEqual(harness.calls.requests, [{ method: "tools.setPath", params: { tool: "git", path: "/usr/local/bin/git" } }])
        assert.deepEqual(harness.calls.dialogs, [{ ...options, properties: ["openFile"] }])
    })

    test("should not open a picker for malformed options", async () => {
        // Arrange
        const harness = createHarness({ pickedPaths: ["/tmp"] })

        // Act
        const pickedFile = await runAction(harness.dialogActions, { kind: "pickFile", options: { filters: "exe" } })

        // Assert
        assert.equal(pickedFile, null)
        assert.deepEqual(harness.calls.dialogs, [])
    })

    test("should refuse an unknown action", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.shellActions, { kind: "toString" })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
    })
})

describe("shell actions", () => {
    test("should reveal a missing folder through its nearest existing parent", async () => {
        // Arrange
        const missingStore = path.join(dataDir, "store", "not-yet")
        const harness = createHarness({ coreAnswers: { "shell.resolvePath": { ok: true, value: { path: missingStore } } } })

        // Act
        const answer = await runAction(harness.shellActions, { kind: "reveal", target: { kind: "storeRoot" } })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(harness.calls.opened, [dataDir])
        assert.deepEqual(harness.calls.requests, [{ method: "shell.resolvePath", params: { target: { kind: "storeRoot" } } }])
    })

    test("should read a map inside the store", async () => {
        // Arrange
        const mapPath = path.join(dataDir, "store", "map.cc.json.gz")
        fs.mkdirSync(path.dirname(mapPath))
        fs.writeFileSync(mapPath, Buffer.from([31, 139, 8]))
        const harness = createHarness({
            coreAnswers: {
                "shell.resolvePath": { ok: true, value: { path: mapPath } },
                "paths.get": { ok: true, value: { storeRoot: path.join(dataDir, "store") } }
            }
        })

        // Act
        const answer = await runAction(harness.shellActions, {
            kind: "readSnapshotMap",
            target: { projectId: "p", folderId: "f", snapshotId: "s" }
        })

        // Assert
        assert.equal(answer.ok, true)
        assert.deepEqual([...answer.value], [31, 139, 8])
        assert.deepEqual(harness.calls.requests[0].params.target, { kind: "snapshotMap", projectId: "p", folderId: "f", snapshotId: "s" })
    })

    test("should refuse to read a map the core resolves outside the data folder", async () => {
        // Arrange
        const harness = createHarness({
            coreAnswers: {
                "shell.resolvePath": { ok: true, value: { path: path.join(os.tmpdir(), "elsewhere", "map.cc.json") } },
                "paths.get": { ok: true, value: { storeRoot: path.join(dataDir, "store") } }
            }
        })

        // Act
        const answer = await runAction(harness.shellActions, {
            kind: "readSnapshotMap",
            target: { projectId: "p", folderId: "f", snapshotId: "s" }
        })

        // Assert
        assert.equal(answer.error.code, "NOT_ALLOWED")
    })

    test("should remember the window background", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.shellActions, { kind: "setWindowBackground", color: "#1e1e1e" })
        const refused = await runAction(harness.shellActions, { kind: "setWindowBackground", color: "black" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.equal(refused.error.code, "BAD_REQUEST")
        assert.deepEqual(harness.calls.backgrounds, ["#1e1e1e"])
        assert.deepEqual(readShellSettings(fs, dataDir), { windowBackgroundColor: "#1e1e1e" })
    })

    test("should follow the colour scheme and remember it", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.shellActions, { kind: "setColorScheme", scheme: "dark" })
        const refused = await runAction(harness.shellActions, { kind: "setColorScheme", scheme: "sepia" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.equal(refused.error.code, "BAD_REQUEST")
        assert.deepEqual(harness.calls.schemes, ["dark"])
        assert.deepEqual(readShellSettings(fs, dataDir), { colorScheme: "dark" })
    })

    test("should keep the remembered background when the colour scheme changes", async () => {
        // Arrange
        const harness = createHarness()
        await runAction(harness.shellActions, { kind: "setWindowBackground", color: "#1e2329" })

        // Act
        await runAction(harness.shellActions, { kind: "setColorScheme", scheme: "system" })

        // Assert
        assert.deepEqual(readShellSettings(fs, dataDir), { windowBackgroundColor: "#1e2329", colorScheme: "system" })
    })

    test("should restart the core", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await runAction(harness.shellActions, { kind: "restartCore" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.equal(harness.calls.restarts, 1)
    })
})
