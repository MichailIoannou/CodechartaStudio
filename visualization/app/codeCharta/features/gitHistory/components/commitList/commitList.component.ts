import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    inject,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import { SelectionItem, WORKING_TREE_KEY } from "../../model/commitSelection"
import { failureOf, readyValueOf } from "../../model/loadState"
import { ANALYSED_COMMITS, AnalysedCommitMarker } from "../../ports/analysedCommits.port"
import { CommitSelectionService } from "../../services/commitSelection.service"
import { GitLogService } from "../../services/gitLog.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { gitErrorSentence } from "../../util/gitErrorText"
import { GraphRow } from "../../util/graphLayout"
import { GRAPH_ROW_HEIGHT, graphWidthFor, MAX_DRAWN_LANES } from "../../util/graphRowGeometry"
import { windowOf } from "../../util/virtualWindow"
import { CommitGraphCellComponent } from "../commitGraphCell/commitGraphCell.component"
import { CommitRowComponent, CommitRowView, selectionClassOf } from "../commitRow/commitRow.component"

const NEXT_PAGE_THRESHOLD_ROWS = 100
const OVERSCAN_ROWS = 10
const SKELETON_ROW_COUNT = 8
const NARROW_PANE_PX = 640
const WIDE_LABEL_LIMIT = 3
const NARROW_LABEL_LIMIT = 1
/** Room for the `+n` beside the drawn lanes. */
const HIDDEN_LANES_ROOM_PX = 24
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
    imports: [CommitRowComponent, CommitGraphCellComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 flex-col" }
})
export class CommitListComponent {
    private readonly log = inject(GitLogService)
    private readonly repository = inject(GitRepositoryService)
    private readonly selection = inject(CommitSelectionService)
    private readonly analysedCommits = inject(ANALYSED_COMMITS, { optional: true })
    private readonly viewport = viewChild.required<ElementRef<HTMLElement>>("viewport")
    private readonly destroyRef = inject(DestroyRef)

    private readonly scrollTop = signal(0)
    private isScrollFramePending = false
    private readonly viewportSize = signal({ width: Number.POSITIVE_INFINITY, height: 0 })
    readonly nowMs = signal(Date.now())

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
        return graphWidthFor(Math.max(1, laneCount)) + (laneCount > MAX_DRAWN_LANES ? HIDDEN_LANES_ROOM_PX : 0)
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
