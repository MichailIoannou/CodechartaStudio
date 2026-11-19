import { Injectable, inject, signal } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"

export const RECENT_COMMIT_COUNT = 10

/** `undefined` while unknown, `null` when git could not answer. */
export type FolderGitStatus = GitStatus | null | undefined

@Injectable({ providedIn: "root" })
export class FolderGitService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly statuses = signal<Record<string, GitStatus | null>>({})

    statusOf(folder: FolderRef): FolderGitStatus {
        return this.statuses()[keyOf(folder)]
    }

    async refresh(folders: FolderRef[]): Promise<void> {
        await Promise.all(folders.map(folder => this.refreshOne(folder)))
    }

    async recentCommits(folder: FolderRef): Promise<GitCommitSummary[] | null> {
        const answer = await this.environment
            .requireBridge()
            .request("git.log", { repo: folder, scope: { kind: "head" }, filter: null, cursor: null })
        return answer.ok ? answer.value.commits.slice(0, RECENT_COMMIT_COUNT) : null
    }

    private async refreshOne(folder: FolderRef): Promise<void> {
        const answer = await this.environment.requireBridge().request("git.status", { repo: folder })
        const status = answer.ok ? answer.value : null
        this.statuses.update(statuses => ({ ...statuses, [keyOf(folder)]: status }))
    }
}

function keyOf(folder: FolderRef): string {
    return `${folder.projectId}/${folder.folderId}`
}
