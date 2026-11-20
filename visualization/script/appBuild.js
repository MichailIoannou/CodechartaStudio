#!/usr/bin/env node

const { packager } = require("@electron/packager")
const fs = require("node:fs")
const path = require("node:path")

const { paths } = require("./appConfig.json")
const { cleanDirectory, createDarwinArmREADME } = require("./appUtils.js")

const CORE_FILE_NAME = "codecharta-core"
const CORE_FOLDER = path.join("..", "core")

function coreBinaryFor(platform, arch, isLocal) {
    const fileName = platform === "win32" ? `${CORE_FILE_NAME}.exe` : CORE_FILE_NAME
    const binaryFolder = isLocal ? path.join(CORE_FOLDER, "target", "release") : path.join(CORE_FOLDER, "dist", `${platform}-${arch}`)
    return path.join(binaryFolder, fileName)
}

function coreBinariesFor(distributions, isLocal) {
    const binaries = {}
    for (const aPlatform in distributions) {
        for (const anArchitecture of distributions[aPlatform]) {
            const binary = coreBinaryFor(aPlatform, anArchitecture, isLocal)
            if (!fs.existsSync(binary)) {
                throw new Error(`The core binary for ${aPlatform}-${anArchitecture} is missing: ${path.resolve(binary)}`)
            }
            binaries[`${aPlatform}-${anArchitecture}`] = binary
        }
    }
    return binaries
}

async function bundleElectronApp(options) {
    return packager({
        ...options,
        asar: true,
        icon: "public/codeCharta/assets/icon",
        tmpdir: paths.tempPath
    })
}

async function buildElectronApps(version, distributions, downloadPath, isLocal) {
    const coreBinaries = coreBinariesFor(distributions, isLocal)
    for (const aPlatform in distributions) {
        const allArchitectures = distributions[aPlatform]
        for (const anArchitecture of allArchitectures) {
            await bundleElectronApp({
                platform: aPlatform,
                arch: anArchitecture,
                version: version,
                electronZipDir: downloadPath,
                dir: paths.bundledBrowser,
                out: paths.applicationPath,
                extraResource: [coreBinaries[`${aPlatform}-${anArchitecture}`]]
            })
        }
    }
}

async function build(version, distributions, downloadPath, isLocal) {
    cleanDirectory(paths.applicationPath)
    cleanDirectory(paths.tempPath)
    return buildElectronApps(version, distributions, downloadPath, isLocal)
}

module.exports = {
    prepareApplications: async function (version, distributions, downloadPath, isLocal) {
        await build(version, distributions, downloadPath, isLocal)
        if (Object.hasOwn(distributions, "darwin")) {
            createDarwinArmREADME(path.join(paths.applicationPath, "codecharta-visualization-darwin-arm64/", "README.md"))
        }
    }
}
