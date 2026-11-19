---
name: 05-M6 batches, retention, cleanup
state: progress
version: 1
---

## Goal

Analyse several commits in one go (last N of a branch, every tag), measure the store, and delete or
prune old snapshots (plan 05, Milestones, M6).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M6. Split by orchestration: core tasks 1
and 3 now, branched from `feature/studio-05-m5` (verified, merge pending); renderer tasks 2, 4 and the
changelog (5) later with `design/05-snapshots.md`.

Owner decisions apply: deletions go to the OS recycle bin, no automatic pruning. The plan's "fall back to
removal when the recycle bin fails" must not delete permanently on its own: check `design/05-snapshots.md`
and `design/owner-decisions.md`; permanent removal only on an explicit request from the user (e.g. a
`permanently: true` parameter the UI sends after asking). If design and plan conflict, stop that part and
record it. From 05-M3: `NewJob.batch_id` already ranks batch jobs after direct ones; 03-M3 already has
`snapshots.delete {…, permanently}` — reconcile, do not duplicate. Gates with and without `--all-features`.

1. Batches: `analysis/batch.rs`, `analysis.enqueueBatch` / `analysis.cancelBatch`
2. Batch dialog (later, UI)
3. Retention: `snapshots/retention.rs`, usage, delete, planPrune, prune
4. Delete action, size footer, clean-up dialog (later, UI)
5. Changelog (later)

## Steps

- [x] 1. Batches
- [x] 3. Retention
- [ ] 2, 4, 5. Renderer and changelog (later)

## Notes

Environment (2026-11-19): Linux, rustc 1.95 (workspace toolchain), git 2.56, node 26, npm 12.2. Branched from
`feature/studio-05-m5` (verified, merge pending). Verified before starting: `NewJob.batch_id` (05-M3, batch jobs
run after direct ones), `snapshots.delete { …, permanently }` with the injected `Recycler` (03-M3), plan 04's
`GitService::{rev_list, refs}` (tags already peeled), `SnapshotRepository`, `Core::analysis_queue()`.

### 1. Batches
- Api first (`methods/analysis.rs`): `BatchSelection` (tag `kind`: `commits { shas }`, `lastCommits { tipSha, count,
  firstParentOnly }`, `tags`), `EnqueueBatchParams { projectId, folderId, selection, dryRun = false }`,
  `BatchResult { batchId, toAnalyse, alreadyAnalysed, leftOut, jobs, estimatedDurationMs, problems }`,
  `BatchRefParams { batchId }`; methods (renderer) `analysis.enqueueBatch`, `analysis.cancelBatch`. Contract
  regenerated (4 new type files, `coreApi.ts`, `coreMethods.generated.json`).
- Core: `analysis/batch.rs` (`expand_batch`, `validate_selection`, `preflight_target`, `plan_batch`,
  `MAX_BATCH_JOBS` = 200), `Analyses::{enqueue_batch, cancel_batch}`, `AnalysisQueue::cancel_batch`,
  `ids::new_batch_id` (`batch-<16 hex>`). Details in the "As built (05-M6)" paragraph under "Batch actions" in
  plan 05.
- **Deviations:** `expand_batch` takes the `GitFolder` and a cancellation token (plan: `repo: &Path`); tags come
  from `GitService::refs` instead of a second `for-each-ref`; the cap: counts above 200 are refused
  (`BAD_REQUEST`, like the dialog's limit), and only `Tags` can exceed it — the newest 200 are queued and the new
  field `leftOut` says how many were not (the plan's struct has no way to say so). An unknown commit of `Commits`
  is a blocking `UNKNOWN_COMMIT` problem, not a JSON-RPC error, so plan 06 gets it the same way as a preflight
  problem. A blocking preflight problem answers only `problems` (no counts).
- Tests: `tests/analysis_batch.rs` (`should_expand_the_last_n_first_parent_commits`, `should_peel_annotated_tags`,
  extra `should_refuse_more_commits_than_a_batch_holds_and_unknown_commits`), unit in `batch.rs`
  (`should_skip_analysed_commits`, `should_cap_at_200`, extra `should_check_the_named_tip_or_the_folder_for_tags`),
  `tests/queue.rs` `should_cancel_all_jobs_of_a_batch`, protocol `analysis_protocol.rs`
  `should_only_estimate_on_a_dry_run`, extra `should_queue_a_batch_and_cancel_it_over_json_rpc`; api
  `should_read_batch_selections_by_kind_and_default_to_a_real_run`.

### 3. Retention
- Api first: `FolderUsage { folderId, snapshotCount, bytes }`, `StoreUsage { totalBytes, folders }`, `PrunePolicy
  { keepNewestCommitSnapshots, keepNewestWorkingTreeSnapshots, keepBranchTipsAndTags }` (`Default` 50 / 3 / true,
  constants `DEFAULT_KEEP_NEWEST_*`), `PlanPruneParams { projectId, folderId, policy }`, `PrunePlan { delete:
  SnapshotSummary[], keep, freedBytes }`, `PruneParams { projectId, folderId, snapshotIds, permanently }`,
  `PruneResult { deleted, freedBytes }`; methods (renderer) `snapshots.usage` (`ProjectIdParams`),
  `snapshots.planPrune`, `snapshots.prune`. Error codes appended: `SNAPSHOT_BEING_WRITTEN`, `RECYCLE_FAILED`
  (`ErrorCode::ALL` now 50). Contract regenerated (7 new type files, `ErrorCode.ts`, `coreApi.ts`,
  `coreMethods.generated.json`).
- Core: `snapshots/retention.rs` (`Retention`, `Protected`, `select_for_pruning`), `SnapshotRepository::bytes_on_disk`,
  `AnalysisQueue::{snapshots_being_written, announce_snapshots_changed}`, `CoreError::{SnapshotBeingWritten,
  RecycleFailed}`; `nearest::commit_seconds` is now `pub(crate)` (commit dates across offsets). Routes:
  `snapshots.delete` now goes through `Retention::delete` (reconciled with 03-M3: same method and params, plus the
  running-job guard and `snapshots.changed`); new `usage`, `planPrune`, `prune`. Details in the "As built (05-M6)"
  paragraph under "Retention and cleanup" in plan 05.
- **Deletion fallback (conflict resolved the safe way):** the plan said "falls back to `remove_dir_all` when the
  recycle bin is unavailable" and named the test "should fall back to removal when the recycle bin fails". The owner
  decision (README: "Deletions go to the OS recycle bin") and `design/05-snapshots.md` (S4 delete confirmation and
  S8 clean-up only ever say "move … to the recycle bin"; a failure is an `alert alert-error`) never allow a silent
  permanent removal. As built: a failing recycle bin answers `RECYCLE_FAILED` and removes nothing; permanent removal
  happens only when the request says `permanently: true` (03-M3's existing parameter, now also on `prune`).
  `SystemRecycler` answers `RECYCLE_FAILED` instead of `IO` for every caller (project deletion, discarded files,
  snapshots). Test renamed `should_report_a_failing_recycle_bin_and_delete_permanently_only_when_asked`; plan text
  corrected. **Open for the designer** (not edited here, `design/` is read-only for this agent): the design has no
  state for `RECYCLE_FAILED` — whether S4 / S8 offer "Delete permanently" after asking, and its wording.
- **Deviations:** `usage` counts map + log bytes (the plan's definition), not `snapshot.json`; `prune` answers
  `PruneResult` instead of `null` (the S8 toast "Moved 37 analyses (812 MB)" needs both numbers) and stops at the
  first failure; `prune` refuses imports (`BAD_REQUEST`) and snapshots being written, checked for every id before
  anything is removed; a running job's snapshot is protected in `planPrune` too. Branch tips cover local and
  remote branches and tags (plan: `refs/heads refs/remotes refs/tags`), through `GitService::refs`. The clean-up
  dialog in the design spans every folder of the project, while `planPrune` / `prune` work per folder as the plan
  says: the renderer calls them once per folder.
- Tests (`tests/retention.rs`, `StoreWorkspace` with `RecordingRecycler`, never the real bin):
  `should_sum_sizes_per_folder`, `should_refuse_to_delete_a_snapshot_being_written` (a forced re-analysis running on
  an endless executor; `delete` and `prune` both refuse), `should_keep_branch_tips_tags_the_newest_n_and_the_shown_snapshot`,
  `should_list_the_rest`, `should_never_list_an_imported_snapshot` (also `prune` of an import),
  `should_report_a_failing_recycle_bin_and_delete_permanently_only_when_asked` (also `snapshots.changed` emitted);
  protocol `should_measure_plan_and_prune_the_store_over_json_rpc` (prune with `permanently: true`, so no real bin);
  api `should_write_the_default_prune_policy_in_camel_case`,
  `should_serialize_retention_error_codes_as_stable_screaming_snake_case_strings`; core error table extended.

### For the renderer tasks (2, 4, 5)
- `analysis.enqueueBatch { projectId, folderId, selection, dryRun }` → `BatchResult { batchId, toAnalyse,
  alreadyAnalysed, leftOut, jobs, estimatedDurationMs, problems }`; `selection` is `{ kind: "lastCommits", tipSha,
  count (1–200), firstParentOnly }`, `{ kind: "tags" }` or `{ kind: "commits", shas (1–200) }`. Dry run for the
  summary line (300 ms debounce in S7), then the same call with `dryRun: false`. A blocking problem: `problems` with
  `severity: "error"`, nothing queued. `estimatedDurationMs: null` = "No estimate yet". Out-of-range count:
  `BAD_REQUEST`. Batch jobs carry `batchId` in every `analysis.*` notification.
- `analysis.cancelBatch { batchId }` → null (`NOT_FOUND` for an unknown batch).
- `snapshots.usage { projectId }` → `StoreUsage` for the S4 footer. `snapshots.planPrune { projectId, folderId,
  policy }` → `PrunePlan` per folder for S8; `snapshots.prune { projectId, folderId, snapshotIds, permanently:
  false }` → `PruneResult` for the toast. `snapshots.delete { …SnapshotRef, permanently: false }`.
- Error codes: `SNAPSHOT_BEING_WRITTEN` → S4 warning toast "This analysis is still being written…";
  `RECYCLE_FAILED` → nothing was removed; only after asking the user may the renderer resend with
  `permanently: true`. `snapshots.changed` follows every delete / prune.

