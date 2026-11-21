import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import { GitRepositoryService, isGitStatus, SyncButtonComponent } from "../../../gitHistory/facade"
import { ProjectFoldersService } from "../../services/projectFolders.service"
import { ProjectsService } from "../../services/projects.service"
import { branchLabel, changesSentence, relativeTime, remoteDisplay, shortSha, upstreamState } from "../../util/folderWording"

@Component({
    selector: "cc-working-folder-card",
    templateUrl: "./workingFolderCard.component.html",
    imports: [SyncButtonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-w-0 flex-col gap-2 rounded-[10px] bg-base-100 p-4" }
})
export class WorkingFolderCardComponent {
    private readonly projects = inject(ProjectsService)
    private readonly gitRepository = inject(GitRepositoryService)
    private readonly projectFolders = inject(ProjectFoldersService)

    readonly folder = input.required<ProjectFolder>()
    readonly lastCommit = input<GitCommitSummary | null>(null)
    readonly now = input.required<number>()
    readonly relink = output<void>()

    readonly projectId = computed(() => this.projects.activeProject()?.id ?? "")
    readonly gitStatus = computed(() => this.gitRepository.statusOf({ projectId: this.projectId(), folderId: this.folder().id }))
    readonly status = computed(() => {
        const status = this.gitStatus()
        return isGitStatus(status) ? status : null
    })
    readonly problem = computed(() => {
        const status = this.gitStatus()
        return status && "problem" in status ? status.problem : null
    })
    readonly branch = computed(() => {
        const status = this.status()
        return status ? branchLabel(status) : ""
    })
    readonly upstream = computed(() => {
        const status = this.status()
        return status ? { name: status.upstream?.name ?? null, ...upstreamState(status) } : null
    })
    readonly changes = computed(() => {
        const status = this.status()
        return status ? { sentence: changesSentence(status), needsAttention: status.operationInProgress !== null } : null
    })
    readonly remotes = computed(() =>
        (this.folder().git?.remotes ?? []).map(remote => ({ name: remote.name, address: remoteDisplay(remote) }))
    )
    readonly lastCommitLine = computed(() => {
        const commit = this.lastCommit()
        return commit
            ? {
                  sha: shortSha(commit.sha),
                  subject: commit.subject,
                  author: commit.authorName,
                  when: relativeTime(commit.committedAt, this.now())
              }
            : null
    })

    showInFiles() {
        void this.projectFolders.revealFolder(this.folder().id)
    }
}
