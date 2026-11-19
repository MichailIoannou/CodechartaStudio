import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from "@angular/core"
import { ColumnResizeHandleDirective } from "../../../shared/facade"
import { failureOf, readyValueOf } from "../../model/loadState"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { HistoryLayoutService } from "../../services/historyLayout.service"
import { problemNoticeOf } from "../../util/gitErrorText"
import { CommitScopeChipComponent } from "../commitScopeChip/commitScopeChip.component"
import { GitProblemNoticeComponent } from "../gitProblemNotice/gitProblemNotice.component"
import { HistoryToolbarComponent } from "../historyToolbar/historyToolbar.component"

export interface FolderToRelink {
    id: string
    label: string
}

@Component({
    selector: "cc-git-history-panel",
    templateUrl: "./gitHistoryPanel.component.html",
    imports: [HistoryToolbarComponent, GitProblemNoticeComponent, CommitScopeChipComponent, ColumnResizeHandleDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex h-full flex-col", "(keydown.f5)": "refreshByKey($event)" }
})
export class GitHistoryPanelComponent {
    private readonly repository = inject(GitRepositoryService)
    readonly layout = inject(HistoryLayoutService)
    readonly relinkFolder = output<FolderToRelink>()
    readonly openDesktopTools = output<void>()

    private readonly isShallowNoticeDismissed = signal(false)

    readonly problemNotice = computed(() => {
        const folder = this.repository.workingFolder()
        const failure = [this.repository.repository(), this.repository.status(), this.repository.refs()].map(failureOf).find(Boolean)
        return failure && folder ? problemNoticeOf(failure, folder) : null
    })
    readonly isShallowNoticeShown = computed(
        () => !this.isShallowNoticeDismissed() && (readyValueOf(this.repository.repository())?.isShallow ?? false)
    )

    dismissShallowNotice() {
        this.isShallowNoticeDismissed.set(true)
    }

    relinkWorkingFolder() {
        const folder = this.repository.workingFolder()
        if (folder) {
            this.relinkFolder.emit({ id: folder.id, label: folder.label })
        }
    }

    refreshByKey(event: Event) {
        event.preventDefault()
        event.stopPropagation()
        void this.repository.refresh("manual")
    }
}
