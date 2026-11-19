import type { ToolId } from "../../../model/coreApi/ToolId"
import type { ToolStatus } from "../../../model/coreApi/ToolStatus"
import type { ToolsReport } from "../../../model/coreApi/ToolsReport"
import type { CoreState } from "../../../util/desktop/desktopBridge"

type BadgeTone = "success" | "error" | "warning" | "ghost"
type NoticeTone = "success" | "warning" | "error" | "info"

export interface ToolRow {
    tool: ToolId
    name: string
    badge: { text: string; tone: BadgeTone }
    version: string
    path: string | null
    isCustom: boolean
    purpose: string
    problem: string | null
}

export interface ToolsSummary {
    text: string
    tone: NoticeTone
}

export interface CoreNotice {
    text: string
    tone: NoticeTone
    canRestart: boolean
}

const TOOL_ORDER: ToolId[] = ["git", "ccsh", "java", "gh", "glab"]
const UNKNOWN_VERSION = "—"
const CORE_NOT_RUNNING = "The CodeCharta core is not running. Projects, git and analyses are paused until it is back."

const TOOL_NAMES: Record<ToolId, string> = { git: "Git", ccsh: "ccsh", java: "Java", gh: "GitHub CLI", glab: "GitLab CLI" }

const TOOL_PURPOSES: Record<ToolId, string> = {
    git: "history, branches, analyses of commits",
    ccsh: "runs the analyses",
    java: "runs ccsh",
    gh: "lists pull requests (optional)",
    glab: "lists merge requests (optional)"
}

const STATE_WORDS: Record<ToolStatus["state"], string> = { ok: "found", missing: "missing", tooOld: "too old", failed: "not working" }

const CORE_NOTICES: Record<Exclude<CoreState["state"], "ready">, CoreNotice> = {
    starting: { text: "Starting the CodeCharta core…", tone: "info", canRestart: false },
    restarting: { text: "Restarting the CodeCharta core…", tone: "info", canRestart: false },
    unavailable: { text: CORE_NOT_RUNNING, tone: "error", canRestart: true },
    stopped: { text: CORE_NOT_RUNNING, tone: "error", canRestart: true }
}

export function toolName(tool: ToolId): string {
    return TOOL_NAMES[tool]
}

export function toToolRows(report: ToolsReport): ToolRow[] {
    return inToolOrder(report.tools).map(status => ({
        tool: status.tool,
        name: toolName(status.tool),
        badge: badgeOf(status),
        version: status.version ?? UNKNOWN_VERSION,
        path: status.path,
        isCustom: status.source === "custom",
        purpose: TOOL_PURPOSES[status.tool],
        problem: problemOf(status)
    }))
}

export function summarize(report: ToolsReport): ToolsSummary {
    const missing = listInWords(
        inToolOrder(report.tools)
            .filter(isFailingRequiredTool)
            .map(status => toolName(status.tool))
    )
    if (report.canAnalyse) {
        return { text: "Analyses and git history are available.", tone: "success" }
    }
    if (report.canUseGit) {
        return { text: `Git history is available; analyses need ${missing}.`, tone: "warning" }
    }
    return { text: `Git history and analyses need ${missing}.`, tone: "error" }
}

export function describeCoreState(coreState: CoreState): CoreNotice | null {
    return coreState.state === "ready" ? null : CORE_NOTICES[coreState.state]
}

function inToolOrder(tools: ToolStatus[]): ToolStatus[] {
    return [...tools].sort((first, second) => TOOL_ORDER.indexOf(first.tool) - TOOL_ORDER.indexOf(second.tool))
}

function isFailingRequiredTool(status: ToolStatus): boolean {
    return status.isRequired && status.state !== "ok"
}

function badgeOf(status: ToolStatus): ToolRow["badge"] {
    if (status.state === "ok") {
        return { text: STATE_WORDS.ok, tone: "success" }
    }
    if (status.isRequired) {
        return { text: STATE_WORDS[status.state], tone: "error" }
    }
    return status.state === "missing" ? { text: "not installed", tone: "ghost" } : { text: STATE_WORDS[status.state], tone: "warning" }
}

function problemOf(status: ToolStatus): string | null {
    switch (status.state) {
        case "missing":
            if (status.source === "custom" && status.path) {
                return `Custom path not found: ${status.path}`
            }
            return "not found on PATH or in the usual folders. Install it, or choose the executable."
        case "tooOld":
            return `version ${status.version} is older than ${status.minimumVersion}.`
        case "failed":
            return `found, but it did not report a version: ${firstLine(status.problem)}`
        default:
            return null
    }
}

function firstLine(text: string | null): string {
    return (text ?? "").split("\n")[0]
}

function listInWords(names: string[]): string {
    if (names.length <= 1) {
        return names.join("")
    }
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}
