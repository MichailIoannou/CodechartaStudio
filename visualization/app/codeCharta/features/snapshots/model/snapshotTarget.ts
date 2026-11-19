import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"

/**
 * What the map should show in the working folder: the current checkout, a commit, or one snapshot exactly (a snapshot
 * the user opened or the app restored).
 */
export type SelectedTarget = { kind: "workingTree" } | { kind: "commit"; sha: string } | { kind: "snapshot"; ref: SnapshotRef }
