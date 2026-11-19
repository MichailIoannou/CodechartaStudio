import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core"
import type { GitEntryKind } from "../../../../model/coreApi/GitEntryKind"
import { ChangeGroup, ChangeRow, isStageable } from "../../model/changeRows"
import { failureOf, readyValueOf } from "../../model/loadState"
import { GitChangesService, RowSelectionMode } from "../../services/gitChanges.service"
import { gitErrorSentence } from "../../util/gitErrorText"
import { BUSY_TITLE, ChangeRowComponent, changeRowIdOf } from "../changeRow/changeRow.component"

interface GroupAction {
    label: string
    run: () => void
}

const SKELETON_ROW_COUNT = 6
/** A multi-selection makes the group buttons act on the selected rows instead of the whole group. */
const MULTI_SELECTION_SIZE = 2

@Component({
    selector: "cc-changes-panel",
    templateUrl: "./changesPanel.component.html",
    imports: [ChangeRowComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 flex-col", "data-testid": "changes-panel" }
})
export class ChangesPanelComponent {
    readonly changes = inject(GitChangesService)
    private readonly collapsedKinds = signal<ReadonlySet<GitEntryKind>>(new Set())
    private readonly activeKey = signal<string | null>(null)

    readonly busyTitle = BUSY_TITLE
    readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index)
    readonly isLoading = computed(() => this.changes.workingTree().kind === "loading")
    readonly failure = computed(() => {
        const failure = failureOf(this.changes.workingTree())
        return failure ? gitErrorSentence(failure) : null
    })
    readonly isEmpty = computed(() => this.changes.workingTree().kind === "ready" && this.changes.rows().length === 0)
    readonly isTruncated = computed(() => readyValueOf(this.changes.workingTree())?.areEntriesTruncated ?? false)
    readonly hasStageable = computed(() => this.changes.rows().some(isStageable))
    readonly visibleRows = computed(() => this.changes.groups().flatMap(group => (this.isCollapsed(group.kind) ? [] : group.rows)))
    readonly activeRowKey = computed(() => {
        const key = this.activeKey()
        return this.changes.rows().some(row => row.key === key) ? key : null
    })
    readonly activeDescendant = computed(() => {
        const key = this.activeRowKey()
        return key ? changeRowIdOf(key) : null
    })

    isCollapsed(kind: GitEntryKind): boolean {
        return this.collapsedKinds().has(kind)
    }

    toggleGroup(kind: GitEntryKind) {
        this.collapsedKinds.update(kinds => {
            const next = new Set(kinds)
            if (!next.delete(kind)) {
                next.add(kind)
            }
            return next
        })
    }

    /** Design H11: "Unstage all" on Staged, "Stage all" on Changes; "Stage 3 selected" while several rows are selected. */
    groupActionOf(group: ChangeGroup): GroupAction | null {
        const selected = this.changes.selectedRows()
        const selectedHere = selected.length >= MULTI_SELECTION_SIZE ? selected.filter(row => row.entry.kind === group.kind) : []
        const rows = selectedHere.length > 0 ? selectedHere : group.rows
        const scope = selectedHere.length > 0 ? `${selectedHere.length} selected` : "all"
        if (group.kind === "staged") {
            return { label: `Unstage ${scope}`, run: () => void this.changes.unstage(rows) }
        }
        return group.kind === "unstaged" ? { label: `Stage ${scope}`, run: () => void this.changes.stage(rows) } : null
    }

    stageAll() {
        void this.changes.stageAll()
    }

    select(row: ChangeRow, event: MouseEvent) {
        this.activeKey.set(row.key)
        this.changes.select(row.key, modeOf(event))
    }

    stage(row: ChangeRow) {
        void this.changes.stage([row])
    }

    unstage(row: ChangeRow) {
        void this.changes.unstage([row])
    }

    discard(rows: readonly ChangeRow[]) {
        void this.changes.discard(rows)
    }

    retry() {
        void this.changes.reload()
    }

    onKeydown(event: KeyboardEvent) {
        const isHandled = this.handleKey(event)
        if (isHandled) {
            event.preventDefault()
            event.stopPropagation()
        }
    }

    private handleKey(event: KeyboardEvent): boolean {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp":
            case "Home":
            case "End":
                return this.moveActive(event)
            case " ":
                return this.toggleStagedOfActive()
            case "Delete":
                return this.discardFromKeyboard()
            case "Enter":
                return this.showActive()
            default:
                return false
        }
    }

    private moveActive(event: KeyboardEvent): boolean {
        const rows = this.visibleRows()
        if (rows.length === 0) {
            return false
        }
        const index = rows.findIndex(row => row.key === this.activeRowKey())
        const next = rows[nextIndexOf(event.key, index, rows.length)]
        this.activeKey.set(next.key)
        this.changes.select(next.key, event.shiftKey ? "range" : "only")
        return true
    }

    private toggleStagedOfActive(): boolean {
        const row = this.activeRow()
        if (row) {
            void (row.entry.kind === "staged" ? this.changes.unstage([row]) : this.changes.stage([row]))
        }
        return row !== null
    }

    private discardFromKeyboard(): boolean {
        const selected = this.changes.selectedRows()
        const active = this.activeRow()
        const rows = selected.length > 0 ? selected : active ? [active] : []
        this.discard(rows)
        return rows.length > 0
    }

    private showActive(): boolean {
        const key = this.activeRowKey()
        if (key) {
            this.changes.show(key)
        }
        return key !== null
    }

    private activeRow(): ChangeRow | null {
        return this.changes.rows().find(row => row.key === this.activeRowKey()) ?? null
    }
}

function modeOf(event: MouseEvent): RowSelectionMode {
    if (event.shiftKey) {
        return "range"
    }
    return event.ctrlKey || event.metaKey ? "toggle" : "only"
}

function nextIndexOf(key: string, index: number, rowCount: number): number {
    switch (key) {
        case "Home":
            return 0
        case "End":
            return rowCount - 1
        case "ArrowUp":
            return Math.max(0, index - 1)
        default:
            return Math.min(rowCount - 1, index + 1)
    }
}
