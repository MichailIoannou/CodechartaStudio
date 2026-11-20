import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import type { GitEntryKind } from "../../../../model/coreApi/GitEntryKind"
import { failureOf, readyValueOf } from "../../model/loadState"
import { GitChangesService } from "../../services/gitChanges.service"
import { diffLinesOf } from "../../util/diffLines"
import { gitErrorSentence } from "../../util/gitErrorText"
import { DiffLinesComponent } from "../diffLines/diffLines.component"

const KIND_BADGES: Record<GitEntryKind, string> = {
    staged: "badge-ghost",
    unstaged: "badge-ghost",
    untracked: "badge-ghost",
    conflicted: "badge-warning"
}
const SKELETON_LINE_COUNT = 8

@Component({
    selector: "cc-diff-view",
    templateUrl: "./diffView.component.html",
    imports: [DiffLinesComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 min-w-0 flex-1 flex-col", "data-testid": "diff-view" }
})
export class DiffViewComponent {
    private readonly changes = inject(GitChangesService)

    readonly skeletonLines = Array.from({ length: SKELETON_LINE_COUNT }, (_, index) => index)
    readonly row = this.changes.shownRow
    readonly kindBadgeClass = computed(() => {
        const row = this.row()
        return row ? KIND_BADGES[row.entry.kind] : ""
    })
    readonly isLoading = computed(() => this.changes.diff().kind === "loading")
    readonly failure = computed(() => {
        const failure = failureOf(this.changes.diff())
        return failure ? gitErrorSentence(failure) : null
    })
    readonly diff = computed(() => readyValueOf(this.changes.diff()))
    readonly lines = computed(() => {
        const diff = this.diff()
        return diff && !diff.isBinary ? diffLinesOf(diff.text) : []
    })

    retry() {
        this.changes.retryDiff()
    }
}
