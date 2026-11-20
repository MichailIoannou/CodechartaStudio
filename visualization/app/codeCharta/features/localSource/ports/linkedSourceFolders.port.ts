import { InjectionToken } from "@angular/core"
import type { FileMeta } from "../../../model/codeCharta.model"

export type LinkedSourceFolder =
    | { status: "available"; rootPath: string; readFile(relativePath: string): Promise<File | null> }
    | { status: "unavailable"; label: string }

export interface LinkedSourceFolders {
    folderOf(fileMeta: FileMeta): LinkedSourceFolder | null
}

/** A map that knows its folder, such as a project's, reads from it instead of a folder chosen in the browser; the
 * app composition provides the projects as these folders. Without a provider (the web build, specs) no map has one. */
export const LINKED_SOURCE_FOLDERS = new InjectionToken<LinkedSourceFolders>("LINKED_SOURCE_FOLDERS", {
    providedIn: "root",
    factory: () => ({ folderOf: () => null })
})
