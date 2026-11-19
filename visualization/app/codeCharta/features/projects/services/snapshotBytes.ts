import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import type { DesktopBridge } from "../../../util/desktop/desktopBridge"
import { DesktopBridgeError, valueOrThrow } from "../../../util/desktop/desktopResult"

export const MAP_CHUNK_BYTES = 16 * 1024 * 1024

export async function readSnapshotBytes(bridge: DesktopBridge, ref: SnapshotRef): Promise<Uint8Array> {
    const first = await readChunk(bridge, ref, 0)
    const bytes = new Uint8Array(first.totalBytes)
    bytes.set(first.bytes, 0)
    let filled = first.bytes.length
    while (filled < first.totalBytes) {
        const chunk = await readChunk(bridge, ref, filled)
        if (chunk.bytes.length === 0) {
            throw new DesktopBridgeError({ code: "IO", message: "The stored map ended early." })
        }
        bytes.set(chunk.bytes, filled)
        filled += chunk.bytes.length
    }
    return bytes
}

async function readChunk(bridge: DesktopBridge, ref: SnapshotRef, offset: number) {
    return valueOrThrow(await bridge.request("snapshots.readMapChunk", { ...ref, offset, length: MAP_CHUNK_BYTES }))
}
