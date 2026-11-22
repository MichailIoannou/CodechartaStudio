const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const {
    buttonOrderFromGnomeLayout,
    buttonOrderFromKwinrc,
    isTitleBarColors,
    isWindowCommand,
    windowFrameOptions
} = require("./windowPolicy")

describe("window frame", () => {
    const colors = { color: "#1e2329", symbolColor: "#e6e9ee" }

    test("should keep the system title bar while CodeCharta's title bar is off", () => {
        // Act
        const options = ["linux", "win32", "darwin"].map(platform => windowFrameOptions(platform, { useAppTitleBar: false, colors }))

        // Assert
        assert.deepEqual(options, [{}, {}, {}])
    })

    test("should leave a frameless window to CodeCharta's buttons on Linux", () => {
        // Act
        const options = windowFrameOptions("linux", { useAppTitleBar: true, colors })

        // Assert
        assert.deepEqual(options, { frame: false })
    })

    test("should let Windows draw its caption buttons over the nav bar in the theme's colours", () => {
        // Act
        const options = windowFrameOptions("win32", { useAppTitleBar: true, colors })

        // Assert
        assert.deepEqual(options, {
            titleBarStyle: "hidden",
            titleBarOverlay: { color: "#1e2329", symbolColor: "#e6e9ee", height: 48 }
        })
    })

    test("should keep the traffic lights on macOS, centred in the nav bar", () => {
        // Act
        const options = windowFrameOptions("darwin", { useAppTitleBar: true, colors })

        // Assert
        assert.deepEqual(options, { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } })
    })

    test("should accept only two #rrggbb title bar colours", () => {
        // Act
        const accepted = [
            colors,
            { color: "#1e2329" },
            { color: "black", symbolColor: "#ffffff" },
            { color: "#1e2329", symbolColor: "#fff" },
            null
        ].map(isTitleBarColors)

        // Assert
        assert.deepEqual(accepted, [true, false, false, false, false])
    })

    test("should accept only the three window commands", () => {
        // Act
        const accepted = ["minimize", "toggleMaximize", "close", "destroy", undefined].map(isWindowCommand)

        // Assert
        assert.deepEqual(accepted, [true, true, true, false, false])
    })
})

describe("window button order", () => {
    test("should read the order of KDE's buttons from kwinrc", () => {
        // Arrange
        const kwinrc = "[Windows]\nBorderless=false\n\n[org.kde.kdecoration2]\nButtonsOnLeft=XM\nButtonsOnRight=SAI\n"

        // Act
        const order = buttonOrderFromKwinrc(kwinrc)

        // Assert
        assert.deepEqual(order, ["close", "maximize", "minimize"])
    })

    test("should use KDE's default order when kwinrc names no buttons", () => {
        // Act
        const order = buttonOrderFromKwinrc("[org.kde.kdecoration2]\nBorderSize=None\n")

        // Assert
        assert.deepEqual(order, ["minimize", "maximize", "close"])
    })

    test("should ignore button keys of other kwinrc sections", () => {
        // Act
        const order = buttonOrderFromKwinrc("[Other]\nButtonsOnRight=XAI\n[org.kde.kdecoration2]\nButtonsOnRight=IAX\n")

        // Assert
        assert.deepEqual(order, ["minimize", "maximize", "close"])
    })

    test("should read the order of GNOME's buttons from its button layout", () => {
        // Act
        const order = buttonOrderFromGnomeLayout("'close,minimize:appmenu,maximize'\n")

        // Assert
        assert.deepEqual(order, ["close", "minimize", "maximize"])
    })

    test("should add the buttons the system leaves out after the ones it names", () => {
        // Act
        const kdeOrder = buttonOrderFromKwinrc("[org.kde.kdecoration2]\nButtonsOnLeft=\nButtonsOnRight=X\n")
        const gnomeOrder = buttonOrderFromGnomeLayout("'appmenu:close'")

        // Assert
        assert.deepEqual(kdeOrder, ["close", "minimize", "maximize"])
        assert.deepEqual(gnomeOrder, ["close", "minimize", "maximize"])
    })
})
