import { createReducer, on } from "@ngrx/store"
import { ThemePreference } from "../../../../model/theme.model"
import { setState } from "../../../../util/setState.reducer.factory"
import { DEFAULT_THEME_ID } from "../../../../util/theme/themes"
import { setThemePreference } from "./theme.actions"

export const defaultTheme: ThemePreference = DEFAULT_THEME_ID

export const theme = createReducer(defaultTheme, on(setThemePreference, setState(defaultTheme)))
