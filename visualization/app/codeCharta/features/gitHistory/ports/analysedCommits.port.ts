import { InjectionToken, Signal } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"

export interface AnalysedCommitMarker {
    state: "analysed" | "queued" | "running" | "failed"
    isLoadedInMap: boolean
    /** 0–100 while running, when known. */
    progressPercent?: number | null
    /** Unix seconds of the analysis; null when unknown (an imported map). */
    analysedAt?: number | null
    /** Said after the time in the title, such as "other profile" or "imported map, analysis time unknown". */
    note?: string | null
    failureMessage?: string | null
}

/** Plan 05 tells the commit list which commits CodeCharta has analysed. */
export interface AnalysedCommitsProvider {
    markersFor(repo: FolderRef): Signal<ReadonlyMap<string, AnalysedCommitMarker>>
}

/** Without a provider the commit list has no Analysis column. */
export const ANALYSED_COMMITS = new InjectionToken<AnalysedCommitsProvider>("ANALYSED_COMMITS")
