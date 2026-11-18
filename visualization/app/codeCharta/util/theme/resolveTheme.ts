import { ColorScheme, SYSTEM_THEME, ThemeDefinition } from "../../model/theme.model"
import { defaultThemeDefinition, SYSTEM_THEME_BY_SCHEME, themeById } from "./themes"

export function resolveTheme(preference: string, systemScheme: ColorScheme): ThemeDefinition {
    const themeId = preference === SYSTEM_THEME ? SYSTEM_THEME_BY_SCHEME[systemScheme] : preference
    return themeById(themeId) ?? defaultThemeDefinition()
}
