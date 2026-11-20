import { FileMeta } from "../../../model/codeCharta.model"
import { FileState } from "../../../model/files/files"
import { getVisibleFiles } from "../../../model/files/files.helper"

/** A project map is bound by its folder, so a scenario applies to every commit of that folder. */
export function mapBindingKeyOf(fileMeta: FileMeta): string {
    return fileMeta.projectSnapshot?.folderLabel ?? fileMeta.fileName
}

export function visibleMapBindingKeys(fileStates: FileState[]): string[] {
    return [...new Set(getVisibleFiles(fileStates).map(file => mapBindingKeyOf(file.fileMeta)))]
}
