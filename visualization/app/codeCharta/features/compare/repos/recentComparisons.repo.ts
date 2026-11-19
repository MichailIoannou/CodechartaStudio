import { Injectable, inject } from "@angular/core"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"
import type { BaseMode } from "../model/compare.model"

const RECENT_COMPARISONS_KEY = "codeChartaRecentComparisons"
export const RECENT_COMPARISON_LIMIT = 10

export interface RecentComparison {
    folderId: string
    base: string
    head: string
    baseMode: BaseMode
    /** Unix milliseconds. */
    comparedAt: number
}

/** The last comparisons of each project, newest first; one entry per folder, sides and base mode. */
@Injectable({ providedIn: "root" })
export class RecentComparisonsRepo {
    private readonly localStorageRepo = inject(LocalStorageRepo)

    read(projectId: string): RecentComparison[] {
        const entries = this.readAll()[projectId]
        return Array.isArray(entries) ? entries.filter(isRecentComparison) : []
    }

    remember(projectId: string, comparison: RecentComparison): void {
        const others = this.read(projectId).filter(entry => keyOf(entry) !== keyOf(comparison))
        const recent = [comparison, ...others].slice(0, RECENT_COMPARISON_LIMIT)
        this.localStorageRepo.write(RECENT_COMPARISONS_KEY, JSON.stringify({ ...this.readAll(), [projectId]: recent }))
    }

    private readAll(): Record<string, unknown> {
        try {
            const stored: unknown = JSON.parse(this.localStorageRepo.read(RECENT_COMPARISONS_KEY) ?? "{}")
            return typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {}
        } catch {
            return {}
        }
    }
}

function keyOf({ folderId, base, head, baseMode }: RecentComparison): string {
    return JSON.stringify([folderId, base, head, baseMode])
}

function isRecentComparison(entry: unknown): entry is RecentComparison {
    const candidate = entry as Partial<RecentComparison> | null
    return (
        typeof candidate?.folderId === "string" &&
        typeof candidate.base === "string" &&
        typeof candidate.head === "string" &&
        (candidate.baseMode === "tip" || candidate.baseMode === "mergeBase") &&
        typeof candidate.comparedAt === "number"
    )
}
