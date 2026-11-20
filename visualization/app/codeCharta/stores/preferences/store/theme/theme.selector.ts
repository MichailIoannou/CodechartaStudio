import { createSelector } from "@ngrx/store"
import { preferencesSelector } from "../preferences.selector"

export const themePreferenceSelector = createSelector(preferencesSelector, preferences => preferences.theme)
