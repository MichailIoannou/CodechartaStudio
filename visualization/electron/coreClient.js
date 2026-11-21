const { EventEmitter } = require("node:events")
const { planCoreRestart } = require("./shellPolicy")

const STOP_GRACE_MS = 5000
const JSON_RPC_VERSION = "2.0"
const HELLO_METHOD = "core.hello"
const CANCEL_METHOD = "core.cancel"
const PROTOCOL_MISMATCH = "PROTOCOL_MISMATCH"

function failure(code, message) {
    return { ok: false, error: { code, message, details: {} } }
}

function coreUnavailable() {
    return failure("CORE_UNAVAILABLE", "The core is not running.")
}

function toOutcome(response) {
    if (response.error === undefined) {
        return { ok: true, value: response.result }
    }
    const payload = response.error.data
    return payload?.code ? { ok: false, error: payload } : failure("INTERNAL", response.error.message)
}

class CoreClient extends EventEmitter {
    #options
    #child = null
    #helloId = null
    #nextId = 1
    #pending = new Map()
    #failureTimes = []
    #restartTimer = null
    #stopping = null
    #state = { state: "stopped", message: null }

    constructor(options) {
        super()
        this.#options = options
    }

    currentState() {
        return this.#state
    }

    start() {
        this.#setState("starting", null)
        const child = this.#options.spawn(this.#options.executable, this.#options.args, { stdio: "pipe", windowsHide: true })
        this.#child = child
        this.#listenTo(child)
        this.#helloId = this.#takeId()
        this.#write({ id: this.#helloId, method: HELLO_METHOD, params: this.#helloParams() })
    }

    request(method, params) {
        const id = this.#takeId()
        const promise = new Promise(resolve => this.#pending.set(id, { method, params, resolve, isSent: false }))
        if (this.#state.state === "ready") {
            this.#send(id)
        } else if (this.#state.state === "unavailable" || this.#state.state === "stopped") {
            this.#settle(id, coreUnavailable())
        }
        return { id, promise }
    }

    cancel(id) {
        const entry = this.#pending.get(id)
        if (entry === undefined) {
            return
        }
        if (entry.isSent) {
            this.#write({ method: CANCEL_METHOD, params: { id } })
        } else {
            this.#settle(id, failure("CANCELLED", "The request was cancelled."))
        }
    }

    restart() {
        if (this.#state.state !== "unavailable") {
            return
        }
        this.#failureTimes = []
        this.start()
    }

    stop() {
        this.#options.clearTimeout(this.#restartTimer)
        if (this.#child === null) {
            this.#setState("stopped", null)
            return Promise.resolve()
        }
        const child = this.#child
        this.#stopping = new Promise(resolve => {
            const killTimer = this.#options.setTimeout(() => child.kill(), STOP_GRACE_MS)
            child.once("exit", () => {
                this.#options.clearTimeout(killTimer)
                resolve()
            })
        })
        child.stdin.end()
        return this.#stopping
    }

    #helloParams() {
        return { clientName: this.#options.clientName, protocolVersion: this.#options.protocolVersion }
    }

    #takeId() {
        return this.#nextId++
    }

    #listenTo(child) {
        let unreadText = ""
        child.stdout.setEncoding("utf8")
        child.stdout.on("data", text => {
            const lines = (unreadText + text).split("\n")
            unreadText = lines.pop()
            for (const line of lines) {
                this.#handleLine(line)
            }
        })
        child.stderr.on("data", chunk => this.#options.logStream.write(chunk))
        child.stdin.on("error", () => {})
        child.on("error", error => this.#handleSpawnError(child, error))
        child.on("exit", () => this.#handleExit(child))
    }

    #handleLine(line) {
        if (line.trim().length === 0) {
            return
        }
        let message
        try {
            message = JSON.parse(line)
        } catch {
            this.#options.logStream.write(`shell: ignored a line that is not JSON from the core\n`)
            return
        }
        if (message.id !== undefined && message.method === undefined) {
            this.#handleResponse(message)
        } else if (typeof message.method === "string") {
            this.emit("notification", message.method, message.params)
        }
    }

    #handleResponse(response) {
        if (response.id === this.#helloId) {
            this.#handleHello(toOutcome(response))
        } else {
            this.#settle(response.id, toOutcome(response))
        }
    }

    #handleHello(outcome) {
        if (outcome.ok && outcome.value.protocolVersion === this.#options.protocolVersion) {
            this.#setState("ready", null)
            this.#sendQueued()
            return
        }
        const isMismatch = !outcome.ok && outcome.error.code === PROTOCOL_MISMATCH
        this.#giveUp(isMismatch || outcome.ok ? "The core speaks another protocol version." : outcome.error.message)
        this.#child.stdin.end()
    }

    #handleSpawnError(child, error) {
        if (child !== this.#child) {
            return
        }
        if (error.code === "ENOENT") {
            this.#child = null
            this.#giveUp(`The core was not found at ${this.#options.executable}.`)
            return
        }
        this.#options.logStream.write(`shell: the core failed to start: ${error.message}\n`)
        this.#handleExit(child)
    }

    #handleExit(child) {
        if (child !== this.#child) {
            return
        }
        this.#child = null
        this.#settleAll(coreUnavailable())
        if (this.#stopping !== null) {
            this.#setState("stopped", null)
        } else if (this.#state.state !== "unavailable") {
            this.#scheduleRestart()
        }
    }

    #scheduleRestart() {
        const plan = planCoreRestart(this.#failureTimes, this.#options.now())
        this.#failureTimes = plan.recentFailures
        if (plan.delayMs === null) {
            this.#giveUp(`The core stopped ${plan.recentFailures.length} times within a minute.`)
            return
        }
        this.#setState("restarting", null)
        this.#restartTimer = this.#options.setTimeout(() => this.start(), plan.delayMs)
    }

    #giveUp(message) {
        this.#settleAll(coreUnavailable())
        this.#setState("unavailable", message)
    }

    #sendQueued() {
        for (const [id, entry] of this.#pending) {
            if (!entry.isSent) {
                this.#send(id)
            }
        }
    }

    #send(id) {
        const entry = this.#pending.get(id)
        entry.isSent = true
        this.#write({ id, method: entry.method, params: entry.params })
    }

    #settle(id, outcome) {
        const entry = this.#pending.get(id)
        if (entry !== undefined) {
            this.#pending.delete(id)
            entry.resolve(outcome)
        }
    }

    #settleAll(outcome) {
        for (const id of [...this.#pending.keys()]) {
            this.#settle(id, outcome)
        }
    }

    #write(message) {
        if (this.#child !== null && this.#child.stdin.writable) {
            this.#child.stdin.write(`${JSON.stringify({ jsonrpc: JSON_RPC_VERSION, ...message })}\n`)
        }
    }

    #setState(state, message) {
        this.#state = { state, message }
        this.emit("state", this.#state)
    }
}

module.exports = { CoreClient }
