import { Injectable, inject } from "@angular/core"
import { Store } from "@ngrx/store"
import { CCFile, CcState, ChangedFilesFilter, LayoutAlgorithm } from "../../../model/codeCharta.model"
import { FileRename } from "../../../model/files/files"
import {
    removeFiles,
    setDelta,
    setFileRenames,
    setStandard,
    switchReferenceAndComparison
} from "../../../stores/fileStore/fileStore.facade"
import { setLayoutAlgorithm } from "../../../stores/mapState/mapState.write.facade"
import { focusNode, NodeInteraction, setChangedFilesFilter } from "../../../stores/sharedView/sharedView.write.facade"

/** The only place the comparison changes the map selection, the layout, the changed-files filter, the renames or the selected building. */
@Injectable({ providedIn: "root" })
export class CompareWriteStore {
    private readonly store: Store<CcState> = inject(Store)
    private readonly nodeInteraction = inject(NodeInteraction)

    setDelta(referenceFile: CCFile, comparisonFile: CCFile): void {
        this.store.dispatch(setDelta({ referenceFile, comparisonFile }))
    }

    /** Selects the file before removing the others, so the store never passes through an empty list. */
    showAlone(file: CCFile, removedFileNames: string[]): void {
        this.store.dispatch(setStandard({ files: [file] }))
        if (removedFileNames.length > 0) {
            this.store.dispatch(removeFiles({ fileNames: removedFileNames }))
        }
    }

    switchReferenceAndComparison(): void {
        this.store.dispatch(switchReferenceAndComparison())
    }

    useTreemapLayout(): void {
        this.store.dispatch(setLayoutAlgorithm({ value: LayoutAlgorithm.SquarifiedTreeMap }))
    }

    setChangedFilesFilter(filter: ChangedFilesFilter | null): void {
        this.store.dispatch(setChangedFilesFilter({ value: filter }))
    }

    setRenames(renames: FileRename[]): void {
        this.store.dispatch(setFileRenames({ value: renames }))
    }

    selectNode(path: string): void {
        this.nodeInteraction.selectNode(path)
    }

    focusFolder(path: string): void {
        this.store.dispatch(focusNode({ value: path }))
    }
}
