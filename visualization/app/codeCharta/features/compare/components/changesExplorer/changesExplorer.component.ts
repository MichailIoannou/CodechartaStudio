import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, OnDestroy, signal, viewChild } from "@angular/core"
import { changeBadgeOf } from "../../../gitHistory/facade"
import { ExplorerModeService, ExplorerScrollHostService, ListViewport, listWindow } from "../../../sidebarExplorer/facade"
import { CHANGES_EXPLORER_MODE } from "../../provideChangesExplorerMode"
import { ChangedFileRow, gitChangedFileRows, metricChangedFileRows } from "../../selectors/changedFileRows"
import { deltaChangeSummaryOf, gitChangeLine, signedNumber } from "../../selectors/deltaChangeSummary"
import { ChangedFilesService } from "../../services/changedFiles.service"
import { ChangesReadStore } from "../../stores/changes.read.store"
import { CompareStore } from "../../stores/compare.store"
import { CompareWriteStore } from "../../stores/compare.write.store"

const ROW_SELECTOR = "[data-change-row]"
const FALLBACK_ROOT_PATH = "/root"
const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }
const METRICS_SOURCE_TITLE = "No clone has both commits, so the list shows files whose metrics changed."

/** Design C8: the explorer's Changes mode, listing the files a comparison changed. */
@Component({
    selector: "cc-changes-explorer",
    templateUrl: "./changesExplorer.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block" }
})
export class ChangesExplorerComponent implements OnDestroy {
    private readonly compareStore = inject(CompareStore)
    private readonly readStore = inject(ChangesReadStore)
    private readonly writeStore = inject(CompareWriteStore)
    private readonly changedFilesService = inject(ChangedFilesService)
    private readonly modeService = inject(ExplorerModeService)
    private readonly scrollHostService = inject(ExplorerScrollHostService)
    private readonly viewport = new ListViewport(ROW_SELECTOR)
    private readonly list = viewChild<ElementRef<HTMLElement>>("list")
    private readonly activeIndex = signal(-1)

    readonly isChangesModeActive = computed(() => this.modeService.activeMode().id === CHANGES_EXPLORER_MODE.id)
    private readonly changedFiles = computed(() => this.compareStore.state().changedFiles)
    private readonly root = computed(() => this.readStore.accumulatedData().unifiedMapNode)
    readonly isLoading = computed(() => this.changedFiles() === "loading")
    readonly gitFiles = computed(() => {
        const changedFiles = this.changedFiles()
        return changedFiles !== null && changedFiles !== "loading" && changedFiles.source === "git" ? changedFiles.files : null
    })
    readonly rows = computed(() => this.rowsOfTheList())
    readonly summary = computed(() => deltaChangeSummaryOf(this.root(), [this.readStore.areaMetric(), this.readStore.heightMetric()]))
    readonly gitLine = computed(() => {
        const files = this.gitFiles()
        return files ? gitChangeLine(files) : null
    })
    readonly sourceLine = computed(() => (this.gitFiles() ? "Files changed in git" : "Files with metric changes"))
    readonly sourceTitle = computed(() => (this.gitFiles() ? "" : METRICS_SOURCE_TITLE))
    readonly isOnlyChangedFiles = computed(() => this.readStore.changedFilesFilter() !== null)
    readonly selectedPath = this.readStore.selectedNodePath
    readonly window = computed(() => listWindow({ ...this.viewport.geometry(), rowCount: this.rows().length }))
    readonly renderedRows = computed(() =>
        this.rows()
            .slice(this.window().firstIndex, this.window().lastIndex + 1)
            .map((row, offset) => ({ row, index: this.window().firstIndex + offset }))
    )
    readonly activeDescendant = computed(() => (this.activeIndex() >= 0 ? `changes-row-${this.activeIndex()}` : null))
    readonly changeBadgeOf = changeBadgeOf
    readonly signedNumber = signedNumber
    readonly areDeltaColorsInverted = this.readStore.areDeltaColorsInverted

    constructor() {
        effect(() => {
            const list = this.list()
            if (list) {
                this.viewport.attachTo(list.nativeElement, this.scrollHostService.element())
            }
        })
    }

    ngOnDestroy(): void {
        this.viewport.dispose()
    }

    rowClassOf(row: ChangedFileRow): string {
        if (!row.hasNode) {
            return "opacity-50"
        }
        return row.path === this.selectedPath() ? "cursor-pointer bg-primary/20 font-semibold" : "cursor-pointer hover:bg-base-200"
    }

    toggleOnlyChangedFiles(event: Event): void {
        this.changedFilesService.setOnlyChangedFiles((event.target as HTMLInputElement).checked)
    }

    select(row: ChangedFileRow, index: number): void {
        if (row.hasNode) {
            this.activeIndex.set(index)
            this.writeStore.selectNode(row.path)
        }
    }

    focusFolder(row: ChangedFileRow, event?: Event): void {
        event?.stopPropagation()
        this.writeStore.focusFolder(row.folderPath)
    }

    onKeydown(event: KeyboardEvent): void {
        const row = this.rows()[this.activeIndex()]
        if (event.key in STEPS) {
            this.move(STEPS[event.key])
        } else if (event.key === "Enter" && row) {
            this.focusFolder(row)
        } else {
            return
        }
        event.preventDefault()
        event.stopPropagation()
    }

    private move(step: number): void {
        const rows = this.rows()
        const next = Math.min(Math.max(this.activeIndex() + step, 0), rows.length - 1)
        if (next >= 0) {
            this.activeIndex.set(next)
            this.select(rows[next], next)
        }
    }

    private rowsOfTheList(): ChangedFileRow[] {
        const files = this.gitFiles()
        const context = { rootPath: this.root()?.path ?? FALLBACK_ROOT_PATH, heightMetric: this.readStore.heightMetric() }
        if (files) {
            return gitChangedFileRows(files, { ...context, pathToNode: this.readStore.pathToNode() })
        }
        return this.isLoading() ? [] : metricChangedFileRows(this.root(), context)
    }
}
