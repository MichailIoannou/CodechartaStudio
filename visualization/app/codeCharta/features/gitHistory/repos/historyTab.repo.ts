import { Injectable, inject } from "@angular/core"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"

const HISTORY_TAB_KEY_PREFIX = "codeChartaHistoryTab."

export type HistoryTab = "log" | "changes"

@Injectable({ providedIn: "root" })
export class HistoryTabRepo {
    private readonly localStorageRepo = inject(LocalStorageRepo)

    read(projectId: string): HistoryTab {
        return this.localStorageRepo.read(HISTORY_TAB_KEY_PREFIX + projectId) === "changes" ? "changes" : "log"
    }

    write(projectId: string, tab: HistoryTab): void {
        this.localStorageRepo.write(HISTORY_TAB_KEY_PREFIX + projectId, tab)
    }
}
