import { createAction, props } from "@ngrx/store"
import { ThemeId } from "../../../../model/theme.model"

export const activeThemeChanged = createAction("ACTIVE_THEME_CHANGED", props<{ themeId: ThemeId }>())
