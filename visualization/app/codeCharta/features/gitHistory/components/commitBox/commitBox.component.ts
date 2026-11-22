import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { CommitMessageService } from "../../services/commitMessage.service"

/** Longer summaries still commit; many git tools cut them off, so the counter warns. */
const SUMMARY_SOFT_LIMIT = 72
const LONG_SUMMARY_TITLE = "Long summaries are cut off in many git tools"

@Component({
    selector: "cc-commit-box",
    templateUrl: "./commitBox.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex flex-col gap-2 border-t border-base-300 p-2", "data-testid": "commit-box", "(keydown)": "onKeydown($event)" }
})
export class CommitBoxComponent {
    readonly commits = inject(CommitMessageService)
    readonly summaryLimit = SUMMARY_SOFT_LIMIT
    readonly summaryLength = computed(() => this.commits.message().subject.length)
    readonly isSummaryLong = computed(() => this.summaryLength() > SUMMARY_SOFT_LIMIT)
    readonly counterTitle = computed(() => (this.isSummaryLong() ? LONG_SUMMARY_TITLE : ""))

    editSubject(event: Event) {
        this.commits.edit({ subject: (event.target as HTMLInputElement).value })
    }

    editBody(event: Event) {
        this.commits.edit({ body: (event.target as HTMLTextAreaElement).value })
    }

    toggleAmend(event: Event) {
        void this.commits.setAmend((event.target as HTMLInputElement).checked)
    }

    commit() {
        void this.commits.commit()
    }

    onKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            event.stopPropagation()
            this.commit()
        }
    }
}
