import { FileRename, FileSelectionState, FileState } from "../model/files/files"
import { DeltaGenerator } from "./deltaGenerator"

export const getDeltaFile = (visibleFileStates: FileState[], renames: readonly FileRename[] = []) => {
    if (visibleFileStates.length === 2) {
        let [reference, comparison] = visibleFileStates
        if (reference.selectedAs !== FileSelectionState.Reference) {
            const temporary = comparison
            comparison = reference
            reference = temporary
        }
        return DeltaGenerator.getDeltaFile(reference.file, comparison.file, renames)
    }

    return visibleFileStates[0].file
}
