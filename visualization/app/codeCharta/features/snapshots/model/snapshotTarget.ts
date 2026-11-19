import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"

/**
 * What the map should show in the working folder: the current checkout, a commit, or one snapshot exactly (a snapshot
 * the user opened or the app restored).
 */
export type SelectedTarget = { kind: "workingTree" } | { kind: "commit"; sha: string } | { kind: "snapshot"; ref: SnapshotRef }

export function targetKeyOf(target: SelectedTarget): string {
    switch (target.kind) {
        case "workingTree":
            return "workingTree"
        case "commit":
            return target.sha
        case "snapshot":
            return `snapshot:${target.ref.snapshotId}`
    }
}

/** What an analysis of the target maps; a target that is one snapshot is answered by that snapshot already. */
export function analysisTargetOf(target: SelectedTarget): AnalysisTarget | null {
    return target.kind === "snapshot" ? null : target
}

export function isSameAnalysisTarget(first: AnalysisTarget, second: AnalysisTarget): boolean {
    return first.kind === "commit" ? second.kind === "commit" && first.sha === second.sha : second.kind === "workingTree"
}
