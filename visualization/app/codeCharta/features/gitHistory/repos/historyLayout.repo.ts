import { Injectable, inject } from "@angular/core"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"

const HISTORY_LAYOUT_KEY = "codeChartaHistoryLayout"

export interface StoredHistoryLayout {
    branchesWidth?: number
    detailsWidth?: number
    changesWidth?: number
    /** Absent until the user collapsed or expanded the pane once. */
    isBranchesCollapsed?: boolean
    isDetailsCollapsed?: boolean
    toggledGroups?: string[]
}

@Injectable({ providedIn: "root" })
export class HistoryLayoutRepo {
    private readonly localStorageRepo = inject(LocalStorageRepo)

    read(): StoredHistoryLayout {
        try {
            const stored: unknown = JSON.parse(this.localStorageRepo.read(HISTORY_LAYOUT_KEY) ?? "{}")
            return typeof stored === "object" && stored !== null ? (stored as StoredHistoryLayout) : {}
        } catch {
            return {}
        }
    }

    write(layout: StoredHistoryLayout): void {
        this.localStorageRepo.write(HISTORY_LAYOUT_KEY, JSON.stringify(layout))
    }
}
