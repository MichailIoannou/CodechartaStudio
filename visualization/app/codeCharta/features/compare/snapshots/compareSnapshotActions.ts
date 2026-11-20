import { inject } from "@angular/core"
import type { CommitAction, CommitSelection } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import type { SnapshotAction } from "../../snapshots/facade"
import type { FolderRef, SnapshotSummary } from "../model/compare.model"
import { CompareFacade } from "../services/compareFacade"
import { snapshotOptionsOf } from "../services/snapshotSides"

const COMPARE_ICON = "fa-solid fa-code-compare"
const HEAD = "HEAD"

/** Design C1.3: a commit's analysis against the folder's newest working-tree analysis. */
export function compareWithWorkingTreeAction(): SnapshotAction {
    const compare = inject(CompareFacade)
    const workingTreeOf = newestWorkingTreeOfFolder()
    return {
        id: "compare.withWorkingTree",
        label: "Compare with working tree",
        hoverHint: "Show what the uncommitted changes change compared with this commit",
        isOfferedFor: snapshot => snapshot.commit !== null && snapshot.target !== "workingTree" && workingTreeOf(snapshot.ref) !== null,
        run: snapshot => {
            const workingTree = workingTreeOf(snapshot.ref)
            if (snapshot.commit && workingTree) {
                void compare.compareWithSnapshot(folderOf(snapshot), snapshot.commit, workingTree)
            }
        }
    }
}

/** Design C1.3: an imported or working-tree analysis as the head of the compare dialog. */
export function compareSnapshotWithOtherAction(): SnapshotAction {
    const compare = inject(CompareFacade)
    const projects = inject(ProjectsFacade)
    const optionNameOf = (snapshot: SnapshotSummary) =>
        snapshotOptionsOf(projects.snapshotsByFolder()[snapshot.ref.folderId] ?? []).find(
            option => option.snapshotId === snapshot.ref.snapshotId
        )?.name ?? null
    return {
        id: "compare.snapshotWithOther",
        label: "Compare with…",
        hoverHint: "Choose the other side",
        isOfferedFor: snapshot => optionNameOf(snapshot) !== null,
        run: snapshot => compare.openDialog({ folder: folderOf(snapshot), head: optionNameOf(snapshot) ?? "" })
    }
}

/** Design C1.2: "Compare with HEAD" on the History's uncommitted changes, when the working tree was analysed. */
export function compareWorkingTreeWithHeadAction(): CommitAction {
    const compare = inject(CompareFacade)
    const workingTreeOf = newestWorkingTreeOfFolder()
    const workingTreeOfSelection = (selection: CommitSelection) =>
        selection.items.length === 1 && selection.items[0].kind === "workingTree" ? workingTreeOf(selection.repo) : null
    return {
        id: "compare.workingTreeWithHead",
        label: "Compare with HEAD",
        icon: COMPARE_ICON,
        hoverHint: "Compare the working-tree analysis with the last commit",
        isPrimary: false,
        isOfferedFor: selection => workingTreeOfSelection(selection) !== null,
        run: selection => {
            const workingTree = workingTreeOfSelection(selection)
            if (workingTree) {
                void compare.compareWithSnapshot(selection.repo, HEAD, workingTree)
            }
        }
    }
}

function newestWorkingTreeOfFolder() {
    const projects = inject(ProjectsFacade)
    return (folder: FolderRef) => {
        const workingTree = snapshotOptionsOf(projects.snapshotsByFolder()[folder.folderId] ?? []).find(
            option => option.kind === "workingTree"
        )
        return workingTree ? { kind: "workingTree" as const, snapshotId: workingTree.snapshotId } : null
    }
}

function folderOf(snapshot: SnapshotSummary): FolderRef {
    return { projectId: snapshot.ref.projectId, folderId: snapshot.ref.folderId }
}
