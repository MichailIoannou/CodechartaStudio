import { inject } from "@angular/core"
import type { CommitAction, CommitSelection } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { BatchAnalysisDialogService } from "../services/batchAnalysisDialog.service"
import { SnapshotBadgeProvider } from "../services/snapshotBadgeProvider.service"
import { SnapshotViewService } from "../services/snapshotView.service"

/** Already analysed, or on its way: the commit needs no new analysis. */
const STATES_WITHOUT_ANALYSE: ReadonlySet<string> = new Set(["analysed", "queued", "running"])

/** Design S5: "Analyse This Commit", offered only for a commit without an analysis (a failed one may be retried). */
export function analyseThisCommitAction(): CommitAction {
    const view = inject(SnapshotViewService)
    const badges = inject(SnapshotBadgeProvider)
    return {
        id: "snapshots.analyseCommit",
        label: "Analyse This Commit",
        detailsLabel: "Analyse this commit",
        icon: "fa-solid fa-play",
        hoverHint: "Run ccsh on this commit in a temporary worktree",
        isPrimary: false,
        isOfferedFor: selection => {
            const sha = singleCommitShaOf(selection)
            const state = sha ? badges.markerOf(selection.repo, sha)?.state : undefined
            return sha !== null && !(state && STATES_WITHOUT_ANALYSE.has(state))
        },
        run: selection => {
            const sha = singleCommitShaOf(selection)
            if (sha) {
                void view.analyse({ folder: selection.repo, target: { kind: "commit", sha }, surface: "status" })
            }
        }
    }
}

/** Design S5: "Analyse the Last Commits from Here…" opens the batch dialog counting back from this commit. */
export function analyseLastCommitsAction(): CommitAction {
    const batchDialog = inject(BatchAnalysisDialogService)
    const projects = inject(ProjectsFacade)
    return {
        id: "snapshots.analyseLastCommits",
        label: "Analyse the Last Commits from Here…",
        icon: "fa-solid fa-layer-group",
        hoverHint: "Analyse several commits of this line",
        isPrimary: false,
        isOfferedFor: selection => singleCommitShaOf(selection) !== null,
        run: selection => {
            const folderLabel = projects.activeProject()?.folders.find(folder => folder.id === selection.repo.folderId)?.label ?? ""
            batchDialog.show({ folder: selection.repo, folderLabel, tipSha: singleCommitShaOf(selection) })
        }
    }
}

/** Design S5: "Analyse Working Tree" in the menu of the uncommitted changes. */
export function analyseWorkingTreeAction(): CommitAction {
    const view = inject(SnapshotViewService)
    return {
        id: "snapshots.analyseWorkingTree",
        label: "Analyse Working Tree",
        icon: "fa-solid fa-play",
        hoverHint: "Analyse the files as they are on disk now",
        isPrimary: false,
        isOfferedFor: selection => selection.items.length === 1 && selection.items[0].kind === "workingTree",
        run: selection => void view.analyse({ folder: selection.repo, target: { kind: "workingTree" }, surface: "status" })
    }
}

function singleCommitShaOf(selection: CommitSelection): string | null {
    const [item] = selection.items
    return selection.items.length === 1 && item.kind === "commit" ? item.commit.sha : null
}
