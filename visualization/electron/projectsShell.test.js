const { afterEach, beforeEach, describe, test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const contract = require("./coreMethods.generated.json")
const { createProjectsShell } = require("./projectsShell")

const FOLDER_REF = { projectId: "p-1", folderId: "f-1" }

let workDir

function createHarness({ pickedPaths = [], coreAnswers = {} } = {}) {
    const calls = { dialogs: [], requests: [], opened: [], shown: [] }
    const methods = createProjectsShell({
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
        getWindow: () => null,
        requestCore: async (method, params) => {
            calls.requests.push({ method, params })
            return coreAnswers[method] ?? { ok: true, value: null }
        },
        platform: process.platform
    })
    return { methods, calls }
}

function sourceFileAnswer(filePath, folderRoot, sizeBytes) {
    return { ok: true, value: { location: { path: filePath, folderRoot, sizeBytes } } }
}

beforeEach(() => {
    workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cc-projects-shell-")))
})

afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
})

describe("projects shell", () => {
    test("should not shadow a method the page may call on the core", () => {
        // Arrange
        const { methods } = createHarness()

        // Act
        const shadowed = Object.keys(methods).filter(method => contract.rendererMethods.includes(method))

        // Assert
        assert.deepEqual(shadowed, [])
    })

    test("should hand a picked folder to the core and answer its pick token", async () => {
        // Arrange
        const pickedFolder = { pickToken: "a".repeat(32), path: workDir, suggestedLabel: "work", kind: "plain", git: null }
        const harness = createHarness({
            pickedPaths: [workDir],
            coreAnswers: { "projects.inspectFolder": { ok: true, value: pickedFolder } }
        })

        // Act
        const answer = await harness.methods["projects.pickFolder"]({ title: "Add Folder" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: pickedFolder })
        assert.deepEqual(harness.calls.requests, [{ method: "projects.inspectFolder", params: { path: workDir } }])
        assert.deepEqual(harness.calls.dialogs, [
            { title: "Add Folder", filters: undefined, properties: ["openDirectory", "createDirectory"] }
        ])
    })

    test("should answer null without asking the core when the folder picker is cancelled", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await harness.methods["projects.pickFolder"]({ title: "Add Folder" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(harness.calls.requests, [])
    })

    test("should refuse malformed picker options without opening a picker", async () => {
        // Arrange
        const harness = createHarness({ pickedPaths: [workDir] })

        // Act
        const answer = await harness.methods["projects.pickFolder"]({ title: 42 })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
        assert.deepEqual(harness.calls.dialogs, [])
    })

    test("should read a source file the core locates inside its folder", async () => {
        // Arrange
        const filePath = path.join(workDir, "src", "app.ts")
        fs.mkdirSync(path.dirname(filePath))
        fs.writeFileSync(filePath, "export {}")
        const harness = createHarness({ coreAnswers: { "projects.sourceFileLocation": sourceFileAnswer(filePath, workDir, 9) } })

        // Act
        const answer = await harness.methods["projects.readSourceFile"]({ ...FOLDER_REF, relativePath: "src/app.ts", extra: "x" })

        // Assert
        assert.equal(answer.ok, true)
        assert.equal(Buffer.from(answer.value.bytes).toString("utf8"), "export {}")
        assert.deepEqual(harness.calls.requests, [
            { method: "projects.sourceFileLocation", params: { ...FOLDER_REF, relativePath: "src/app.ts" } }
        ])
    })

    test("should read no more than the size the core reported", async () => {
        // Arrange
        const filePath = path.join(workDir, "grown.txt")
        fs.writeFileSync(filePath, "0123456789")
        const harness = createHarness({ coreAnswers: { "projects.sourceFileLocation": sourceFileAnswer(filePath, workDir, 4) } })

        // Act
        const answer = await harness.methods["projects.readSourceFile"]({ ...FOLDER_REF, relativePath: "grown.txt" })

        // Assert
        assert.equal(Buffer.from(answer.value.bytes).toString("utf8"), "0123")
    })

    test("should answer null for a source file the working tree does not have", async () => {
        // Arrange
        const harness = createHarness({ coreAnswers: { "projects.sourceFileLocation": { ok: true, value: { location: null } } } })

        // Act
        const answer = await harness.methods["projects.readSourceFile"]({ ...FOLDER_REF, relativePath: "gone.ts" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
    })

    test("should pass on the core's refusal to locate a source file", async () => {
        // Arrange
        const refusal = { ok: false, error: { code: "TOO_LARGE", message: "too large", details: { limitBytes: 1 } } }
        const harness = createHarness({ coreAnswers: { "projects.sourceFileLocation": refusal } })

        // Act
        const answer = await harness.methods["projects.readSourceFile"]({ ...FOLDER_REF, relativePath: "big.bin" })

        // Assert
        assert.deepEqual(answer, refusal)
    })

    test("should refuse a source file that lies outside its folder", async () => {
        // Arrange
        const folderRoot = path.join(workDir, "repo")
        const outsideFile = path.join(workDir, "secret.txt")
        fs.mkdirSync(folderRoot)
        fs.writeFileSync(outsideFile, "secret")
        const harness = createHarness({ coreAnswers: { "projects.sourceFileLocation": sourceFileAnswer(outsideFile, folderRoot, 6) } })

        // Act
        const answer = await harness.methods["projects.readSourceFile"]({ ...FOLDER_REF, relativePath: "../secret.txt" })

        // Assert
        assert.equal(answer.error.code, "NOT_ALLOWED")
    })

    test("should refuse a source file that a symlink leads out of its folder", { skip: process.platform === "win32" }, async () => {
        // Arrange
        const folderRoot = path.join(workDir, "repo")
        const outsideFile = path.join(workDir, "secret.txt")
        const linkPath = path.join(folderRoot, "link.txt")
        fs.mkdirSync(folderRoot)
        fs.writeFileSync(outsideFile, "secret")
        fs.symlinkSync(outsideFile, linkPath)
        const harness = createHarness({ coreAnswers: { "projects.sourceFileLocation": sourceFileAnswer(linkPath, folderRoot, 6) } })

        // Act
        const answer = await harness.methods["projects.readSourceFile"]({ ...FOLDER_REF, relativePath: "link.txt" })

        // Assert
        assert.equal(answer.error.code, "NOT_ALLOWED")
    })

    test("should reveal a project folder the core resolves", async () => {
        // Arrange
        const harness = createHarness({ coreAnswers: { "projects.folderPath": { ok: true, value: { path: workDir } } } })

        // Act
        const answer = await harness.methods["projects.revealFolder"]({ ...FOLDER_REF, path: "/elsewhere" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(harness.calls.opened, [workDir])
        assert.deepEqual(harness.calls.requests, [{ method: "projects.folderPath", params: FOLDER_REF }])
    })

    test("should reveal nothing when the core refuses the folder", async () => {
        // Arrange
        const refusal = { ok: false, error: { code: "NOT_FOUND", message: "no such folder", details: {} } }
        const harness = createHarness({ coreAnswers: { "projects.folderPath": refusal } })

        // Act
        const answer = await harness.methods["projects.revealFolder"](FOLDER_REF)

        // Assert
        assert.deepEqual(answer, refusal)
        assert.deepEqual(harness.calls.opened, [])
    })
})
