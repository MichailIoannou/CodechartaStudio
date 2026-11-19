const { afterEach, beforeEach, describe, test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const contract = require("./coreMethods.generated.json")
const { createSnapshotsShell } = require("./snapshotsShell")

const SNAPSHOT_REF = { projectId: "p-1", folderId: "f-1", snapshotId: "imported-0123456789abcdef" }
const MAP_BYTES = [31, 139, 8, 0, 1, 2, 3, 4, 5, 6]
const MAX_CHUNK_BYTES = 32 * 1024 * 1024

let storeRoot

function createHarness({ pickedPaths = [], coreAnswers = {} } = {}) {
    const calls = { dialogs: [], requests: [] }
    const methods = createSnapshotsShell({
        dialog: {
            showOpenDialog: async (_window, options) => {
                calls.dialogs.push(options)
                return { canceled: pickedPaths.length === 0, filePaths: pickedPaths }
            }
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

function storedMap(mapPath) {
    return {
        "snapshots.mapLocation": { ok: true, value: { path: mapPath } },
        "paths.get": { ok: true, value: { storeRoot } }
    }
}

function writeMap(...segments) {
    const mapPath = path.join(storeRoot, ...segments)
    fs.mkdirSync(path.dirname(mapPath), { recursive: true })
    fs.writeFileSync(mapPath, Buffer.from(MAP_BYTES))
    return mapPath
}

beforeEach(() => {
    storeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cc-snapshots-shell-")))
})

afterEach(() => {
    fs.rmSync(storeRoot, { recursive: true, force: true })
})

describe("snapshots shell", () => {
    test("should not shadow a method the page may call on the core", () => {
        // Arrange
        const { methods } = createHarness()

        // Act
        const shadowed = Object.keys(methods).filter(method => contract.rendererMethods.includes(method))

        // Assert
        assert.deepEqual(shadowed, [])
    })

    test("should hand a picked file to the core and answer its import token", async () => {
        // Arrange
        const pickedFile = path.join(storeRoot, "sample.cc.json")
        const inspected = { ok: true, value: { importToken: "b".repeat(32), fileName: "sample.cc.json" } }
        const harness = createHarness({ pickedPaths: [pickedFile], coreAnswers: { "snapshots.inspectImportFile": inspected } })
        const options = { title: "Open cc.json", filters: [{ name: "cc.json", extensions: ["json", "gz"] }] }

        // Act
        const answer = await harness.methods["snapshots.pickImportFile"](options)

        // Assert
        assert.deepEqual(answer, inspected)
        assert.deepEqual(harness.calls.requests, [{ method: "snapshots.inspectImportFile", params: { path: pickedFile } }])
        assert.deepEqual(harness.calls.dialogs, [{ ...options, properties: ["openFile"] }])
    })

    test("should answer null without asking the core when the file picker is cancelled", async () => {
        // Arrange
        const harness = createHarness()

        // Act
        const answer = await harness.methods["snapshots.pickImportFile"]({ title: "Open cc.json" })

        // Assert
        assert.deepEqual(answer, { ok: true, value: null })
        assert.deepEqual(harness.calls.requests, [])
    })

    test("should refuse malformed picker options without opening a picker", async () => {
        // Arrange
        const harness = createHarness({ pickedPaths: [storeRoot] })

        // Act
        const answer = await harness.methods["snapshots.pickImportFile"]({ filters: [{ name: "cc.json", extensions: ["*.cc.json"] }] })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
        assert.deepEqual(harness.calls.dialogs, [])
    })

    test("should read a chunk of a map inside the store root", async () => {
        // Arrange
        const mapPath = writeMap("projects", "p-1", "snapshots", "f-1", "s", "map.cc.json.gz")
        const harness = createHarness({ coreAnswers: storedMap(mapPath) })

        // Act
        const answer = await harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, offset: 2, length: 4 })

        // Assert
        assert.equal(answer.ok, true)
        assert.deepEqual([...answer.value.bytes], MAP_BYTES.slice(2, 6))
        assert.equal(answer.value.offset, 2)
        assert.equal(answer.value.totalBytes, MAP_BYTES.length)
        assert.deepEqual(harness.calls.requests[0], { method: "snapshots.mapLocation", params: SNAPSHOT_REF })
    })

    test("should answer the rest of the map when the length reaches beyond its end", async () => {
        // Arrange
        const mapPath = writeMap("map.cc.json.gz")
        const harness = createHarness({ coreAnswers: storedMap(mapPath) })

        // Act
        const answer = await harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, offset: 8, length: MAX_CHUNK_BYTES })

        // Assert
        assert.deepEqual([...answer.value.bytes], MAP_BYTES.slice(8))
    })

    test("should refuse an offset beyond the end of the map", async () => {
        // Arrange
        const mapPath = writeMap("map.cc.json.gz")
        const harness = createHarness({ coreAnswers: storedMap(mapPath) })

        // Act
        const answer = await harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, offset: 11, length: 1 })

        // Assert
        assert.equal(answer.error.code, "BAD_REQUEST")
    })

    test("should refuse a chunk range that is not whole bytes or too long without asking the core", async () => {
        // Arrange
        const harness = createHarness()
        const ranges = [
            { offset: -1, length: 1 },
            { offset: 0.5, length: 1 },
            { offset: "0", length: 1 },
            { offset: 0, length: 0 },
            { offset: 0, length: MAX_CHUNK_BYTES + 1 }
        ]

        // Act
        const answers = await Promise.all(ranges.map(range => harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, ...range })))

        // Assert
        assert.deepEqual(
            answers.map(answer => answer.error.code),
            ranges.map(() => "BAD_REQUEST")
        )
        assert.deepEqual(harness.calls.requests, [])
    })

    test("should refuse a map the core resolves outside the store root", async () => {
        // Arrange
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-outside-"))
        const outsideMap = path.join(outsideDir, "map.cc.json.gz")
        fs.writeFileSync(outsideMap, Buffer.from(MAP_BYTES))
        const harness = createHarness({ coreAnswers: storedMap(outsideMap) })

        // Act
        const answer = await harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, offset: 0, length: 4 })
        fs.rmSync(outsideDir, { recursive: true, force: true })

        // Assert
        assert.equal(answer.error.code, "NOT_ALLOWED")
    })

    test("should refuse a map that a symlink leads out of the store root", { skip: process.platform === "win32" }, async () => {
        // Arrange
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-outside-"))
        const outsideMap = path.join(outsideDir, "secret.cc.json.gz")
        fs.writeFileSync(outsideMap, Buffer.from(MAP_BYTES))
        const linkedMap = path.join(storeRoot, "map.cc.json.gz")
        fs.symlinkSync(outsideMap, linkedMap)
        const harness = createHarness({ coreAnswers: storedMap(linkedMap) })

        // Act
        const answer = await harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, offset: 0, length: 4 })
        fs.rmSync(outsideDir, { recursive: true, force: true })

        // Assert
        assert.equal(answer.error.code, "NOT_ALLOWED")
    })

    test("should pass on the core's refusal to locate a map", async () => {
        // Arrange
        const refusal = { ok: false, error: { code: "NOT_FOUND", message: "no such snapshot", details: {} } }
        const harness = createHarness({
            coreAnswers: { "snapshots.mapLocation": refusal, "paths.get": { ok: true, value: { storeRoot } } }
        })

        // Act
        const answer = await harness.methods["snapshots.readMapChunk"]({ ...SNAPSHOT_REF, offset: 0, length: 4 })

        // Assert
        assert.deepEqual(answer, refusal)
    })
})
