const { FILE_PICKER, NOTHING_CHOSEN, failure, pickPath } = require("./shellActions")
const { readRange, realPathOrNull } = require("./shellFiles")
const { isMapChunkRange, isReadableMapPath, toDialogOptions } = require("./shellPolicy")

function snapshotRefOf(params) {
    return { projectId: params?.projectId, folderId: params?.folderId, snapshotId: params?.snapshotId }
}

function createSnapshotsShell({ dialog, fs, getWindow, requestCore, platform }) {
    async function pickImportFile(options) {
        if (toDialogOptions(options) === null) {
            return failure("BAD_REQUEST", "The picker options are malformed.")
        }
        const pickedPath = await pickPath({ dialog, getWindow }, FILE_PICKER, options)
        return pickedPath === null ? NOTHING_CHOSEN : requestCore("snapshots.inspectImportFile", { path: pickedPath })
    }

    async function storedMapPath(snapshotRef) {
        const [location, paths] = await Promise.all([requestCore("snapshots.mapLocation", snapshotRef), requestCore("paths.get", {})])
        if (!location.ok || !paths.ok) {
            return location.ok ? paths : location
        }
        const [realMap, realStoreRoot] = await Promise.all([
            realPathOrNull(fs, location.value.path),
            realPathOrNull(fs, paths.value.storeRoot)
        ])
        if (realMap === null || realStoreRoot === null) {
            return failure("IO", "The map file could not be read.")
        }
        const isStoredMap = isReadableMapPath(realMap, { allowedRoots: [realStoreRoot], platform })
        return isStoredMap ? { ok: true, value: realMap } : failure("NOT_ALLOWED", "The file is not a stored map.")
    }

    async function readMapChunk(params) {
        const range = { offset: params?.offset, length: params?.length }
        if (!isMapChunkRange(range)) {
            return failure("BAD_REQUEST", "The offset must be a whole number of bytes and the length at most 32 MiB.")
        }
        const mapPath = await storedMapPath(snapshotRefOf(params))
        if (!mapPath.ok) {
            return mapPath
        }
        const { bytes, totalBytes } = await readRange(fs, mapPath.value, range.offset, range.length)
        if (range.offset > totalBytes) {
            return failure("BAD_REQUEST", "The offset lies beyond the end of the map.")
        }
        return { ok: true, value: { bytes, offset: range.offset, totalBytes } }
    }

    return {
        "snapshots.pickImportFile": pickImportFile,
        "snapshots.readMapChunk": readMapChunk
    }
}

module.exports = { createSnapshotsShell }
