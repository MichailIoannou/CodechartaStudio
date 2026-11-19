import type { GitRemote } from "../../../model/coreApi/GitRemote"
import type { GitStatus } from "../../../model/coreApi/GitStatus"

const SHORT_SHA_LENGTH = 7
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const SCP_LIKE = /^[^@/]+@([^:/]+):(.+)$/
const GIT_SUFFIX = /\.git$/
const TRAILING_SLASH = /\/+$/
const SECONDS_PER_MINUTE = 60
const TIME_UNITS: readonly { seconds: number; singular: string; plural: string }[] = [
    { seconds: 31_536_000, singular: "year", plural: "years" },
    { seconds: 2_592_000, singular: "month", plural: "months" },
    { seconds: 604_800, singular: "week", plural: "weeks" },
    { seconds: 86_400, singular: "day", plural: "days" },
    { seconds: 3600, singular: "hour", plural: "hours" },
    { seconds: SECONDS_PER_MINUTE, singular: "min", plural: "min" }
]
const BYTES_PER_KB = 1000
const BYTE_UNITS = ["B", "kB", "MB", "GB", "TB"]

export function counted(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`
}

export function shortSha(sha: string): string {
    return sha.slice(0, SHORT_SHA_LENGTH)
}

export function branchLabel(status: GitStatus): string {
    return status.head.kind === "branch" ? status.head.name : `detached at ${shortSha(status.head.commit)}`
}

export interface UpstreamState {
    sentence: string | null
    toPush: number
    toPull: number
}

export function upstreamState(status: GitStatus): UpstreamState {
    const upstream = status.upstream
    if (!upstream || upstream.isGone) {
        return { sentence: upstream ? "upstream gone" : "no upstream", toPush: 0, toPull: 0 }
    }
    const toPush = upstream.ahead ?? 0
    const toPull = upstream.behind ?? 0
    return { sentence: toPush + toPull === 0 ? "in sync" : null, toPush, toPull }
}

export function changesSentence(status: GitStatus): string {
    const { staged, unstaged, untracked, conflicted } = status.counts
    if (status.operationInProgress) {
        return `${operationName(status)} in progress — ${counted(conflicted, "conflict")}`
    }
    const uncommitted = staged + unstaged + untracked + conflicted
    if (uncommitted === 0) {
        return "clean"
    }
    return staged > 0 ? `${uncommitted} uncommitted (${staged} staged)` : `${uncommitted} uncommitted`
}

export function remoteDisplay(remote: GitRemote): string {
    const scpLike = SCP_LIKE.exec(remote.url)
    const address = scpLike ? `${scpLike[1]}/${scpLike[2]}` : remote.url.replace(SCHEME, "").replace(/^[^@/]*@/, "")
    return address.replace(TRAILING_SLASH, "").replace(GIT_SUFFIX, "")
}

export function relativeTime(epochSeconds: number, nowMs: number): string {
    const elapsed = Math.max(0, Math.floor(nowMs / 1000 - epochSeconds))
    const unit = TIME_UNITS.find(candidate => elapsed >= candidate.seconds)
    return unit ? `${counted(Math.floor(elapsed / unit.seconds), unit.singular, unit.plural)} ago` : "just now"
}

export function byteSize(bytes: number): string {
    let value = bytes
    let unit = 0
    while (value >= BYTES_PER_KB && unit < BYTE_UNITS.length - 1) {
        value /= BYTES_PER_KB
        unit += 1
    }
    return unit === 0 ? `${value} ${BYTE_UNITS[0]}` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`
}

function operationName(status: GitStatus): string {
    const names = { merge: "merge", rebase: "rebase", cherryPick: "cherry-pick", revert: "revert", bisect: "bisect" }
    return status.operationInProgress ? names[status.operationInProgress] : ""
}
