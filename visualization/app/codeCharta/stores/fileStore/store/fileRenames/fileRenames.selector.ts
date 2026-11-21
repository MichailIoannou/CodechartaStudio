import { createSelector } from "@ngrx/store"
import { CcState } from "../../../../model/codeCharta.model"
import { FileRename } from "../../../../model/files/files"
import { isDeltaStateSelector } from "../isDeltaState.selector"

const NO_RENAMES: readonly FileRename[] = Object.freeze([])

const fileRenamesSelector = (state: CcState) => state.fileRenames

/** Leaving a comparison shows one map before the renames are cleared; the shared empty list keeps that map from being built twice. */
export const renamesOfTheDeltaSelector = createSelector(
    isDeltaStateSelector,
    fileRenamesSelector,
    (isDeltaState, fileRenames): readonly FileRename[] => (isDeltaState ? fileRenames : NO_RENAMES)
)
