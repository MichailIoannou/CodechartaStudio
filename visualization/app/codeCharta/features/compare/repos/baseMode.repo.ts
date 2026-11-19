import { Injectable, inject } from "@angular/core"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"
import type { BaseMode } from "../model/compare.model"

const BASE_MODE_KEY = "codeChartaCompareBaseMode"
const DEFAULT_BASE_MODE: BaseMode = "mergeBase"

/** The base mode the compare dialog last used, per project; "since the merge base" until one was chosen. */
@Injectable({ providedIn: "root" })
export class BaseModeRepo {
    private readonly localStorageRepo = inject(LocalStorageRepo)

    read(projectId: string): BaseMode {
        return this.readAll()[projectId] === "tip" ? "tip" : DEFAULT_BASE_MODE
    }

    write(projectId: string, baseMode: BaseMode): void {
        this.localStorageRepo.write(BASE_MODE_KEY, JSON.stringify({ ...this.readAll(), [projectId]: baseMode }))
    }

    private readAll(): Record<string, unknown> {
        try {
            const stored: unknown = JSON.parse(this.localStorageRepo.read(BASE_MODE_KEY) ?? "{}")
            return typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {}
        } catch {
            return {}
        }
    }
}
