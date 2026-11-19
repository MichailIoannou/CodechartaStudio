const path = require("node:path")
const { isColorScheme, isWindowBackgroundColor, toDialogOptions } = require("./shellPolicy")

const SHELL_SETTINGS_FILE = "shell.json"
const FILE_PICKER = ["openFile"]
const FOLDER_PICKER = ["openDirectory", "createDirectory"]
const NOTHING_CHOSEN = { ok: true, value: null }

function failure(code, message) {
    return { ok: false, error: { code, message, details: {} } }
}

function shellSettingsFile(dataDir) {
    return path.join(dataDir, SHELL_SETTINGS_FILE)
}

function readShellSettings(fs, dataDir) {
    try {
        return JSON.parse(fs.readFileSync(shellSettingsFile(dataDir), "utf8"))
    } catch {
        return {}
    }
}

async function statOrNull(fs, filePath) {
    try {
        return await fs.promises.stat(filePath)
    } catch {
        return null
    }
}

async function nearestExistingFolder(fs, filePath) {
    let candidate = path.dirname(filePath)
    while ((await statOrNull(fs, candidate)) === null && path.dirname(candidate) !== candidate) {
        candidate = path.dirname(candidate)
    }
    return candidate
}

async function pickPath({ dialog, getWindow }, properties, options) {
    const dialogOptions = toDialogOptions(options)
    if (dialogOptions === null) {
        console.warn("Refused a picker with malformed options")
        return null
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), { ...dialogOptions, properties })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
}

async function showInFileManager({ fs, shell }, targetPath) {
    const stats = await statOrNull(fs, targetPath)
    if (stats?.isFile()) {
        shell.showItemInFolder(targetPath)
        return NOTHING_CHOSEN
    }
    const folder = stats === null ? await nearestExistingFolder(fs, targetPath) : targetPath
    const problem = await shell.openPath(folder)
    return problem ? failure("IO", problem) : NOTHING_CHOSEN
}

function createShellActions({ dialog, shell, fs, nativeTheme, getWindow, requestCore, restartCore, dataDir, platform }) {
    async function pickThenRequest(properties, options, method, paramsFor) {
        const pickedPath = await pickPath({ dialog, getWindow }, properties, options)
        return pickedPath === null ? NOTHING_CHOSEN : requestCore(method, paramsFor(pickedPath))
    }

    async function reveal({ target }) {
        const resolved = await requestCore("shell.resolvePath", { target })
        return resolved.ok ? showInFileManager({ fs, shell }, resolved.value.path) : resolved
    }

    async function setWindowBackground({ color }) {
        if (!isWindowBackgroundColor(color)) {
            return failure("BAD_REQUEST", "The colour must be written as #rrggbb.")
        }
        getWindow()?.setBackgroundColor(color)
        const settings = { ...readShellSettings(fs, dataDir), windowBackgroundColor: color }
        await fs.promises.writeFile(shellSettingsFile(dataDir), JSON.stringify(settings, null, 2))
        return NOTHING_CHOSEN
    }

    async function setColorScheme({ scheme }) {
        if (!isColorScheme(scheme)) {
            return failure("BAD_REQUEST", "The colour scheme must be light, dark or system.")
        }
        nativeTheme.themeSource = scheme
        const settings = { ...readShellSettings(fs, dataDir), colorScheme: scheme }
        await fs.promises.writeFile(shellSettingsFile(dataDir), JSON.stringify(settings, null, 2))
        return NOTHING_CHOSEN
    }

    return {
        dialogActions: {
            pickFolder: ({ options }) => pickPath({ dialog, getWindow }, FOLDER_PICKER, options),
            pickFile: ({ options }) => pickPath({ dialog, getWindow }, FILE_PICKER, options),
            chooseToolExecutable: ({ tool, options }) =>
                pickThenRequest(FILE_PICKER, options, "tools.setPath", pickedPath => ({ tool, path: pickedPath })),
            chooseStoreRoot: ({ options }) =>
                pickThenRequest(FOLDER_PICKER, options, "store.changeRoot", pickedPath => ({ path: pickedPath }))
        },
        shellActions: {
            reveal,
            setWindowBackground,
            setColorScheme,
            restartCore: async () => {
                restartCore()
                return NOTHING_CHOSEN
            }
        }
    }
}

function runAction(actions, payload) {
    const kind = payload?.kind
    if (typeof kind !== "string" || !Object.hasOwn(actions, kind)) {
        return failure("BAD_REQUEST", "Unknown shell action.")
    }
    return actions[kind](payload)
}

module.exports = {
    FILE_PICKER,
    FOLDER_PICKER,
    NOTHING_CHOSEN,
    createShellActions,
    failure,
    pickPath,
    readShellSettings,
    runAction,
    showInFileManager
}
