import { InjectionToken } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"

/** An action other features add to a folder's "More actions" menu in the project overview (plan 06). */
export interface FolderAction {
    id: string
    /** Sentence case, as the menu lists it. */
    label: string
    /** Font Awesome classes, such as "fa-solid fa-broom". */
    icon: string
    hoverHint: string
    isOfferedFor(folder: ProjectFolder): boolean
    run(folder: FolderRef, folderLabel: string): void
}

/** Multi provider: each contribution provides one action; the menu lists them after its own items. */
export const FOLDER_ACTIONS = new InjectionToken<readonly FolderAction[]>("FOLDER_ACTIONS")
