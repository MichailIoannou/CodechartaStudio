import { ChromeTokens, RenderPalette, ThemeDefinition } from "../../model/theme.model"
import { contrastRatio } from "./contrast"
import { DEFAULT_THEME_ID, SYSTEM_THEME_BY_SCHEME, THEMES, themeById } from "./themes"

const READABLE_TEXT = 4.5
const READABLE_LARGE_TEXT = 3
const THEME_ID_PATTERN = /^[a-z-]+$/
const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/
const CONTENT_SUFFIX = "Content"
const FILLS_WITH_CONTENT = 8
/** A canvas stroke that needs its transparency; every other render color feeds three.js, ECharts or a hex parser. */
const TRANSLUCENT_RENDER_COLORS = new Set(["map.floorLabel.outline"])

function contentPairs(chrome: ChromeTokens): [string, string, string][] {
    const tokens: Record<string, string> = { ...chrome }
    return Object.keys(tokens)
        .filter(token => token.endsWith(CONTENT_SUFFIX) && token !== "baseContent")
        .map(contentToken => {
            const fillToken = contentToken.slice(0, -CONTENT_SUFFIX.length)
            return [fillToken, tokens[fillToken], tokens[contentToken]]
        })
}

function colorLeaves(value: unknown, path: string): [string, string][] {
    if (typeof value === "string") {
        return [[path, value]]
    }
    if (value === null || typeof value !== "object") {
        return []
    }
    return Object.entries(value).flatMap(([key, child]) => colorLeaves(child, path ? `${path}.${key}` : key))
}

function renderColors(render: RenderPalette): [string, string][] {
    return colorLeaves(render, "").filter(([path]) => !TRANSLUCENT_RENDER_COLORS.has(path))
}

describe("THEMES", () => {
    describe.each(THEMES.map(theme => [theme.id, theme] as [string, ThemeDefinition]))("%s", (_id, theme) => {
        it("should keep the base content readable on every base surface", () => {
            // Arrange
            const { base100, base200, base300, baseContent } = theme.chrome

            // Act
            const ratios = [base100, base200, base300].map(surface => contrastRatio(baseContent, surface))

            // Assert
            for (const ratio of ratios) {
                expect(ratio).toBeGreaterThanOrEqual(READABLE_TEXT)
            }
        })

        it("should keep every content color readable on its fill", () => {
            // Arrange
            const pairs = contentPairs(theme.chrome)

            // Act
            const failing = pairs.filter(([, fill, content]) => contrastRatio(content, fill) < READABLE_TEXT).map(([token]) => token)

            // Assert
            expect(pairs).toHaveLength(FILLS_WITH_CONTENT)
            expect(failing).toEqual([])
        })

        it("should keep the primary color visible on the base surface", () => {
            // Arrange
            const required = theme.colorScheme === "dark" ? READABLE_TEXT : READABLE_LARGE_TEXT

            // Act
            const ratio = contrastRatio(theme.chrome.primary, theme.chrome.base100)

            // Assert
            expect(ratio).toBeGreaterThanOrEqual(required)
        })

        it("should name the theme with a lowercase id", () => {
            // Arrange
            const { id } = theme

            // Act
            const matches = THEME_ID_PATTERN.test(id)

            // Assert
            expect(matches).toBe(true)
        })

        it("should keep every render palette color a six digit hex", () => {
            // Arrange
            const colors = renderColors(theme.render)

            // Act
            const malformed = colors.filter(([, color]) => !SIX_DIGIT_HEX.test(color)).map(([path]) => path)

            // Assert
            expect(malformed).toEqual([])
        })

        it("should keep every chrome token a six digit hex", () => {
            // Arrange
            const tokens = Object.entries(theme.chrome)

            // Act
            const malformed = tokens.filter(([, color]) => !SIX_DIGIT_HEX.test(color)).map(([token]) => token)

            // Assert
            expect(malformed).toEqual([])
        })
    })

    it("should give every theme its own id", () => {
        // Arrange
        const ids = THEMES.map(theme => theme.id)

        // Act
        const distinct = new Set(ids)

        // Assert
        expect(distinct.size).toBe(ids.length)
    })

    it("should contain the default theme exactly once", () => {
        // Arrange
        const ids = THEMES.map(theme => theme.id)

        // Act
        const defaults = ids.filter(id => id === DEFAULT_THEME_ID)

        // Assert
        expect(defaults).toHaveLength(1)
    })

    it("should follow the system with themes of the matching color scheme", () => {
        // Arrange
        const schemes = Object.entries(SYSTEM_THEME_BY_SCHEME)

        // Act
        const resolved = schemes.map(([scheme, id]) => [scheme, themeById(id)?.colorScheme])

        // Assert
        for (const [scheme, colorScheme] of resolved) {
            expect(colorScheme).toBe(scheme)
        }
    })
})
