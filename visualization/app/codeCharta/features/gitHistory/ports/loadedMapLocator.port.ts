import { InjectionToken } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"

/** Plan 05 tells the commit details which changed files have a node in the map shown now. */
export interface LoadedMapLocator {
    nodePathOf(repo: FolderRef, repositoryRelativePath: string): string | null
}

/** Without a provider the changed files are plain text. */
export const LOADED_MAP_LOCATOR = new InjectionToken<LoadedMapLocator>("LOADED_MAP_LOCATOR")
