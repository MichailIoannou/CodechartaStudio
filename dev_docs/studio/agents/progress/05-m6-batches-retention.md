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
- [ ] 3. Retention
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

