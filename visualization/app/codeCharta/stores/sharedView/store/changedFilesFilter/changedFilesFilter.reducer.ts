import { createReducer, on } from "@ngrx/store"
import type { ChangedFilesFilter } from "../../../../model/codeCharta.model"
import { setState } from "../../../../util/setState.reducer.factory"
import { setChangedFilesFilter } from "./changedFilesFilter.actions"

export const defaultChangedFilesFilter: ChangedFilesFilter | null = null
export const changedFilesFilter = createReducer(
    defaultChangedFilesFilter,
    on(setChangedFilesFilter, setState<ChangedFilesFilter | null>(defaultChangedFilesFilter))
)
