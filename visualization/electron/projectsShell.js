const { FOLDER_PICKER, NOTHING_CHOSEN, failure, pickPath, showInFileManager } = require("./shellActions")
const { readRange, realPathOrNull } = require("./shellFiles")
const { isInsideFolder, toDialogOptions } = require("./shellPolicy")

function folderRefOf(params) {
    return { projectId: params?.projectId, folderId: params?.folderId }
}

function createProjectsShell({ dialog, shell, fs, getWindow, requestCore, platform }) {
    async function pickFolder(options) {
        if (toDialogOptions(options) === null) {
            return failure("BAD_REQUEST", "The picker options are malformed.")
        }
        const pickedPath = await pickPath({ dialog, getWindow }, FOLDER_PICKER, options)
        return pickedPath === null ? NOTHING_CHOSEN : requestCore("projects.inspectFolder", { path: pickedPath })
    }

    async function readLocatedSourceFile({ path: filePath, folderRoot, sizeBytes }) {
        const [realFile, realFolderRoot] = await Promise.all([realPathOrNull(fs, filePath), realPathOrNull(fs, folderRoot)])
        if (realFile === null || realFolderRoot === null) {
            return failure("IO", "The source file could not be read.")
        }
        if (!isInsideFolder(realFile, realFolderRoot, platform)) {
            return failure("NOT_ALLOWED", "The file lies outside the project folder.")
        }
        const { bytes } = await readRange(fs, realFile, 0, sizeBytes)
        return { ok: true, value: { bytes } }
    }

    async function readSourceFile(params) {
        const lookup = await requestCore("projects.sourceFileLocation", { ...folderRefOf(params), relativePath: params?.relativePath })
        if (!lookup.ok || lookup.value.location === null) {
            return lookup.ok ? NOTHING_CHOSEN : lookup
        }
        return readLocatedSourceFile(lookup.value.location)
    }

    async function revealFolder(params) {
        const folder = await requestCore("projects.folderPath", folderRefOf(params))
        return folder.ok ? showInFileManager({ fs, shell }, folder.value.path) : folder
    }

    return {
        "projects.pickFolder": pickFolder,
        "projects.readSourceFile": readSourceFile,
        "projects.revealFolder": revealFolder
    }
}

module.exports = { createProjectsShell }
