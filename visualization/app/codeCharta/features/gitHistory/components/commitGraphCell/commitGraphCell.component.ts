import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import { GraphRow, WORKING_TREE_COLOR } from "../../util/graphLayout"
import { GRAPH_ROW_HEIGHT, rowGeometry, workingTreeGeometry } from "../../util/graphRowGeometry"

const LANE_COLOR_CLASSES = [
    "text-primary",
    "text-secondary",
    "text-accent",
    "text-info",
    "text-success",
    "text-warning",
    "text-error",
    "text-base-content/60"
]
const WORKING_TREE_COLOR_CLASS = "text-warning"

export function laneColorClass(color: number): string {
    return color === WORKING_TREE_COLOR ? WORKING_TREE_COLOR_CLASS : LANE_COLOR_CLASSES[color % LANE_COLOR_CLASSES.length]
}

@Component({
    selector: "cc-commit-graph-cell",
    templateUrl: "./commitGraphCell.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex h-7 items-center gap-0.5 overflow-hidden" }
})
export class CommitGraphCellComponent {
    /** Null draws the uncommitted changes on top of HEAD. */
    readonly row = input<GraphRow | null>(null)
    readonly isHead = input(false)

    readonly height = GRAPH_ROW_HEIGHT
    readonly geometry = computed(() => {
        const row = this.row()
        return row ? rowGeometry(row) : workingTreeGeometry()
    })
    readonly isWorkingTree = computed(() => this.row() === null)
    readonly viewBox = computed(() => `0 0 ${this.geometry().width} ${GRAPH_ROW_HEIGHT}`)

    colorClassOf(color: number): string {
        return laneColorClass(color)
    }
}
