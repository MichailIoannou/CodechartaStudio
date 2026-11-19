import { Injectable, OnDestroy } from "@angular/core"
import { pairwise, tap } from "rxjs"
import { FileSelectionState, FileState } from "../../../model/files/files"
import { isDeltaState, isEqual } from "../../../model/files/files.helper"
import { FileStoreReadWindow, FilesRepo } from "../../../stores/fileStore/fileStore.facade"
import { NavBarWriteStore } from "../stores/navBar.write.store"

@Injectable({ providedIn: "root" })
export class FileSelectionModeService implements OnDestroy {
    lastSetFilesOfPreviousMode: FileState[] = []

    private readonly subscription = this.fileStoreReadWindow.files$
        .pipe(
            pairwise(),
            tap(([oldFiles, newFiles]) => {
                this.lastSetFilesOfPreviousMode = this.rememberedFilesAfter(oldFiles, newFiles)
            })
        )
        .subscribe()

    constructor(
        private readonly fileStoreReadWindow: FileStoreReadWindow,
        private readonly filesRepo: FilesRepo,
        private readonly navBarWriteStore: NavBarWriteStore
    ) {}

    ngOnDestroy(): void {
        this.subscription.unsubscribe()
    }

    /** Toggles selection mode between "Standard" and "Delta".
     * If available it restores the last set selected files of new mode.
     * When it switches to delta mode and there is no reference
     * file selected, it sets the first selected file as reference as there
     * must be a reference file for anything being rendered at all.
     */
    toggle() {
        const existingFiles = this.filesRepo.getFiles()
        if (!isDeltaState(existingFiles)) {
            this.lastSetFilesOfPreviousMode = this.filterNoneExisting(existingFiles, this.lastSetFilesOfPreviousMode)
            const referenceFile =
                this.lastSetFilesOfPreviousMode.find(file => file.selectedAs === FileSelectionState.Reference) ??
                existingFiles.find(file => file.selectedAs === FileSelectionState.Partial)
            if (referenceFile === undefined) {
                return
            }
            const comparisonFile = this.lastSetFilesOfPreviousMode.find(file => file.selectedAs === FileSelectionState.Comparison)
            this.navBarWriteStore.setDelta(referenceFile.file, comparisonFile?.file)
            return
        }

        if (this.lastSetFilesOfPreviousMode.length > 0) {
            this.navBarWriteStore.setFiles(this.lastSetFilesOfPreviousMode)
            return
        }

        const referenceFile = existingFiles.find(file => file.selectedAs === FileSelectionState.Reference)?.file
        if (referenceFile !== undefined) {
            this.navBarWriteStore.setStandard([referenceFile])
        }
    }

    /** Keeps only maps still in the store, so a remembered selection never holds a removed map in memory or puts it back. */
    private rememberedFilesAfter(oldFiles: FileState[], newFiles: FileState[]): FileState[] {
        const hasModeChanged = isDeltaState(oldFiles) !== isDeltaState(newFiles) || newFiles.length === 0
        const remembered = hasModeChanged ? oldFiles : this.lastSetFilesOfPreviousMode
        return this.filterNoneExisting(newFiles, remembered)
    }

    private filterNoneExisting(existingFileStates: FileState[], fileStates: FileState[]) {
        return fileStates.filter(fileState => existingFileStates.find(existingFileState => isEqual(existingFileState.file, fileState.file)))
    }
}
