import { createAction, props } from "@ngrx/store"
import { FileRename } from "../../../../model/files/files"

export const setFileRenames = createAction("SET_FILE_RENAMES", props<{ value: FileRename[] }>())
