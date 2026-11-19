import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"

const MAP_FILE_EXTENSION = /(\.cc)?\.json(\.gz)?$|\.gz$/
const PATH_SEPARATORS = /[/\\]/g
const DIRTY_SUFFIX = "+dirty"
const FIRST_REPEAT = 2

export function snapshotDisplayName(folderLabel: string, snapshot: SnapshotSummary): string {
    return `${folderLabel}@${snapshotPart(snapshot)}`.replaceAll(PATH_SEPARATORS, "-")
}

export function uniqueDisplayNames(names: string[]): string[] {
    const seen = new Map<string, number>()
    return names.map(name => {
        const repeat = (seen.get(name) ?? 0) + 1
        seen.set(name, repeat)
        return repeat < FIRST_REPEAT ? name : `${name} (${repeat})`
    })
}

function snapshotPart(snapshot: SnapshotSummary): string {
    if (snapshot.shortCommit) {
        return snapshot.dirty ? `${snapshot.shortCommit}${DIRTY_SUFFIX}` : snapshot.shortCommit
    }
    if (snapshot.originalFileName) {
        return snapshot.originalFileName.replace(MAP_FILE_EXTENSION, "")
    }
    return minuteOf(snapshot.createdAt)
}

function minuteOf(timestamp: string): string {
    const [date, time = ""] = timestamp.split("T")
    return `${date} ${time.slice(0, 5).replace(":", "-")}`
}
