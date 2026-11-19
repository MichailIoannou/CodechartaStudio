import { ChromeTokens, ColorScheme, MapPaletteSeed, ThemeDefinition, ThemeId } from "../../model/theme.model"
import { buildDarkRenderPalette, darkRenderPalette } from "./palettes/darkRenderPalette"
import { buildLightRenderPalette, lightRenderPalette } from "./palettes/lightRenderPalette"

function darkEditorTheme(id: ThemeId, label: string, chrome: ChromeTokens, seed: MapPaletteSeed): ThemeDefinition {
    return { id, label, colorScheme: "dark", chrome, render: buildDarkRenderPalette(chrome, seed) }
}

function lightEditorTheme(id: ThemeId, label: string, chrome: ChromeTokens, seed: MapPaletteSeed): ThemeDefinition {
    return { id, label, colorScheme: "light", chrome, render: buildLightRenderPalette(chrome, seed) }
}

export const THEMES: readonly ThemeDefinition[] = [
    {
        id: "cc-dark",
        label: "CodeCharta Dark",
        colorScheme: "dark",
        chrome: {
            base100: "#1e2329",
            base200: "#262c34",
            base300: "#3a424d",
            baseContent: "#e6e9ee",
            primary: "#8b9cff",
            primaryContent: "#0f1433",
            secondary: "#f471b5",
            secondaryContent: "#2b0a1c",
            accent: "#2dd4bf",
            accentContent: "#06302b",
            neutral: "#2a323c",
            neutralContent: "#d7dde4",
            info: "#38bdf8",
            infoContent: "#04263a",
            success: "#34d399",
            successContent: "#032b1e",
            warning: "#fbbf24",
            warningContent: "#3a2a00",
            error: "#f87171",
            errorContent: "#3f0a0a"
        },
        render: darkRenderPalette
    },
    {
        id: "cc-light",
        label: "CodeCharta Light",
        colorScheme: "light",
        chrome: {
            base100: "#ffffff",
            base200: "#f9fafb",
            base300: "#d1d5db",
            baseContent: "#1f2937",
            primary: "#0374c9",
            primaryContent: "#ffffff",
            secondary: "#1b9cfc",
            secondaryContent: "#04121f",
            accent: "#fc801b",
            accentContent: "#2b1200",
            neutral: "#3d4451",
            neutralContent: "#ffffff",
            info: "#3abff8",
            infoContent: "#002b3d",
            success: "#36d399",
            successContent: "#003320",
            warning: "#fbbd23",
            warningContent: "#382800",
            error: "#f87272",
            errorContent: "#470000"
        },
        render: lightRenderPalette
    },
    darkEditorTheme(
        "nord",
        "Nord",
        {
            base100: "#2e3440",
            base200: "#3b4252",
            base300: "#434c5e",
            baseContent: "#eceff4",
            primary: "#88c0d0",
            primaryContent: "#2e3440",
            secondary: "#81a1c1",
            secondaryContent: "#2e3440",
            accent: "#8fbcbb",
            accentContent: "#2e3440",
            neutral: "#4c566a",
            neutralContent: "#eceff4",
            info: "#81a1c1",
            infoContent: "#2e3440",
            success: "#a3be8c",
            successContent: "#2e3440",
            warning: "#ebcb8b",
            warningContent: "#2e3440",
            error: "#bf616a",
            errorContent: "#000000"
        },
        { mapBackground: "#242933", floorRoot: "#4c566a", floorDeepest: "#d8dee9", wordCloud: ["#ebcb8b", "#88c0d0"] }
    ),
    lightEditorTheme(
        "vs-light",
        "VS Light",
        {
            base100: "#ffffff",
            base200: "#f3f3f3",
            base300: "#cccedb",
            baseContent: "#1e1e1e",
            primary: "#005fb8",
            primaryContent: "#ffffff",
            secondary: "#af00db",
            secondaryContent: "#ffffff",
            accent: "#267f99",
            accentContent: "#ffffff",
            neutral: "#3c3c3c",
            neutralContent: "#ffffff",
            info: "#1a85ff",
            infoContent: "#000000",
            success: "#388a34",
            successContent: "#000000",
            warning: "#bf8803",
            warningContent: "#000000",
            error: "#e51400",
            errorContent: "#ffffff"
        },
        { mapBackground: "#f3f3f3", floorRoot: "#333333", floorDeepest: "#dddddd", wordCloud: ["#af00db", "#0000ff"] }
    )
]

export const DEFAULT_THEME_ID: ThemeId = "cc-dark"

export const SYSTEM_THEME_BY_SCHEME: Readonly<Record<ColorScheme, ThemeId>> = { light: "cc-light", dark: "cc-dark" }

export function themeById(id: string): ThemeDefinition | undefined {
    return THEMES.find(theme => theme.id === id)
}

export function defaultThemeDefinition(): ThemeDefinition {
    return themeById(DEFAULT_THEME_ID) ?? THEMES[0]
}
