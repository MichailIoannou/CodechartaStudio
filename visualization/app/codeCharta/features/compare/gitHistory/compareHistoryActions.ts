import { inject } from "@angular/core"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { BranchAction, BranchMenuTarget, CommitAction, CommitSelection } from "../../gitHistory/facade"
import { GitRepositoryService } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { CompareFacade } from "../services/compareFacade"

const COMPARE_ICON = "fa-solid fa-code-compare"
const CHOOSE_THE_OTHER_SIDE = "Choose the other side"

/** Design C1: "Compare", for two commits selected in the History. */
export function compareTwoCommitsAction(): CommitAction {
    const compare = inject(CompareFacade)
    return {
        id: "compare.twoCommits",
        label: "Compare",
        detailsLabel: "Compare",
        icon: COMPARE_ICON,
        hoverHint: "Show what changed between the two commits",
        isPrimary: false,
        isOfferedFor: selection => commitsOf(selection).length === 2,
        run: selection => {
            const [first, second] = commitsOf(selection)
            void compare.compareCommits(selection.repo, first.sha, second.sha)
        }
    }
}

export function compareWithParentAction(): CommitAction {
    const compare = inject(CompareFacade)
    return {
        id: "compare.withParent",
        label: "Compare with Parent",
        icon: COMPARE_ICON,
        hoverHint: "Show what this commit changed",
        isPrimary: false,
        isOfferedFor: selection => singleCommitOf(selection) !== null,
        disabledReasonFor: selection => (singleCommitOf(selection)?.parents.length === 0 ? "This commit has no parent" : null),
        run: selection => runOnSingleCommit(selection, commit => compare.compareWithParent(selection.repo, commit.sha))
    }
}

export function compareWithCurrentAction(): CommitAction {
    const compare = inject(CompareFacade)
    return {
        id: "compare.withCurrent",
        label: "Compare with Current",
        icon: COMPARE_ICON,
        hoverHint: "Compare with the commit the map shows",
        isPrimary: false,
        isOfferedFor: selection => singleCommitOf(selection) !== null,
        run: selection => runOnSingleCommit(selection, commit => compare.compareWithCurrent(selection.repo, commit.sha))
    }
}

export function compareWithOtherCommitAction(): CommitAction {
    const compare = inject(CompareFacade)
    return {
        id: "compare.withOther",
        label: "Compare with…",
        detailsLabel: "Compare with…",
        icon: COMPARE_ICON,
        hoverHint: CHOOSE_THE_OTHER_SIDE,
        isPrimary: false,
        isOfferedFor: selection => singleCommitOf(selection) !== null,
        run: selection => runOnSingleCommit(selection, commit => compare.openDialog({ folder: selection.repo, head: commit.sha }))
    }
}

/** Design C1: a branch against the current branch, or the current branch against the folder's default branch. */
export function compareBranchWithTargetAction(): BranchAction {
    const compare = inject(CompareFacade)
    const repository = inject(GitRepositoryService)
    const projects = inject(ProjectsFacade)
    const targetOf = (target: BranchMenuTarget): string | null => {
        const refs = repository.refs()
        const current = refs.kind === "ready" ? refs.value.localBranches.find(branch => branch.isCurrent)?.name : undefined
        const folder = projects.activeProject()?.folders.find(candidate => candidate.id === target.repo.folderId)
        const compared = target.isCurrent ? folder?.git?.defaultBranch : current
        return compared && compared !== target.name ? compared : null
    }
    return {
        id: "compare.branchWithTarget",
        icon: COMPARE_ICON,
        labelFor: target => `Compare with '${targetOf(target)}'`,
        hoverHintFor: target => `Show what '${target.name}' changes compared with '${targetOf(target)}'`,
        isOfferedFor: target => target.kind !== "tag" && targetOf(target) !== null,
        run: target => void compare.compareBranch(target.repo, target.refName)
    }
}

/** Design H10: "Compare with…" for every branch and tag, the dialog with it as the head. */
export function compareBranchWithOtherAction(): BranchAction {
    const compare = inject(CompareFacade)
    return {
        id: "compare.branchWithOther",
        icon: COMPARE_ICON,
        labelFor: () => "Compare with…",
        hoverHintFor: () => CHOOSE_THE_OTHER_SIDE,
        isOfferedFor: () => true,
        run: target => compare.openDialog({ folder: target.repo, head: target.name })
    }
}

function commitsOf(selection: CommitSelection): GitCommitSummary[] {
    return selection.items.flatMap(item => (item.kind === "commit" ? [item.commit] : []))
}

function singleCommitOf(selection: CommitSelection): GitCommitSummary | null {
    const commits = commitsOf(selection)
    return selection.items.length === 1 && commits.length === 1 ? commits[0] : null
}

function runOnSingleCommit(selection: CommitSelection, run: (commit: GitCommitSummary) => unknown): void {
    const commit = singleCommitOf(selection)
    if (commit) {
        void run(commit)
    }
}
