import { inject } from "@angular/core"
import { counted } from "../../../util/wording"
import type { FolderAction } from "../../projects/facade"
import { ToastService } from "../../shared/facade"
import { HOSTING_GATEWAY } from "../ports/compareGateways"

const REMOVE_FAILED = "The fetched pull requests could not be removed."

/** Design C11: deletes the pull and merge request heads fetched for comparisons from a git folder's clone. */
export function removeFetchedRefsAction(): FolderAction {
    const hosting = inject(HOSTING_GATEWAY)
    const toastService = inject(ToastService)
    return {
        id: "compare.removeFetchedRefs",
        label: "Remove fetched pull requests",
        icon: "fa-solid fa-broom",
        hoverHint: "Delete the pull and merge request heads fetched for comparisons (refs/codecharta/); they can be fetched again",
        isOfferedFor: folder => folder.kind === "git" && folder.status === "ok",
        run: (folder, folderLabel) => {
            void hosting
                .removeFetchedRefs(folder)
                .then(removed => toastService.show(removedSentence(removed, folderLabel), removed === 0 ? "info" : "success"))
                .catch((error: Error) => toastService.show(REMOVE_FAILED, "error", { details: error.message }))
        }
    }
}

function removedSentence(removed: number, folderLabel: string): string {
    return removed === 0 ? `'${folderLabel}' has no fetched pull requests.` : `Removed ${counted(removed, "fetched pull request")}.`
}
