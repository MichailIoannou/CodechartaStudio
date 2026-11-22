import { ProjectSnapshotOrigin } from "../../model/projectSnapshot.model"
import {
    getContentChecksum,
    NameDataPair,
    PROJECT_ROOT_NAME,
    parseCcFileBytes,
    withRootName
} from "../../stores/fileStore/fileStore.facade"

export interface ProjectSnapshotToLoad {
    origin: ProjectSnapshotOrigin
    displayName: string
    readBytes: () => Promise<Uint8Array>
}

export interface LoadedSnapshotFacts {
    origin: ProjectSnapshotOrigin
    checksum: string
    rootName: string
}

export interface ProjectSnapshotsLoadResult {
    loaded: LoadedSnapshotFacts[]
    identicalContent: { kept: ProjectSnapshotOrigin; dropped: ProjectSnapshotOrigin }[]
    unreadable: ProjectSnapshotOrigin[]
}

interface ReadProjectSnapshots {
    nameDataPairs: NameDataPair[]
    result: ProjectSnapshotsLoadResult
}

interface ParsedSnapshot {
    content: NameDataPair["content"]
    fileSize: number
}

export async function readProjectSnapshots(
    snapshots: ProjectSnapshotToLoad[],
    announceReading: (snapshot: ProjectSnapshotToLoad, position: number) => void
): Promise<ReadProjectSnapshots> {
    const read: ReadProjectSnapshots = { nameDataPairs: [], result: { loaded: [], identicalContent: [], unreadable: [] } }
    const keptByChecksum = new Map<string, ProjectSnapshotOrigin>()
    for (const [index, snapshot] of snapshots.entries()) {
        announceReading(snapshot, index + 1)
        const parsed = await parseSnapshot(snapshot)
        if (parsed) {
            addParsedSnapshot(read, keptByChecksum, snapshot, parsed)
        } else {
            read.result.unreadable.push(snapshot.origin)
        }
    }
    return read
}

export function asNothingLoaded(result: ProjectSnapshotsLoadResult): ProjectSnapshotsLoadResult {
    return {
        loaded: [],
        identicalContent: result.identicalContent,
        unreadable: [...result.unreadable, ...result.loaded.map(({ origin }) => origin)]
    }
}

async function parseSnapshot(snapshot: ProjectSnapshotToLoad): Promise<ParsedSnapshot | null> {
    try {
        const bytes = await snapshot.readBytes()
        const content = await parseCcFileBytes(bytes)
        return content ? { content, fileSize: bytes.byteLength } : null
    } catch {
        return null
    }
}

function addParsedSnapshot(
    read: ReadProjectSnapshots,
    keptByChecksum: Map<string, ProjectSnapshotOrigin>,
    snapshot: ProjectSnapshotToLoad,
    { content, fileSize }: ParsedSnapshot
): void {
    const checksum = getContentChecksum(content)
    const kept = keptByChecksum.get(checksum)
    if (kept) {
        read.result.identicalContent.push({ kept, dropped: snapshot.origin })
        return
    }
    keptByChecksum.set(checksum, snapshot.origin)
    const renamed = withRootName(content, PROJECT_ROOT_NAME)
    read.nameDataPairs.push({ fileName: snapshot.displayName, fileSize, content: renamed.content, projectSnapshot: snapshot.origin })
    read.result.loaded.push({ origin: snapshot.origin, checksum, rootName: renamed.originalRootName })
}
