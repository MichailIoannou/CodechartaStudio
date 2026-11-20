import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THEMES } from "../../util/theme/themes"

const BOOT_SCRIPT = readFileSync(join(__dirname, "../../../../public/codeCharta/themeBoot.js"), "utf8")
const INDEX_HTML = readFileSync(join(__dirname, "../../../index.html"), "utf8")

const LIGHT_COLORS = { id: "cc-light", background: "#f4f4eb", content: "#202428", track: "#d9dce1", accent: "#4f5fd9" }
const CUSTOM_COLORS = { id: "nord", background: "#2e3440", content: "#d8dee9", track: "#3b4252", accent: "#88c0d0" }
const MIRROR_KEY = "codeCharta.themeBoot"

function evaluateBootScript(document: object, localStorage: object, matchMedia: (query: string) => { matches: boolean }) {
    new Function("document", "localStorage", "matchMedia", BOOT_SCRIPT)(document, localStorage, matchMedia)
}

function runBootScript(storedMirror: string | null, systemIsDark: boolean) {
    const properties = new Map<string, string>()
    const attributes = new Map<string, string>()
    const document = {
        documentElement: {
            setAttribute: (name: string, value: string) => attributes.set(name, value),
            style: { setProperty: (name: string, value: string) => properties.set(name, value) }
        }
    }
    const localStorage = { getItem: (key: string) => (key === MIRROR_KEY ? storedMirror : null) }
    const matchMedia = (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && systemIsDark })
    evaluateBootScript(document, localStorage, matchMedia)
    return { properties, attributes }
}

function mirrorOf(light: object, dark: object) {
    return JSON.stringify({ version: 1, preference: "system", light, dark })
}

function bootColorsOfDefaultTheme() {
    const { id, chrome } = THEMES.find(theme => theme.id === "cc-dark")
    return { id, background: chrome.base100, content: chrome.baseContent, track: chrome.base300, accent: chrome.primary }
}

describe("themeBoot.js", () => {
    it("should set the theme of the mirror that matches the system color scheme", () => {
        // Arrange
        const mirror = mirrorOf(LIGHT_COLORS, CUSTOM_COLORS)

        // Act
        const dark = runBootScript(mirror, true)
        const light = runBootScript(mirror, false)

        // Assert
        expect(dark.attributes.get("data-theme")).toBe("nord")
        expect(dark.properties.get("--cc-boot-background")).toBe("#2e3440")
        expect(dark.properties.get("--cc-boot-content")).toBe("#d8dee9")
        expect(dark.properties.get("--cc-boot-track")).toBe("#3b4252")
        expect(dark.properties.get("--cc-boot-accent")).toBe("#88c0d0")
        expect(light.attributes.get("data-theme")).toBe("cc-light")
        expect(light.properties.get("--cc-boot-background")).toBe("#f4f4eb")
    })

    it.each([
        ["no mirror", null],
        ["a mirror that is not JSON", "{broken"],
        ["a mirror without the scheme", JSON.stringify({ version: 1, preference: "system" })],
        ["a theme id that is not a name", mirrorOf(LIGHT_COLORS, { ...CUSTOM_COLORS, id: 'x"><script>' })],
        ["a color that is not a hex color", mirrorOf(LIGHT_COLORS, { ...CUSTOM_COLORS, accent: "red; background: url(x)" })]
    ])("should fall back to the default theme with %s", (_description, storedMirror) => {
        // Arrange
        const expected = bootColorsOfDefaultTheme()

        // Act
        const { attributes, properties } = runBootScript(storedMirror, true)

        // Assert
        expect(attributes.get("data-theme")).toBe(expected.id)
        expect(properties.get("--cc-boot-background")).toBe(expected.background)
        expect(properties.get("--cc-boot-content")).toBe(expected.content)
        expect(properties.get("--cc-boot-track")).toBe(expected.track)
        expect(properties.get("--cc-boot-accent")).toBe(expected.accent)
    })

    it("should not throw when the storage is not readable", () => {
        // Arrange
        const document = { documentElement: { setAttribute: () => undefined, style: { setProperty: () => undefined } } }
        const unreadableStorage = {
            getItem: () => {
                throw new Error("denied")
            }
        }

        // Act
        const run = () => evaluateBootScript(document, unreadableStorage, () => ({ matches: false }))

        // Assert
        expect(run).not.toThrow()
    })

    it("should stay under 40 lines", () => {
        // Arrange
        const lineCount = BOOT_SCRIPT.trimEnd().split("\n").length

        // Act / Assert
        expect(lineCount).toBeLessThanOrEqual(40)
    })

    it("should use the same fallback colors as the boot screen in index.html", () => {
        // Arrange
        const expected = bootColorsOfDefaultTheme()
        const fallbackOf = (property: string) => new RegExp(`var\\(${property}, (#[0-9a-f]{6})\\)`, "i").exec(INDEX_HTML)?.[1]

        // Act / Assert
        expect(fallbackOf("--cc-boot-background")).toBe(expected.background)
        expect(fallbackOf("--cc-boot-content")).toBe(expected.content)
        expect(fallbackOf("--cc-boot-track")).toBe(expected.track)
        expect(fallbackOf("--cc-boot-accent")).toBe(expected.accent)
        expect(INDEX_HTML).toContain(`data-theme="${expected.id}"`)
    })

    it("should be loaded by index.html before the boot styles", () => {
        // Arrange
        const scriptPosition = INDEX_HTML.indexOf('<script src="codeCharta/themeBoot.js"></script>')

        // Act / Assert
        expect(scriptPosition).toBeGreaterThan(-1)
        expect(scriptPosition).toBeLessThan(INDEX_HTML.indexOf("<style>"))
    })
})
