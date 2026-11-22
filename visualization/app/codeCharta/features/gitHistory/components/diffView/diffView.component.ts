import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import type { GitEntryKind } from "../../../../model/coreApi/GitEntryKind"
import { CopyCommandComponent } from "../../../shared/facade"
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
const PLAIN_SHELL_WORD = /^[\w./@+-]+$/
const WINDOWS_USER_AGENT = /Windows/

@Component({
    selector: "cc-diff-view",
    templateUrl: "./diffView.component.html",
    imports: [DiffLinesComponent, CopyCommandComponent],
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
    private readonly diffFailure = computed(() => failureOf(this.changes.diff()))
    readonly isTooLarge = computed(() => this.diffFailure()?.code === "OUTPUT_TOO_LARGE")
    readonly failure = computed(() => {
        const failure = this.diffFailure()
        return failure && !this.isTooLarge() ? gitErrorSentence(failure) : null
    })
    readonly terminalDiffCommand = computed(() => {
        const entry = this.row()?.entry
        return entry ? terminalDiffCommandOf(entry.path, entry.kind, WINDOWS_USER_AGENT.test(navigator.userAgent)) : ""
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

/** git diff shows nothing for an untracked file, so it is compared with the system's empty file. */
function terminalDiffCommandOf(path: string, kind: GitEntryKind, isWindows: boolean): string {
    const quotedPath = PLAIN_SHELL_WORD.test(path) ? path : `"${path}"`
    switch (kind) {
        case "staged":
            return `git diff --cached -- ${quotedPath}`
        case "untracked":
            return `git diff --no-index -- ${isWindows ? "NUL" : "/dev/null"} ${quotedPath}`
        default:
            return `git diff -- ${quotedPath}`
    }
}
