import { createSelector } from "@ngrx/store"
import { sharedViewSelector } from "../sharedView.selector"

export const changedFilesFilterSelector = createSelector(sharedViewSelector, sharedView => sharedView.changedFilesFilter)
