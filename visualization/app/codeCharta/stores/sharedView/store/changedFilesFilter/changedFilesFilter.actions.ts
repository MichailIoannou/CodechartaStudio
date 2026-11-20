import { createAction, props } from "@ngrx/store"
import type { ChangedFilesFilter } from "../../../../model/codeCharta.model"

export const setChangedFilesFilter = createAction("SET_CHANGED_FILES_FILTER", props<{ value: ChangedFilesFilter | null }>())
