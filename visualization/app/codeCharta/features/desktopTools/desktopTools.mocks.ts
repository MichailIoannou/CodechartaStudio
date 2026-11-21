import type { PathsInfo } from "../../model/coreApi/PathsInfo"
import type { ToolStatus } from "../../model/coreApi/ToolStatus"
import type { ToolsReport } from "../../model/coreApi/ToolsReport"

export const PATHS: PathsInfo = {
    dataDir: "/home/mia/.config/codecharta-visualization",
    storeRoot: "/home/mia/.config/codecharta-visualization/store",
    isDefaultStoreRoot: true,
    logsDir: "/home/mia/.config/codecharta-visualization/logs"
}

const GIT_FOUND: ToolStatus = {
    tool: "git",
    isRequired: true,
    state: "ok",
    path: "/usr/bin/git",
    source: "path",
    version: "2.47.1",
    minimumVersion: "2.31.0",
    problem: null
}

const CCSH_CUSTOM: ToolStatus = {
    tool: "ccsh",
    isRequired: true,
    state: "ok",
    path: "/home/mia/tools/codecharta/bin/ccsh",
    source: "custom",
    version: "2.4.0",
    minimumVersion: "2.2.1",
    problem: null
}

const JAVA_TOO_OLD: ToolStatus = {
    tool: "java",
    isRequired: true,
    state: "tooOld",
    path: "/usr/lib/jvm/java-21/bin/java",
    source: "javaHome",
    version: "21.0.2",
    minimumVersion: "22",
    problem: "version 21.0.2 is older than 22"
}

const GH_FOUND: ToolStatus = {
    tool: "gh",
    isRequired: false,
    state: "ok",
    path: "/usr/bin/gh",
    source: "path",
    version: "2.62.0",
    minimumVersion: null,
    problem: null
}

const GLAB_MISSING: ToolStatus = {
    tool: "glab",
    isRequired: false,
    state: "missing",
    path: null,
    source: null,
    version: null,
    minimumVersion: null,
    problem: "not found"
}

export function aToolsReport(changes: Partial<Record<ToolStatus["tool"], Partial<ToolStatus>>> = {}): ToolsReport {
    const tools = [GIT_FOUND, CCSH_CUSTOM, JAVA_TOO_OLD, GH_FOUND, GLAB_MISSING].map(status => ({ ...status, ...changes[status.tool] }))
    const isOk = (tool: ToolStatus["tool"]) => tools.find(status => status.tool === tool)?.state === "ok"
    return {
        checkedAt: "2026-11-19T09:00:00Z",
        tools,
        canUseGit: isOk("git"),
        canAnalyse: isOk("git") && isOk("ccsh") && isOk("java")
    }
}
