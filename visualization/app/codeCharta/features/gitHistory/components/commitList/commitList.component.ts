import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    inject,
    output,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { FloatingMenuAnchor } from "../../../shared/facade"
import { SelectionItem, selectionKeyOf, WORKING_TREE_KEY } from "../../model/commitSelection"
import { failureOf, readyValueOf } from "../../model/loadState"
import { ANALYSED_COMMITS, AnalysedCommitMarker } from "../../ports/analysedCommits.port"
import { CommitActionsService } from "../../services/commitActions.service"
import { CommitClipboardService } from "../../services/commitClipboard.service"
import { CommitSelectionService } from "../../services/commitSelection.service"
import { GitLogService } from "../../services/gitLog.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { CommitListCommand, commitListCommandOf, MoveTarget, rowIndexAfter } from "../../util/commitListKeys"
import { gitErrorSentence } from "../../util/gitErrorText"
import { GraphRow } from "../../util/graphLayout"
import { GRAPH_ROW_HEIGHT, graphWidthFor, MAX_DRAWN_LANES } from "../../util/graphRowGeometry"
import { scrollTopShowing, windowOf } from "../../util/virtualWindow"
import { CommitContextMenuComponent, CommitMenuClosing, CommitMenuTarget } from "../commitContextMenu/commitContextMenu.component"
import { CommitGraphCellComponent } from "../commitGraphCell/commitGraphCell.component"
import { CommitRowComponent, CommitRowView, rowIdOf, selectionClassOf } from "../commitRow/commitRow.component"

const NEXT_PAGE_THRESHOLD_ROWS = 100
const OVERSCAN_ROWS = 10
const SKELETON_ROW_COUNT = 8
const NARROW_PANE_PX = 640
const WIDE_LABEL_LIMIT = 3
const NARROW_LABEL_LIMIT = 1
/** Room for the `+n` beside the drawn lanes. */
const HIDDEN_LANES_ROOM_PX = 24
/** The column header "Graph" needs this much, even when one lane is narrower. */
const GRAPH_HEADER_MIN_PX = 52
/** Where a menu opened from the keyboard appears: inset from the row's left edge, under the row. */
const KEYBOARD_MENU_INSET_PX = 24
const COMMIT_COLUMN = "minmax(0,1fr)"
const ANALYSIS_COLUMN = "6.5rem"
const AUTHOR_COLUMN = "8rem"
const DATE_COLUMN = "7rem"
type ListItem =
    | { kind: "workingTree"; key: string; count: number; isSelected: boolean; isSecond: boolean }
    | { kind: "commit"; key: string; view: CommitRowView }
    | { kind: "loadingMore"; key: string }
    | { kind: "loadMoreFailed"; key: string; sentence: string }

const NO_MARKERS: ReadonlyMap<string, AnalysedCommitMarker> = new Map()

@Component({
    selector: "cc-commit-list",
    templateUrl: "./commitList.component.html",
    imports: [CommitRowComponent, CommitGraphCellComponent, CommitContextMenuComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 flex-col" }
})
export class CommitListComponent {
    private readonly log = inject(GitLogService)
    private readonly repository = inject(GitRepositoryService)
    private readonly selection = inject(CommitSelectionService)
    private readonly clipboard = inject(CommitClipboardService)
    private readonly actions = inject(CommitActionsService)
    private readonly analysedCommits = inject(ANALYSED_COMMITS, { optional: true })
    private readonly viewport = viewChild.required<ElementRef<HTMLElement>>("viewport")
    private readonly destroyRef = inject(DestroyRef)

    private readonly scrollTop = signal(0)
    private isScrollFramePending = false
    private readonly viewportSize = signal({ width: Number.POSITIVE_INFINITY, height: 0 })
    readonly nowMs = signal(Date.now())
    readonly searchRequested = output<void>()
    readonly workingTreeRowId = rowIdOf(WORKING_TREE_KEY)
    readonly menuTarget = signal<CommitMenuTarget | null>(null)

    readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index)
    readonly rowHeight = GRAPH_ROW_HEIGHT
    readonly isAnalysisShown = this.analysedCommits !== null
    readonly isGraphShown = this.log.isGraphAvailable
    readonly isLoadingFirstPage = this.log.isLoadingFirstPage
    readonly isFiltered = this.log.isFiltered
    readonly labelLimit = computed(() => (this.viewportSize().width < NARROW_PANE_PX ? NARROW_LABEL_LIMIT : WIDE_LABEL_LIMIT))

    private readonly markers = computed(() => {
        const repo = this.repository.activeRepository()
        return repo && this.analysedCommits ? this.analysedCommits.markersFor(repo)() : NO_MARKERS
    })
    private readonly uncommittedChangeCount = this.log.uncommittedChangeCount
    private readonly trailingItem = computed<ListItem | null>(() => {
        const page = this.log.page()
        if (this.log.commits().length === 0) {
            return null
        }
        if (page.kind === "loading") {
            return { kind: "loadingMore", key: "loading-more" }
        }
        return page.kind === "failed" ? { kind: "loadMoreFailed", key: "load-more-failed", sentence: gitErrorSentence(page.error) } : null
    })
    private readonly leadingRowCount = computed(() => (this.uncommittedChangeCount() === null ? 0 : 1))
    private readonly selectableRowCount = computed(() => this.leadingRowCount() + this.log.commits().length)
    readonly activeDescendant = computed(() => {
        const index = this.focusedRowIndex()
        const item = index === null ? null : this.selectableItemAt(index)
        return item ? rowIdOf(selectionKeyOf(item)) : null
    })
    private readonly focusedRowIndex = computed(() => {
        const key = this.selection.focusedKey()
        if (key === null) {
            return null
        }
        if (key === WORKING_TREE_KEY) {
            return this.leadingRowCount() === 1 ? 0 : null
        }
        const commitIndex = this.log.commits().findIndex(commit => commit.sha === key)
        return commitIndex < 0 ? null : this.leadingRowCount() + commitIndex
    })
    readonly rowCount = computed(() => this.leadingRowCount() + this.log.commits().length + (this.trailingItem() ? 1 : 0))
    readonly window = computed(() =>
        windowOf({
            scrollTop: this.scrollTop(),
            viewportHeight: this.viewportSize().height,
            rowHeight: GRAPH_ROW_HEIGHT,
            rowCount: this.rowCount(),
            overscan: OVERSCAN_ROWS
        })
    )
    /** Rows keep their view while only the scroll position changes, so a scroll renders only the rows that enter. */
    private readonly rowViews = computed(() => {
        this.isGraphShown()
        this.log.graphRows()
        this.log.headSha()
        this.log.refLabels()
        this.markers()
        this.selection.selectedKeys()
        this.selection.secondKey()
        return new Map<string, CommitRowView>()
    })
    readonly visibleItems = computed(() => {
        const { firstIndex, lastIndex } = this.window()
        const items: ListItem[] = []
        for (let index = firstIndex; index <= lastIndex; index++) {
            items.push(this.itemAt(index))
        }
        return items
    })
    readonly gridTemplate = computed(() => {
        const columns = [COMMIT_COLUMN, AUTHOR_COLUMN, DATE_COLUMN]
        if (this.isAnalysisShown) {
            columns.splice(1, 0, ANALYSIS_COLUMN)
        }
        return this.isGraphShown() ? [`${this.graphColumnWidth()}px`, ...columns].join(" ") : columns.join(" ")
    })
    private readonly graphColumnWidth = computed(() => {
        const laneCount = maxLaneCount(this.log.graphRows())
        const lanesWidth = graphWidthFor(Math.max(1, laneCount)) + (laneCount > MAX_DRAWN_LANES ? HIDDEN_LANES_ROOM_PX : 0)
        return Math.max(GRAPH_HEADER_MIN_PX, lanesWidth)
    })
    readonly firstPageFailure = computed(() => {
        const failure = failureOf(this.log.page())
        return failure && this.log.commits().length === 0 && failure.code !== "TIMEOUT" ? gitErrorSentence(failure) : null
    })
    readonly emptyState = computed<"noCommits" | "noMatch" | null>(() => {
        const isEmpty = this.log.page().kind === "ready" && this.log.commits().length === 0 && this.uncommittedChangeCount() === null
        if (!isEmpty) {
            return null
        }
        return this.isFiltered() ? "noMatch" : "noCommits"
    })

    constructor() {
        afterNextRender(() => this.observeViewport())
        effect(() => {
            const isNearEnd = this.window().lastIndex >= this.rowCount() - NEXT_PAGE_THRESHOLD_ROWS
            const isIdle = this.log.page().kind === "ready"
            if (isNearEnd && isIdle && this.log.hasMore()) {
                untracked(() => void this.log.loadNextPage())
            }
        })
        effect(() => {
            this.log.commits()
            untracked(() => this.nowMs.set(Date.now()))
        })
    }

    onScroll() {
        if (this.isScrollFramePending) {
            return
        }
        this.isScrollFramePending = true
        const element = this.viewport().nativeElement
        requestAnimationFrame(() => {
            this.isScrollFramePending = false
            this.scrollTop.set(element.scrollTop)
        })
    }

    selectCommit(commit: GitCommitSummary, event: MouseEvent) {
        this.pick({ kind: "commit", commit }, event)
    }

    selectWorkingTree(event: MouseEvent) {
        const status = readyValueOf(this.repository.status())
        if (status) {
            this.pick({ kind: "workingTree", status }, event)
        }
    }

    onKeydown(event: KeyboardEvent) {
        const command = commitListCommandOf(event)
        if (command && this.run(command)) {
            event.preventDefault()
            event.stopPropagation()
        }
    }

    runPrimaryAction(): boolean {
        const selection = this.selection.selection()
        return selection ? this.actions.runPrimary(selection) : false
    }

    openCommitMenu(commit: GitCommitSummary, event: MouseEvent) {
        this.openMenuWithMouse({ kind: "commit", commit }, event)
    }

    openWorkingTreeMenu(event: MouseEvent) {
        event.preventDefault()
        const status = readyValueOf(this.repository.status())
        if (status) {
            this.openMenuWithMouse({ kind: "workingTree", status }, event)
        }
    }

    closeMenu({ isFocusReturned }: CommitMenuClosing) {
        this.menuTarget.set(null)
        if (isFocusReturned) {
            this.viewport().nativeElement.focus()
        }
    }

    retryPage() {
        void this.log.loadNextPage()
    }

    clearFilters() {
        this.log.clearFilter()
    }

    workingTreeRowClass(item: { isSelected: boolean; isSecond: boolean }): string {
        return selectionClassOf(item)
    }

    private pick(item: SelectionItem, event: MouseEvent) {
        if (event.ctrlKey || event.metaKey) {
            this.selection.extend(item)
        } else {
            this.selection.select(item)
        }
    }

    /** False for a command the list does not take, so the key goes on to the panel. */
    private run(command: CommitListCommand): boolean {
        switch (command.kind) {
            case "move":
                this.move(command.target, command.isExtending)
                return true
            case "copySha":
                return this.copyFocusedSha()
            case "focusSearch":
                this.searchRequested.emit()
                return true
            case "dropSecond":
                this.selection.dropSecond()
                return true
            case "runPrimary":
                return this.runPrimaryAction()
            case "openMenu":
                return this.openMenuAtFocusedRow()
        }
    }

    /** A right-click outside the selection selects that row first, as file lists do. */
    private openMenuWithMouse(item: SelectionItem, event: MouseEvent) {
        event.preventDefault()
        if (!this.selection.selectedKeys().has(selectionKeyOf(item))) {
            this.selection.select(item)
        }
        this.openMenu(item, { x: event.clientX, y: event.clientY }, false)
    }

    private openMenuAtFocusedRow(): boolean {
        const index = this.focusedRowIndex()
        const item = index === null ? null : this.selectableItemAt(index)
        if (index === null || !item) {
            return false
        }
        const viewportBox = this.viewport().nativeElement.getBoundingClientRect()
        const rowBottom = viewportBox.top + (index + 1) * GRAPH_ROW_HEIGHT - this.scrollTop()
        this.openMenu(item, { x: viewportBox.left + KEYBOARD_MENU_INSET_PX, y: rowBottom }, true)
        return true
    }

    /** The working tree has nothing to offer until a feature contributes an action for it, so it opens no menu then. */
    private openMenu(item: SelectionItem, anchor: FloatingMenuAnchor, isFromKeyboard: boolean) {
        const selection = this.selection.selection()
        if (selection && (item.kind === "commit" || this.actions.offeredFor(selection).length > 0)) {
            this.menuTarget.set({ anchor, item, selection, isFromKeyboard })
        }
    }

    private move(target: MoveTarget, isExtending: boolean) {
        const rowCount = this.selectableRowCount()
        if (rowCount === 0) {
            return
        }
        const pageSize = Math.max(1, Math.floor(this.viewportSize().height / GRAPH_ROW_HEIGHT))
        const index = rowIndexAfter(target, this.focusedRowIndex(), rowCount, pageSize)
        const item = this.selectableItemAt(index)
        if (!item) {
            return
        }
        if (isExtending) {
            this.selection.setSecond(item)
        } else {
            this.selection.select(item)
        }
        this.scrollRowIntoView(index)
    }

    private copyFocusedSha(): boolean {
        const index = this.focusedRowIndex()
        const item = index === null ? null : this.selectableItemAt(index)
        if (item?.kind !== "commit") {
            return false
        }
        void this.clipboard.copySha(item.commit)
        return true
    }

    private selectableItemAt(index: number): SelectionItem | null {
        if (this.leadingRowCount() === 1 && index === 0) {
            const status = readyValueOf(this.repository.status())
            return status ? { kind: "workingTree", status } : null
        }
        const commit = this.log.commits()[index - this.leadingRowCount()]
        return commit ? { kind: "commit", commit } : null
    }

    private scrollRowIntoView(index: number) {
        const scrollTop = this.scrollTop()
        const nextScrollTop = scrollTopShowing({
            index,
            rowHeight: GRAPH_ROW_HEIGHT,
            scrollTop,
            viewportHeight: this.viewportSize().height
        })
        if (nextScrollTop !== scrollTop) {
            this.viewport().nativeElement.scrollTop = nextScrollTop
            this.scrollTop.set(nextScrollTop)
        }
    }

    private itemAt(index: number): ListItem {
        const count = this.uncommittedChangeCount()
        if (count !== null && index === 0) {
            const key = WORKING_TREE_KEY
            const isSelected = this.selection.selectedKeys().has(key)
            return { kind: "workingTree", key, count, isSelected, isSecond: this.selection.secondKey() === key }
        }
        const commitIndex = index - this.leadingRowCount()
        const commit = this.log.commits()[commitIndex]
        return commit ? { kind: "commit", key: commit.sha, view: this.viewOf(commit, commitIndex) } : (this.trailingItem() as ListItem)
    }

    private viewOf(commit: GitCommitSummary, commitIndex: number): CommitRowView {
        const views = this.rowViews()
        const known = views.get(commit.sha)
        if (known) {
            return known
        }
        const view = {
            commit,
            graphRow: this.isGraphShown() ? (this.log.graphRows()[commitIndex] ?? null) : null,
            isHead: commit.sha === this.log.headSha(),
            labels: this.log.refLabels().get(commit.sha) ?? [],
            marker: this.markers().get(commit.sha) ?? null,
            isSelected: this.selection.selectedKeys().has(commit.sha),
            isSecond: this.selection.secondKey() === commit.sha
        }
        views.set(commit.sha, view)
        return view
    }

    private observeViewport() {
        const element = this.viewport().nativeElement
        const measure = () => this.viewportSize.set({ width: element.clientWidth, height: element.clientHeight })
        measure()
        if (typeof ResizeObserver === "undefined") {
            return
        }
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        this.destroyRef.onDestroy(() => observer.disconnect())
    }
}

function maxLaneCount(rows: readonly GraphRow[]): number {
    let max = 0
    for (const row of rows) {
        max = Math.max(max, row.laneCount)
    }
    return max
}
