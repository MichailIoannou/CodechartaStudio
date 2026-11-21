import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from "@angular/core"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import { ColumnResizeHandleDirective, ToastOffsetDirective } from "../../../shared/facade"
import { failureOf, readyValueOf } from "../../model/loadState"
import { GitLogService } from "../../services/gitLog.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { HistoryLayoutService } from "../../services/historyLayout.service"
import { HistoryNavigation } from "../../services/historyNavigation.service"
import { HistoryTabService } from "../../services/historyTab.service"
import { GitFolderChoice, problemNoticeOf } from "../../util/gitErrorText"
import { BranchesTreeComponent } from "../branchesTree/branchesTree.component"
import { ChangesPanelComponent } from "../changesPanel/changesPanel.component"
import { CommitDetailsComponent } from "../commitDetails/commitDetails.component"
import { CommitFiltersComponent } from "../commitFilters/commitFilters.component"
import { CommitGraphLegendComponent } from "../commitGraphLegend/commitGraphLegend.component"
import { CommitListComponent } from "../commitList/commitList.component"
import { CommitScopeChipComponent } from "../commitScopeChip/commitScopeChip.component"
import { DiffViewComponent } from "../diffView/diffView.component"
import { GitProblemNoticeComponent } from "../gitProblemNotice/gitProblemNotice.component"
import { HistoryToolbarComponent } from "../historyToolbar/historyToolbar.component"
import { OperationStateBannerComponent } from "../operationStateBanner/operationStateBanner.component"

const COMMIT_GRAPH_COMMAND = "git commit-graph write --reachable"

export interface FolderToRelink {
    id: string
    label: string
}

@Component({
    selector: "cc-git-history-panel",
    templateUrl: "./gitHistoryPanel.component.html",
    imports: [
        HistoryToolbarComponent,
        BranchesTreeComponent,
        GitProblemNoticeComponent,
        CommitScopeChipComponent,
        CommitListComponent,
        CommitFiltersComponent,
        CommitGraphLegendComponent,
        CommitDetailsComponent,
        ColumnResizeHandleDirective,
        ChangesPanelComponent,
        DiffViewComponent,
        OperationStateBannerComponent,
        ToastOffsetDirective
    ],
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex h-full flex-col", "(keydown.f5)": "refreshByKey($event)" }
})
export class GitHistoryPanelComponent {
    private readonly repository = inject(GitRepositoryService)
    private readonly log = inject(GitLogService)
    readonly layout = inject(HistoryLayoutService)
    readonly tab = inject(HistoryTabService).tab
    readonly clipboard = inject(CopyToClipboardService)
    readonly isShown = inject(HistoryNavigation).isShown
    readonly commitGraphCommand = COMMIT_GRAPH_COMMAND
    readonly relinkFolder = output<FolderToRelink>()
    readonly openDesktopTools = output<void>()
    readonly workInFolder = output<GitFolderChoice>()
    readonly chooseWorkingFolder = output<void>()

    private readonly isShallowNoticeDismissed = signal(false)

    private readonly otherGitFolders = computed<GitFolderChoice[]>(() =>
        (this.repository.activeProject()?.folders ?? [])
            .filter(folder => folder.kind === "git" && folder.status === "ok" && folder.id !== this.repository.workingFolder()?.id)
            .map(({ id, label }) => ({ id, label }))
    )
    readonly problemNotice = computed(() => {
        const folder = this.repository.workingFolder()
        const failure = [this.repository.repository(), this.repository.status(), this.repository.refs()].map(failureOf).find(Boolean)
        return failure && folder ? problemNoticeOf(failure, folder, this.otherGitFolders()) : null
    })
    readonly isShallowNoticeShown = computed(
        () => !this.isShallowNoticeDismissed() && (readyValueOf(this.repository.repository())?.isShallow ?? false)
    )

    readonly isSlowHistoryNoticeShown = computed(() => failureOf(this.log.page())?.code === "TIMEOUT" && this.log.commits().length === 0)

    copyCommitGraphCommand() {
        void this.clipboard.copy(COMMIT_GRAPH_COMMAND)
    }

    retryHistory() {
        void this.log.reload()
    }

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
