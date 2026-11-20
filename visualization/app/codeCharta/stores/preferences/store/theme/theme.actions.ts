import { createAction, props } from "@ngrx/store"
import { ThemeId, ThemePreference } from "../../../../model/theme.model"

export const setThemePreference = createAction("SET_THEME_PREFERENCE", props<{ value: ThemePreference }>())

/** The applied theme changed, also when the operating system switched it; renderers repaint on it. Never saved. */
export const activeThemeChanged = createAction("ACTIVE_THEME_CHANGED", props<{ themeId: ThemeId }>())
