import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import { relativeTime } from "../../../../util/wording"
import type { AnalysedCommitMarker } from "../../ports/analysedCommits.port"
import { analysisBadgeOf } from "../../util/analysisBadge"
import { commitDateTime } from "../../util/commitDate"
import type { GraphRow } from "../../util/graphLayout"
import type { RefLabel } from "../../util/refLabels"
import { SELECTED_ROW_CLASS } from "../../util/rowSelection"
import { CommitGraphCellComponent } from "../commitGraphCell/commitGraphCell.component"

export interface CommitRowView {
    commit: GitCommitSummary
    /** Null while the graph is hidden. */
    graphRow: GraphRow | null
    isHead: boolean
    labels: readonly RefLabel[]
    marker: AnalysedCommitMarker | null
    isSelected: boolean
    /** The item Ctrl+click or Shift+arrow added beside the first. */
    isSecond: boolean
}

const LABEL_CLASSES: Record<RefLabel["kind"], string> = {
    currentBranch: "badge-primary",
    detachedHead: "badge-warning",
    localBranch: "badge-outline badge-primary",
    remoteBranch: "badge-ghost",
    tag: "badge-outline badge-accent"
}
const LABEL_ICONS: Record<RefLabel["kind"], string | null> = {
    currentBranch: "fa-check",
    detachedHead: null,
    localBranch: "fa-code-branch",
    remoteBranch: "fa-cloud",
    tag: "fa-tag"
}
const ROW_CLASS = "grid h-7 cursor-pointer select-none items-center gap-2 whitespace-nowrap px-2 text-sm hover:bg-base-200"
// pl-1.5 + the 2 px border keep the px-2 inset, so the graph lanes stay in line with the rows around it
const SECOND_ROW_CLASS = `${SELECTED_ROW_CLASS} border-l-2 border-primary pl-1.5`

/** The element id `aria-activedescendant` names for the row of a selection key. */
export function rowIdOf(key: string): string {
    return `commit-option-${key}`
}

/** Design H8: selected rows are tinted and outlined; the second selection also gets a left border. */
export function selectionClassOf({ isSelected, isSecond }: { isSelected: boolean; isSecond: boolean }): string {
    if (!isSelected) {
        return ""
    }
    return isSecond ? SECOND_ROW_CLASS : SELECTED_ROW_CLASS
}

@Component({
    selector: "cc-commit-row",
    templateUrl: "./commitRow.component.html",
    imports: [CommitGraphCellComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        role: "option",
        "data-testid": "commit-row",
        "[class]": "rowClass()",
        "[style.grid-template-columns]": "gridTemplate()",
        "[attr.aria-selected]": "view().isSelected",
        "[id]": "rowId()"
    }
})
export class CommitRowComponent {
    readonly view = input.required<CommitRowView>()
    readonly gridTemplate = input.required<string>()
    readonly isAnalysisShown = input(false)
    readonly labelLimit = input(3)
    readonly nowMs = input.required<number>()

    readonly rowClass = computed(() => `${ROW_CLASS} ${selectionClassOf(this.view())}`.trim())
    readonly rowId = computed(() => rowIdOf(this.view().commit.sha))
    readonly shownLabels = computed(() => this.view().labels.slice(0, this.labelLimit()))
    readonly hiddenLabelCount = computed(() => Math.max(0, this.view().labels.length - this.labelLimit()))
    readonly allLabelsTitle = computed(() =>
        this.view()
            .labels.map(label => label.refName)
            .join("\n")
    )
    readonly analysisBadge = computed(() => {
        const marker = this.view().marker
        return marker ? analysisBadgeOf(marker) : null
    })
    readonly authorTitle = computed(() => `${this.view().commit.authorName} <${this.view().commit.authorEmail}>`)
    readonly relativeDate = computed(() => relativeTime(this.view().commit.authoredAt, this.nowMs()))
    readonly absoluteDate = computed(() => commitDateTime(this.view().commit.authoredAt))

    labelClassOf(label: RefLabel): string {
        return LABEL_CLASSES[label.kind]
    }

    labelIconOf(label: RefLabel): string | null {
        return LABEL_ICONS[label.kind]
    }
}
