const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const { PassThrough } = require("node:stream")
const { CoreClient } = require("./coreClient")

const PROTOCOL_VERSION = 1
const CORE_EXECUTABLE = "/opt/codecharta/resources/codecharta-core"

function createFakeChild() {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.written = []
    child.isStdinClosed = false
    child.killCount = 0
    child.stdin.setEncoding("utf8")
    child.stdin.on("data", text =>
        child.written.push(
            ...text
                .split("\n")
                .filter(line => line.length > 0)
                .map(line => JSON.parse(line))
        )
    )
    child.stdin.on("finish", () => {
        child.isStdinClosed = true
    })
    child.kill = () => {
        child.killCount++
        return true
    }
    child.reply = message => child.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
    return child
}

function createHarness() {
    const children = []
    const timers = []
    const logLines = []
    const client = new CoreClient({
        executable: CORE_EXECUTABLE,
        args: ["serve", "--data-dir", "/tmp/data"],
        spawn: () => {
            const child = createFakeChild()
            children.push(child)
            return child
        },
        logStream: { write: text => logLines.push(String(text)) },
        now: () => 0,
        setTimeout: (callback, delayMs) => {
            const timer = { callback, delayMs, isCleared: false }
            timers.push(timer)
            return timer
        },
        clearTimeout: timer => {
            if (timer) {
                timer.isCleared = true
            }
        },
        clientName: "test-shell",
        protocolVersion: PROTOCOL_VERSION
    })
    const states = []
    client.on("state", change => states.push(change.state))
    const latestChild = () => children.at(-1)
    const runTimer = delayMs => timers.find(timer => timer.delayMs === delayMs && !timer.isCleared).callback()
    return { client, children, timers, states, logLines, latestChild, runTimer }
}

async function flush() {
    await new Promise(resolve => setImmediate(resolve))
}

async function startReady(harness) {
    harness.client.start()
    const hello = harness.latestChild().written[0]
    harness.latestChild().reply({
        id: hello.id,
        result: { coreVersion: "0.1.0", protocolVersion: PROTOCOL_VERSION, platform: "linux", dataDir: "/tmp/data" }
    })
    await flush()
}

describe("CoreClient", () => {
    test("should send hello before other requests", async () => {
        // Arrange
        const harness = createHarness()
        harness.client.start()

        // Act
        harness.client.request("core.ping", {})
        await flush()
        const writtenBeforeHello = harness.latestChild().written.map(message => message.method)
        const hello = harness.latestChild().written[0]
        harness.latestChild().reply({
            id: hello.id,
            result: { coreVersion: "0.1.0", protocolVersion: PROTOCOL_VERSION, platform: "linux", dataDir: "/tmp/data" }
        })
        await flush()

        // Assert
        assert.deepEqual(writtenBeforeHello, ["core.hello"])
        assert.deepEqual(hello.params, { clientName: "test-shell", protocolVersion: PROTOCOL_VERSION })
        assert.deepEqual(
            harness.latestChild().written.map(message => message.method),
            ["core.hello", "core.ping"]
        )
        assert.deepEqual(harness.states, ["starting", "ready"])
    })

    test("should match responses by id out of order", async () => {
        // Arrange
        const harness = createHarness()
        await startReady(harness)
        const first = harness.client.request("paths.get", {})
        const second = harness.client.request("core.ping", {})
        await flush()

        // Act
        harness.latestChild().reply({ id: second.id, result: { coreVersion: "0.1.0" } })
        harness
            .latestChild()
            .reply({ id: first.id, error: { code: -32000, message: "gone", data: { code: "NOT_FOUND", message: "gone", details: {} } } })

        // Assert
        assert.deepEqual(await second.promise, { ok: true, value: { coreVersion: "0.1.0" } })
        assert.deepEqual(await first.promise, { ok: false, error: { code: "NOT_FOUND", message: "gone", details: {} } })
    })

    test("should emit notifications", async () => {
        // Arrange
        const harness = createHarness()
        await startReady(harness)
        const notifications = []
        harness.client.on("notification", (method, params) => notifications.push({ method, params }))

        // Act
        harness
            .latestChild()
            .reply({ method: "core.progress", params: { requestId: 3, message: "Checked 1 of 5 tools", done: 1, total: 5 } })
        await flush()

        // Assert
        assert.deepEqual(notifications, [
            { method: "core.progress", params: { requestId: 3, message: "Checked 1 of 5 tools", done: 1, total: 5 } }
        ])
    })

    test("should resolve pending requests as core unavailable on exit", async () => {
        // Arrange
        const harness = createHarness()
        await startReady(harness)
        const pending = harness.client.request("tools.doctor", { refresh: true })

        // Act
        harness.latestChild().emit("exit", 1, null)
        const outcome = await pending.promise

        // Assert
        assert.equal(outcome.ok, false)
        assert.equal(outcome.error.code, "CORE_UNAVAILABLE")
    })

    test("should restart with backoff", async () => {
        // Arrange
        const harness = createHarness()
        await startReady(harness)

        // Act
        harness.latestChild().emit("exit", 1, null)
        const restartDelays = harness.timers.map(timer => timer.delayMs)
        harness.runTimer(500)

        // Assert
        assert.deepEqual(restartDelays, [500])
        assert.equal(harness.children.length, 2)
        assert.deepEqual(harness.states, ["starting", "ready", "restarting", "starting"])
        assert.equal(harness.latestChild().written[0].method, "core.hello")
    })

    test("should report unavailable on protocol mismatch", async () => {
        // Arrange
        const harness = createHarness()
        harness.client.start()
        const hello = harness.latestChild().written[0]

        // Act
        harness.latestChild().reply({
            id: hello.id,
            error: { code: -32000, message: "mismatch", data: { code: "PROTOCOL_MISMATCH", message: "mismatch", details: {} } }
        })
        await flush()
        harness.latestChild().emit("exit", 0, null)

        // Assert
        assert.deepEqual(harness.states, ["starting", "unavailable"])
        assert.equal(harness.latestChild().isStdinClosed, true)
        assert.equal(harness.timers.length, 0)
    })

    test("should close stdin and kill after the grace period on stop", async () => {
        // Arrange
        const harness = createHarness()
        await startReady(harness)
        const child = harness.latestChild()

        // Act
        const stopped = harness.client.stop()
        await flush()
        const wasKilledBeforeGrace = child.killCount > 0
        harness.runTimer(5000)
        child.emit("exit", null, "SIGTERM")
        await stopped

        // Assert
        assert.equal(child.isStdinClosed, true)
        assert.equal(wasKilledBeforeGrace, false)
        assert.equal(child.killCount, 1)
        assert.equal(harness.states.at(-1), "stopped")
    })

    test("should report unavailable with the path when the core is missing", async () => {
        // Arrange
        const harness = createHarness()
        harness.client.start()
        const pending = harness.client.request("core.ping", {})

        // Act
        harness.latestChild().emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))

        // Assert
        assert.deepEqual(harness.states, ["starting", "unavailable"])
        assert.match(harness.client.currentState().message, /codecharta-core/)
        assert.equal((await pending.promise).error.code, "CORE_UNAVAILABLE")
        assert.equal(harness.timers.length, 0)
    })

    test("should send core.cancel for a running request", async () => {
        // Arrange
        const harness = createHarness()
        await startReady(harness)
        const running = harness.client.request("tools.doctor", { refresh: true })
        await flush()

        // Act
        harness.client.cancel(running.id)
        await flush()

        // Assert
        assert.deepEqual(harness.latestChild().written.at(-1), { jsonrpc: "2.0", method: "core.cancel", params: { id: running.id } })
    })

    test("should write the core log to the log stream", async () => {
        // Arrange
        const harness = createHarness()
        harness.client.start()

        // Act
        harness.latestChild().stderr.write("INFO serving\n")
        await flush()

        // Assert
        assert.deepEqual(harness.logLines, ["INFO serving\n"])
    })

    test("should start again from unavailable when restarted", async () => {
        // Arrange
        const harness = createHarness()
        harness.client.start()
        harness.latestChild().emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))

        // Act
        harness.client.restart()

        // Assert
        assert.equal(harness.children.length, 2)
        assert.deepEqual(harness.states, ["starting", "unavailable", "starting"])
    })
})
