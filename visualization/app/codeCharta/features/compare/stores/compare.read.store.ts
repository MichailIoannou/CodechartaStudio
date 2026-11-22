import { computed, Injectable, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { CCFile } from "../../../model/codeCharta.model"
import { FileSelectionState, FileState } from "../../../model/files/files"
import { isDeltaState } from "../../../model/files/files.helper"
import { FileStoreReadWindow } from "../../../stores/fileStore/fileStore.facade"
import { injectIsRadialLayout } from "../../shared/facade"

/** The loaded maps as a comparison sees them: which checksums are reference and comparison, and the files by checksum. */
@Injectable({ providedIn: "root" })
export class CompareReadStore {
    private readonly fileStore = inject(FileStoreReadWindow)
    private readonly files = toSignal(this.fileStore.files$, { requireSync: true })

    readonly referenceChecksum = computed(() => checksumSelectedAs(this.files(), FileSelectionState.Reference))
    readonly comparisonChecksum = computed(() => checksumSelectedAs(this.files(), FileSelectionState.Comparison))
    readonly loadedChecksums = computed(() => new Set(this.files().map(fileState => fileState.file.fileMeta.fileChecksum)))
    readonly isRadialLayout = injectIsRadialLayout()

    fileWithChecksum(checksum: string): CCFile | undefined {
        return this.fileStore.getFiles().find(fileState => fileState.file.fileMeta.fileChecksum === checksum)?.file
    }

    isDeltaState(): boolean {
        return isDeltaState(this.fileStore.getFiles())
    }
}

function checksumSelectedAs(files: FileState[], selectedAs: FileSelectionState): string | null {
    return files.find(fileState => fileState.selectedAs === selectedAs)?.file.fileMeta.fileChecksum ?? null
}
