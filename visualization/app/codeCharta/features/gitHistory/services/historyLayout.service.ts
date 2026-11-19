import { computed, Injectable, inject, signal } from "@angular/core"
import { HistoryLayoutRepo, StoredHistoryLayout } from "../repos/historyLayout.repo"

interface PaneBounds {
    defaultWidth: number
    minWidth: number
    maxWidth: number
}

export type SidePane = "branches" | "details"

export const PANE_BOUNDS: Record<SidePane, PaneBounds> = {
    branches: { defaultWidth: 260, minWidth: 180, maxWidth: 480 },
    details: { defaultWidth: 380, minWidth: 280, maxWidth: 640 }
}

/** Below Tailwind's `xl` the commit list would be squeezed, so the side panes start collapsed there. */
export const WIDE_WINDOW_PX = 1280

@Injectable({ providedIn: "root" })
export class HistoryLayoutService {
    private readonly repo = inject(HistoryLayoutRepo)
    private readonly stored = this.repo.read()
    private readonly isNarrowWindow = globalThis.innerWidth < WIDE_WINDOW_PX

    private readonly widths = signal<Record<SidePane, number>>({
        branches: clampedWidth("branches", this.stored.branchesWidth),
        details: clampedWidth("details", this.stored.detailsWidth)
    })
    private readonly collapsed = signal<Record<SidePane, boolean>>({
        branches: this.stored.isBranchesCollapsed ?? this.isNarrowWindow,
        details: this.stored.isDetailsCollapsed ?? this.isNarrowWindow
    })
    /** Only a choice the user made is kept, so a pane collapsed by a narrow window opens again in a wide one. */
    private readonly chosenCollapse: Partial<Record<SidePane, boolean>> = {
        branches: this.stored.isBranchesCollapsed,
        details: this.stored.isDetailsCollapsed
    }
    private readonly toggledGroupIds = signal<ReadonlySet<string>>(new Set(this.stored.toggledGroups ?? []))

    readonly branchesWidth = computed(() => this.widths().branches)
    readonly detailsWidth = computed(() => this.widths().details)
    readonly isBranchesCollapsed = computed(() => this.collapsed().branches)
    readonly isDetailsCollapsed = computed(() => this.collapsed().details)
    readonly toggledGroups = this.toggledGroupIds.asReadonly()

    resize(pane: SidePane, width: number): void {
        this.widths.update(widths => ({ ...widths, [pane]: clampedWidth(pane, width) }))
    }

    resetWidth(pane: SidePane): void {
        this.resize(pane, PANE_BOUNDS[pane].defaultWidth)
        this.save()
    }

    toggleCollapsed(pane: SidePane): void {
        this.collapsed.update(collapsed => ({ ...collapsed, [pane]: !collapsed[pane] }))
        this.chosenCollapse[pane] = this.collapsed()[pane]
        this.save()
    }

    toggleGroup(groupId: string): void {
        this.toggledGroupIds.update(groupIds => {
            const next = new Set(groupIds)
            if (!next.delete(groupId)) {
                next.add(groupId)
            }
            return next
        })
        this.save()
    }

    save(): void {
        const layout: StoredHistoryLayout = {
            branchesWidth: this.branchesWidth(),
            detailsWidth: this.detailsWidth(),
            isBranchesCollapsed: this.chosenCollapse.branches,
            isDetailsCollapsed: this.chosenCollapse.details,
            toggledGroups: [...this.toggledGroupIds()]
        }
        this.repo.write(layout)
    }
}

function clampedWidth(pane: SidePane, width: unknown): number {
    const { defaultWidth, minWidth, maxWidth } = PANE_BOUNDS[pane]
    return typeof width === "number" && Number.isFinite(width) ? Math.min(maxWidth, Math.max(minWidth, width)) : defaultWidth
}
