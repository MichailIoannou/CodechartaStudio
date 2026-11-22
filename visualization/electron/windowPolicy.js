const { isWindowBackgroundColor } = require("./shellPolicy")

const NAV_BAR_HEIGHT = 48
const TRAFFIC_LIGHT_POSITION = { x: 16, y: 16 }
const WINDOW_COMMANDS = ["minimize", "toggleMaximize", "close"]
const WINDOW_BUTTONS = ["minimize", "maximize", "close"]
const KDE_DECORATION_SECTION = "[org.kde.kdecoration2]"
const KDE_DEFAULT_BUTTONS = { ButtonsOnLeft: "MS", ButtonsOnRight: "HIAX" }
const KDE_BUTTON_LETTERS = { I: "minimize", A: "maximize", X: "close" }
const INI_ENTRY = /^([^=]+)=(.*)$/
const GNOME_LAYOUT_SEPARATORS = /[:,]/

function windowFrameOptions(platform, { useAppTitleBar, colors }) {
    if (!useAppTitleBar) {
        return {}
    }
    if (platform === "darwin") {
        return { titleBarStyle: "hiddenInset", trafficLightPosition: TRAFFIC_LIGHT_POSITION }
    }
    if (platform === "win32") {
        return { titleBarStyle: "hidden", titleBarOverlay: { ...colors, height: NAV_BAR_HEIGHT } }
    }
    return { frame: false }
}

function isTitleBarColors(colors) {
    return isWindowBackgroundColor(colors?.color) && isWindowBackgroundColor(colors?.symbolColor)
}

function isWindowCommand(command) {
    return WINDOW_COMMANDS.includes(command)
}

function buttonOrderFromKwinrc(kwinrc) {
    const entries = { ...KDE_DEFAULT_BUTTONS, ...iniSection(kwinrc, KDE_DECORATION_SECTION) }
    const letters = [...`${entries.ButtonsOnLeft}${entries.ButtonsOnRight}`]
    return completeButtonOrder(letters.map(letter => KDE_BUTTON_LETTERS[letter]))
}

function iniSection(text, sectionHeader) {
    const entries = {}
    let isInSection = false
    for (const line of text.split(/\r?\n/).map(rawLine => rawLine.trim())) {
        if (line.startsWith("[")) {
            isInSection = line === sectionHeader
        } else if (isInSection && INI_ENTRY.test(line)) {
            const [, key, value] = INI_ENTRY.exec(line)
            entries[key.trim()] = value.trim()
        }
    }
    return entries
}

function buttonOrderFromGnomeLayout(layout) {
    const names = layout.replaceAll("'", "").trim().split(GNOME_LAYOUT_SEPARATORS)
    return completeButtonOrder(names)
}

function completeButtonOrder(names) {
    const named = [...new Set(names.filter(name => WINDOW_BUTTONS.includes(name)))]
    return [...named, ...WINDOW_BUTTONS.filter(button => !named.includes(button))]
}

module.exports = {
    WINDOW_BUTTONS,
    buttonOrderFromGnomeLayout,
    buttonOrderFromKwinrc,
    isTitleBarColors,
    isWindowCommand,
    windowFrameOptions
}
