import { createReducer, on } from "@ngrx/store"
import { FileRename } from "../../../../model/files/files"
import { setState } from "../../../../util/setState.reducer.factory"
import { setFileRenames } from "./fileRenames.actions"

export const defaultFileRenames: FileRename[] = []
export const fileRenames = createReducer(defaultFileRenames, on(setFileRenames, setState(defaultFileRenames)))
