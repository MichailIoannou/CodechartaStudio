import { InjectionToken, Signal, signal } from "@angular/core"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"

export interface WorkingFolderSource {
    readonly activeProject: Signal<Project | null>
    readonly workingFolder: Signal<ProjectFolder | null>
}

/** The projects feature shows git state, so git cannot import it back; the app composition provides the projects as
 * this source instead. Without a provider (the web build, specs) there is no project and no working folder. */
export const WORKING_FOLDER_SOURCE = new InjectionToken<WorkingFolderSource>("WORKING_FOLDER_SOURCE", {
    providedIn: "root",
    factory: () => ({ activeProject: signal(null), workingFolder: signal(null) })
})
