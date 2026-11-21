import type { GitRemote } from "../../../model/coreApi/GitRemote"

const SHORT_SHA_LENGTH = 7
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const SCP_LIKE = /^[^@/]+@([^:/]+):(.+)$/
const GIT_SUFFIX = /\.git$/
const TRAILING_SLASH = /\/+$/
const BYTES_PER_KB = 1000
const BYTE_UNITS = ["B", "kB", "MB", "GB", "TB"]

export function counted(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`
}

export function shortSha(sha: string): string {
    return sha.slice(0, SHORT_SHA_LENGTH)
}

export function remoteDisplay(remote: GitRemote): string {
    const scpLike = SCP_LIKE.exec(remote.url)
    const address = scpLike ? `${scpLike[1]}/${scpLike[2]}` : remote.url.replace(SCHEME, "").replace(/^[^@/]*@/, "")
    return address.replace(TRAILING_SLASH, "").replace(GIT_SUFFIX, "")
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

export function shortDate(timestamp: string): string {
    return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function longDate(timestamp: string): string {
    return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function fileDate(timestamp: string): string {
    const date = new Date(timestamp)
    const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    return `${longDate(timestamp)}, ${time}`
}
