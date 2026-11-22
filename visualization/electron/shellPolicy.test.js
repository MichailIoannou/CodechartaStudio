const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const {
    applicationMenuTemplate,
    describeTrustedPage,
    isRendererEvent,
    isComposedMethod,
    isDroppedMapPath,
    isRendererMethod,
    isTrustedSender,
    isReadableMapPath,
    isValidOperationId,
    isColorScheme,
    isMapChunkRange,
    isWindowBackgroundColor,
    judgeNavigation,
    pageNotificationOf,
    planCoreRestart,
    resolveCoreExecutable,
    toDialogOptions
} = require("./shellPolicy")

const LINUX_INDEX = "/opt/codecharta/resources/app.asar/index.html"
const LINUX_INDEX_URL = "file:///opt/codecharta/resources/app.asar/index.html"
const MAIN_WEB_CONTENTS_ID = 1
const linuxPage = describeTrustedPage({ isPackaged: true, indexHtmlPath: LINUX_INDEX, devServerUrl: undefined, platform: "linux" })

function senderFrom(overrides) {
    return { hasFrame: true, isMainFrame: true, frameUrl: LINUX_INDEX_URL, webContentsId: MAIN_WEB_CONTENTS_ID, ...overrides }
}

function isTrustedOnLinux(sender) {
    return isTrustedSender(sender, { mainWebContentsId: MAIN_WEB_CONTENTS_ID, trustedPage: linuxPage })
}

describe("trusted sender", () => {
    test("should trust the main frame of the bundled page", () => {
        // Arrange
        const sender = senderFrom({})

        // Act
        const isTrusted = isTrustedOnLinux(sender)

        // Assert
        assert.equal(isTrusted, true)
    })

    test("should reject a sub frame", () => {
        // Arrange
        const sender = senderFrom({ isMainFrame: false })

        // Act
        const isTrusted = isTrustedOnLinux(sender)

        // Assert
        assert.equal(isTrusted, false)
    })

    test("should reject another web contents", () => {
        // Arrange
        const sender = senderFrom({ webContentsId: MAIN_WEB_CONTENTS_ID + 1 })

        // Act
        const isTrusted = isTrustedOnLinux(sender)

        // Assert
        assert.equal(isTrusted, false)
    })

    test("should reject a missing frame", () => {
        // Arrange
        const sender = senderFrom({ hasFrame: false, isMainFrame: false, frameUrl: undefined })

        // Act
        const isTrusted = isTrustedOnLinux(sender)

        // Assert
        assert.equal(isTrusted, false)
    })

    test("should ignore query and hash", () => {
        // Arrange
        const sender = senderFrom({ frameUrl: `${LINUX_INDEX_URL}?file=sample.cc.json#/map` })

        // Act
        const isTrusted = isTrustedOnLinux(sender)

        // Assert
        assert.equal(isTrusted, true)
    })

    test("should compare Windows paths case-insensitively", () => {
        // Arrange
        const windowsPage = describeTrustedPage({
            isPackaged: true,
            indexHtmlPath: "C:\\Program Files\\CodeCharta\\resources\\app.asar\\index.html",
            devServerUrl: undefined,
            platform: "win32"
        })
        const sender = senderFrom({ frameUrl: "file:///c:/program%20files/codecharta/RESOURCES/app.asar/index.html" })

        // Act
        const isTrusted = isTrustedSender(sender, { mainWebContentsId: MAIN_WEB_CONTENTS_ID, trustedPage: windowsPage })

        // Assert
        assert.equal(isTrusted, true)
    })

    test("should trust only the dev server origin when unpackaged", () => {
        // Arrange
        const devServerUrl = "http://localhost:3000"
        const unpackagedPage = describeTrustedPage({ isPackaged: false, indexHtmlPath: LINUX_INDEX, devServerUrl, platform: "linux" })
        const packagedPage = describeTrustedPage({ isPackaged: true, indexHtmlPath: LINUX_INDEX, devServerUrl, platform: "linux" })
        const remotePage = describeTrustedPage({
            isPackaged: false,
            indexHtmlPath: LINUX_INDEX,
            devServerUrl: "http://example.com:3000",
            platform: "linux"
        })
        const trustedBy = (trustedPage, frameUrl) =>
            isTrustedSender(senderFrom({ frameUrl }), { mainWebContentsId: MAIN_WEB_CONTENTS_ID, trustedPage })

        // Act
        const verdicts = {
            devServerWhenUnpackaged: trustedBy(unpackagedPage, "http://localhost:3000/#/map"),
            otherPortWhenUnpackaged: trustedBy(unpackagedPage, "http://localhost:3001/"),
            bundleWhenUnpackaged: trustedBy(unpackagedPage, LINUX_INDEX_URL),
            devServerWhenPackaged: trustedBy(packagedPage, "http://localhost:3000/"),
            remoteDevServer: trustedBy(remotePage, "http://example.com:3000/")
        }

        // Assert
        assert.deepEqual(verdicts, {
            devServerWhenUnpackaged: true,
            otherPortWhenUnpackaged: false,
            bundleWhenUnpackaged: false,
            devServerWhenPackaged: false,
            remoteDevServer: false
        })
    })
})

describe("navigation", () => {
    test("should send https and vscode links to the system", () => {
        // Arrange
        const links = ["https://maibornwolff.github.io/codecharta/", "vscode://file/home/user/src/main.ts:12", "mailto:team@example.com"]

        // Act
        const verdicts = links.map(link => judgeNavigation(link, linuxPage))

        // Assert
        assert.deepEqual(verdicts, ["external", "external", "external"])
    })

    test("should block file links to other pages", () => {
        // Arrange
        const links = ["file:///etc/passwd", "file:///opt/codecharta/resources/app.asar/other.html", "javascript:alert(1)", "not a url"]

        // Act
        const verdicts = links.map(link => judgeNavigation(link, linuxPage))

        // Assert
        assert.deepEqual(verdicts, ["blocked", "blocked", "blocked", "blocked"])
    })

    test("should keep the bundled page with any query and hash internal", () => {
        // Arrange
        const link = `${LINUX_INDEX_URL}?mode=delta#/map`

        // Act
        const verdict = judgeNavigation(link, linuxPage)

        // Assert
        assert.equal(verdict, "internal")
    })
})

describe("core executable", () => {
    test("should resolve the core next to the resources when packaged", () => {
        // Arrange
        const resourcesPath = path.join(path.sep, "opt", "codecharta", "resources")

        // Act
        const linuxCore = resolveCoreExecutable({ isPackaged: true, resourcesPath, appDir: "unused", env: {}, platform: "linux" })
        const windowsCore = resolveCoreExecutable({ isPackaged: true, resourcesPath, appDir: "unused", env: {}, platform: "win32" })

        // Assert
        assert.equal(linuxCore, path.join(resourcesPath, "codecharta-core"))
        assert.equal(windowsCore, path.join(resourcesPath, "codecharta-core.exe"))
    })

    test("should resolve the debug core when unpackaged", () => {
        // Arrange
        const repository = path.join(path.sep, "work", "codecharta")
        const appDir = path.join(repository, "visualization", "dist", "bundler", "browser")
        const chosenCore = path.join(path.sep, "elsewhere", "codecharta-core")

        // Act
        const debugCore = resolveCoreExecutable({ isPackaged: false, resourcesPath: "unused", appDir, env: {}, platform: "linux" })
        const overriddenCore = resolveCoreExecutable({
            isPackaged: false,
            resourcesPath: "unused",
            appDir,
            env: { CODECHARTA_CORE_PATH: chosenCore },
            platform: "linux"
        })

        // Assert
        assert.equal(debugCore, path.join(repository, "core", "target", "debug", "codecharta-core"))
        assert.equal(overriddenCore, chosenCore)
    })
})

describe("core restart", () => {
    test("should back off and give up after five failures in a minute", () => {
        // Arrange
        const secondsApart = [0, 1, 3, 7, 15, 30].map(seconds => seconds * 1000)

        // Act
        const delays = []
        let recentFailures = []
        for (const failureTime of secondsApart) {
            const plan = planCoreRestart(recentFailures, failureTime)
            delays.push(plan.delayMs)
            recentFailures = plan.recentFailures
        }

        // Assert
        assert.deepEqual(delays, [500, 1000, 2000, 4000, 8000, null])
    })

    test("should start the backoff again once old failures are a minute away", () => {
        // Arrange
        const oldFailures = [0, 1000, 2000, 3000, 4000]

        // Act
        const plan = planCoreRestart(oldFailures, 64_001)

        // Assert
        assert.equal(plan.delayMs, 500)
        assert.deepEqual(plan.recentFailures, [64_001])
    })
})

describe("allow-list", () => {
    test("should allow only renderer methods", () => {
        // Arrange
        const contract = { rendererMethods: ["core.ping", "tools.doctor"] }

        // Act
        const verdicts = ["core.ping", "tools.doctor", "tools.setPath", "core.hello", "toString", undefined].map(method =>
            isRendererMethod(method, contract)
        )

        // Assert
        assert.deepEqual(verdicts, [true, true, false, false, false, false])
    })

    test("should compose only the methods the shell itself offers", () => {
        // Arrange
        const composedMethods = { "projects.pickFolder": () => null }

        // Act
        const verdicts = ["projects.pickFolder", "projects.inspectFolder", "toString", "constructor", undefined].map(method =>
            isComposedMethod(method, composedMethods)
        )

        // Assert
        assert.deepEqual(verdicts, [true, false, false, false, false])
    })

    test("should forward only renderer events", () => {
        // Arrange
        const contract = { rendererEvents: ["core.progress"] }

        // Act
        const verdicts = ["core.progress", "prompt.requested", 42].map(event => isRendererEvent(event, contract))

        // Assert
        assert.deepEqual(verdicts, [true, false, false])
    })

    test("should hand progress to the page under its operation id and drop progress of other requests", () => {
        // Arrange
        const operationIdOf = wireId => (wireId === 3 ? "fetch-1" : undefined)
        const progress = { requestId: 3, message: "Receiving objects: 45%", done: 45, total: 100 }

        // Act
        const mapped = pageNotificationOf("core.progress", progress, operationIdOf)
        const dropped = pageNotificationOf("core.progress", { ...progress, requestId: 9 }, operationIdOf)

        // Assert
        assert.deepEqual(mapped, { ...progress, requestId: "fetch-1" })
        assert.equal(dropped, null)
    })

    test("should hand a prompt to the page under its operation id, and without one when no operation asked", () => {
        // Arrange
        const operationIdOf = wireId => (wireId === 3 ? "fetch-1" : undefined)
        const prompt = { promptId: "p1", requestId: 3, repositoryLabel: "billing-api", kind: "secret", message: "Password: " }

        // Act
        const mapped = pageNotificationOf("prompt.requested", prompt, operationIdOf)
        const unmapped = pageNotificationOf("prompt.requested", { ...prompt, requestId: 9 }, operationIdOf)

        // Assert
        assert.deepEqual(mapped, { ...prompt, requestId: "fetch-1" })
        assert.deepEqual(unmapped, { ...prompt, requestId: null })
    })

    test("should hand other notifications to the page unchanged", () => {
        // Arrange
        const closed = { promptId: "p1" }

        // Act
        const forwarded = pageNotificationOf("prompt.closed", closed, () => "fetch-1")

        // Assert
        assert.deepEqual(forwarded, closed)
    })

    test("should accept only absent or short string operation ids", () => {
        // Arrange
        const operationIds = [undefined, "recheck-1", "x".repeat(64), "x".repeat(65), 7, null]

        // Act
        const verdicts = operationIds.map(isValidOperationId)

        // Assert
        assert.deepEqual(verdicts, [true, true, true, false, false, false])
    })
})

describe("shell actions", () => {
    const linuxRoots = { allowedRoots: ["/home/user/.config/codecharta-visualization", "/data/store"], platform: "linux" }

    test("should refuse a map outside the data folder", () => {
        // Arrange
        const mapPaths = [
            "/data/store/projects/p1/snapshots/f1/s1/map.cc.json.gz",
            "/home/user/.config/codecharta-visualization/store/projects/p1/map.cc.json",
            "/data/store/../secrets/map.cc.json.gz",
            "/data/store-other/map.cc.json.gz",
            "/etc/map.cc.json"
        ]

        // Act
        const verdicts = mapPaths.map(mapPath => isReadableMapPath(mapPath, linuxRoots))

        // Assert
        assert.deepEqual(verdicts, [true, true, false, false, false])
    })

    test("should refuse a file that is not a map", () => {
        // Arrange
        const filePaths = [
            "/data/store/projects/p1/project.json",
            "/data/store/run.log",
            "/data/store/map.cc.json.gz.exe",
            "relative/map.cc.json"
        ]

        // Act
        const verdicts = filePaths.map(filePath => isReadableMapPath(filePath, linuxRoots))

        // Assert
        assert.deepEqual(verdicts, [false, false, false, false])
    })

    test("should compare map paths case-insensitively on Windows", () => {
        // Arrange
        const windowsRoots = { allowedRoots: ["C:\\Users\\me\\AppData\\Roaming\\codecharta-visualization"], platform: "win32" }

        // Act
        const isReadable = isReadableMapPath(
            "c:\\users\\ME\\appdata\\roaming\\codecharta-visualization\\store\\MAP.CC.JSON.GZ",
            windowsRoots
        )

        // Assert
        assert.equal(isReadable, true)
    })

    test("should reject a colour that is not six hex digits", () => {
        // Arrange
        const colours = ["#1b9cfc", "#FFFFFF", "#fff", "1b9cfc", "#1b9cfcff", "red", "#1b9cfg", 0x1b9cfc]

        // Act
        const verdicts = colours.map(isWindowBackgroundColor)

        // Assert
        assert.deepEqual(verdicts, [true, true, false, false, false, false, false, false])
    })

    test("should accept only the three colour schemes", () => {
        // Arrange
        const schemes = ["light", "dark", "system", "Dark", "sepia", "", null, 1]

        // Act
        const verdicts = schemes.map(isColorScheme)

        // Assert
        assert.deepEqual(verdicts, [true, true, true, false, false, false, false, false])
    })

    test("should accept only whole-byte map chunk ranges of at most 32 MiB", () => {
        // Arrange
        const maxLength = 32 * 1024 * 1024
        const ranges = [
            { offset: 0, length: 1 },
            { offset: 5_000_000_000, length: maxLength },
            { offset: 0, length: 0 },
            { offset: 0, length: maxLength + 1 },
            { offset: -1, length: 1 },
            { offset: 1.5, length: 1 },
            { offset: "0", length: 1 },
            { offset: 0, length: Number.NaN }
        ]

        // Act
        const verdicts = ranges.map(isMapChunkRange)

        // Assert
        assert.deepEqual(verdicts, [true, true, false, false, false, false, false, false])
    })

    test("should keep only well-formed picker titles and filters", () => {
        // Arrange
        const wellFormed = { title: "Pick", filters: [{ name: "Executables", extensions: ["exe", "cmd", "bat"] }] }

        // Act
        const verdicts = {
            wellFormed: toDialogOptions(wellFormed),
            absent: toDialogOptions(undefined),
            numberTitle: toDialogOptions({ title: 7 }),
            badExtension: toDialogOptions({ filters: [{ name: "All", extensions: ["../x"] }] }),
            notAList: toDialogOptions({ filters: "exe" })
        }

        // Assert
        assert.deepEqual(verdicts, {
            wellFormed: { title: "Pick", filters: [{ name: "Executables", extensions: ["exe", "cmd", "bat"] }] },
            absent: { title: undefined, filters: undefined },
            numberTitle: null,
            badExtension: null,
            notAList: null
        })
    })
})

describe("dropped files", () => {
    test("should accept only absolute cc.json paths of a readable size", () => {
        // Arrange
        const candidates = [
            ["/home/mia/a1b2c3d.app.cc.json.gz", "linux"],
            ["C:\\Users\\mia\\map.CC.JSON", "win32"],
            ["map.cc.json", "linux"],
            ["/home/mia/map.json", "linux"],
            [42, "linux"]
        ]

        // Act
        const accepted = candidates.map(([filePath, platform]) => isDroppedMapPath(filePath, platform))

        // Assert
        assert.deepEqual(accepted, [true, true, false, false, false])
    })
})

describe("application menu", () => {
    test("should leave Windows without a menu bar", () => {
        // Act
        const template = applicationMenuTemplate("win32")

        // Assert
        assert.equal(template, null)
    })

    test("should leave Linux without a menu bar", () => {
        // Act
        const template = applicationMenuTemplate("linux")

        // Assert
        assert.equal(template, null)
    })

    test("should keep only the app and edit menus on macOS so its keyboard shortcuts keep working", () => {
        // Act
        const template = applicationMenuTemplate("darwin")

        // Assert
        assert.deepEqual(template, [{ role: "appMenu" }, { role: "editMenu" }])
    })
})
