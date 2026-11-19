import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core"
import { relativeTime } from "../../../../util/wording"
import { failureOf, readyValueOf } from "../../model/loadState"
import { GitLogService } from "../../services/gitLog.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { HistoryLayoutService } from "../../services/historyLayout.service"
import { ALL_BRANCHES_ROW_ID, BranchRef, BranchRow, branchRows, buildBranchTree, hasAnyRef } from "../../util/branchTree"
import { gitErrorSentence } from "../../util/gitErrorText"

const ROW_ID_PREFIX = "cc-branch-row-"
const ROW_INDENT_REM = 0.75
const ROW_PADDING_REM = 0.5
const SCOPED_ROW_CLASS = "bg-primary/20 font-semibold"
const ACTIVE_ROW_CLASS = "group-focus-visible:outline"

@Component({
    selector: "cc-branches-tree",
    templateUrl: "./branchesTree.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 flex-col" }
})
export class BranchesTreeComponent {
    private readonly repository = inject(GitRepositoryService)
    private readonly log = inject(GitLogService)
    private readonly layout = inject(HistoryLayoutService)

    readonly filter = signal("")
    private readonly uncappedIds = signal<ReadonlySet<string>>(new Set())
    private readonly activeRowId = signal(ALL_BRANCHES_ROW_ID)

    private readonly tree = computed(() => {
        const refs = readyValueOf(this.repository.refs())
        return refs ? buildBranchTree(refs) : null
    })
    readonly rows = computed(() => {
        const tree = this.tree()
        const options = { filter: this.filter(), toggledIds: this.layout.toggledGroups(), uncappedIds: this.uncappedIds() }
        return tree ? branchRows(tree, options) : []
    })
    readonly hasNoCommits = computed(() => {
        const tree = this.tree()
        return tree !== null && !hasAnyRef(tree)
    })
    readonly hasNoMatch = computed(() => this.filter().trim() !== "" && this.rows().length === 1)
    readonly refsFailure = computed(() => {
        const failure = failureOf(this.repository.refs())
        return failure ? gitErrorSentence(failure) : null
    })
    readonly activeDescendant = computed(() => ROW_ID_PREFIX + this.activeRowId())
    readonly scopedRefNames = this.log.scopedRefNames

    rowElementId(row: BranchRow): string {
        return ROW_ID_PREFIX + row.id
    }

    indentOf(row: BranchRow): number {
        return ROW_PADDING_REM + row.depth * ROW_INDENT_REM
    }

    isScoped(row: BranchRow): boolean {
        if (row.kind === "all") {
            return this.scopedRefNames().length === 0
        }
        return row.kind === "ref" && this.scopedRefNames().includes(row.ref.refName)
    }

    rowStateClass(row: BranchRow): string {
        const scoped = this.isScoped(row) ? SCOPED_ROW_CLASS : ""
        const active = row.id === this.activeRowId() ? ACTIVE_ROW_CLASS : ""
        return `${scoped} ${active}`.trim()
    }

    titleOf(ref: BranchRef): string {
        if (!ref.lastCommit) {
            return ref.refName
        }
        return `${ref.refName}\nLast commit: ${ref.lastCommit.subject}, ${relativeTime(ref.lastCommit.committedAt, Date.now())}`
    }

    activate(row: BranchRow, event?: MouseEvent | KeyboardEvent) {
        this.activeRowId.set(row.id)
        switch (row.kind) {
            case "all":
                this.log.showAllBranches()
                break
            case "ref":
                this.log.scopeTo(row.ref.refName, { isAdded: Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey) })
                break
            case "showAll":
                this.uncappedIds.update(ids => new Set([...ids, row.groupId]))
                break
            default:
                this.layout.toggleGroup(row.id)
        }
    }

    retry() {
        void this.repository.refresh("manual")
    }

    onKeydown(event: KeyboardEvent) {
        const rows = this.rows()
        const index = rows.findIndex(row => row.id === this.activeRowId())
        const handled = this.handleKey(event, rows, Math.max(index, 0))
        if (handled) {
            event.preventDefault()
            event.stopPropagation()
        }
    }

    private handleKey(event: KeyboardEvent, rows: BranchRow[], index: number): boolean {
        const row = rows[index]
        switch (event.key) {
            case "ArrowDown":
                return this.moveTo(rows[Math.min(index + 1, rows.length - 1)])
            case "ArrowUp":
                return this.moveTo(rows[Math.max(index - 1, 0)])
            case "ArrowRight":
                return this.expandOrEnter(row, rows[index + 1])
            case "ArrowLeft":
                return this.collapseOrLeave(row, rows, index)
            case "Enter":
                this.activate(row, event)
                return true
            default:
                return false
        }
    }

    private expandOrEnter(row: BranchRow, next: BranchRow | undefined): boolean {
        if (!isContainer(row)) {
            return false
        }
        return row.isExpanded ? this.moveTo(next) : this.toggle(row)
    }

    private collapseOrLeave(row: BranchRow, rows: BranchRow[], index: number): boolean {
        if (isContainer(row) && row.isExpanded) {
            return this.toggle(row)
        }
        const parent = rows
            .slice(0, index)
            .reverse()
            .find(candidate => candidate.depth < row.depth)
        return this.moveTo(parent)
    }

    private toggle(row: BranchRow): boolean {
        this.layout.toggleGroup(row.id)
        return true
    }

    private moveTo(row: BranchRow | undefined): boolean {
        if (row) {
            this.activeRowId.set(row.id)
            document.getElementById(this.rowElementId(row))?.scrollIntoView?.({ block: "nearest" })
        }
        return true
    }
}

function isContainer(row: BranchRow | undefined): row is Extract<BranchRow, { kind: "group" | "folder" }> {
    return row?.kind === "group" || row?.kind === "folder"
}
