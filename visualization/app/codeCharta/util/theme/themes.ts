import { ColorScheme, ThemeDefinition, ThemeId } from "../../model/theme.model"
import { darkRenderPalette } from "./palettes/darkRenderPalette"
import { lightRenderPalette } from "./palettes/lightRenderPalette"

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
    }
]

export const DEFAULT_THEME_ID: ThemeId = "cc-dark"

export const SYSTEM_THEME_BY_SCHEME: Readonly<Record<ColorScheme, ThemeId>> = { light: "cc-light", dark: "cc-dark" }

export function themeById(id: string): ThemeDefinition | undefined {
    return THEMES.find(theme => theme.id === id)
}

export function defaultThemeDefinition(): ThemeDefinition {
    return themeById(DEFAULT_THEME_ID) ?? THEMES[0]
}
