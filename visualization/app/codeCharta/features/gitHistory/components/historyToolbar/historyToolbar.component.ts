import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { shortSha } from "../../../../util/wording"
import { readyValueOf } from "../../model/loadState"
import { GitLogService } from "../../services/gitLog.service"
import { GitRepositoryService } from "../../services/gitRepository.service"

const OPERATION_BADGES: Partial<Record<string, string>> = { merge: "merging", rebase: "rebasing" }

@Component({
    selector: "cc-history-toolbar",
    templateUrl: "./historyToolbar.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-10 items-center gap-2 whitespace-nowrap border-b border-base-300 px-2 py-1" }
})
export class HistoryToolbarComponent {
    private readonly repository = inject(GitRepositoryService)
    private readonly log = inject(GitLogService)

    readonly folderLabel = computed(() => this.repository.workingFolder()?.label ?? "")
    readonly repositoryTitle = computed(() => {
        const folder = this.repository.workingFolder()
        const project = this.repository.activeProject()
        return folder && project ? `Folder ${folder.path} of project '${project.name}' — change it in the project menu` : ""
    })
    readonly head = computed(() => readyValueOf(this.repository.status())?.head ?? null)
    readonly detachedAt = computed(() => {
        const head = this.head()
        return head?.kind === "detached" ? shortSha(head.commit) : null
    })
    readonly operationBadge = computed(() => {
        const operation = readyValueOf(this.repository.status())?.operationInProgress
        return operation ? (OPERATION_BADGES[operation] ?? null) : null
    })
    readonly isRefreshing = this.repository.isRefreshing

    scopeToCurrentBranch() {
        const head = this.head()
        if (head?.kind === "branch") {
            this.log.scopeTo(`refs/heads/${head.name}`)
        }
    }

    refresh() {
        void this.repository.refresh("manual")
    }
}
