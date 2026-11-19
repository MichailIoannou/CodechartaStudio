---
name: 05-M3 queue, preflight, RPC and CLI
state: progress
version: 1
---

## Goal

Prerequisite checks before an analysis, a one-at-a-time job queue with dedupe and notifications,
`analysis.*` / `snapshots.*` over JSON-RPC with recovery at start, and `analyse` / `snapshots` CLI
commands (plan 05, Milestones, M3).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M3 (tests to write first are listed there).
Split by orchestration: tasks 1–4 (core) now, branched from `feature/studio-05-m2` (verified, merge
pending); task 5 (fake bridge in the renderer) after the core stack is merged into integration, because
01-M4.1's fake bridge is not on the stack's branches.

From `05-m2-snapshot-records.md`: make `Core.runner` reachable to build `AnalysisDeps`; dedupe and
"already analysed" happen in the queue (otherwise `execute` with `force: false` runs ccsh and then fails
with a store conflict); failed-job logs via `read_failed_log(folder, JobId)`; `recover()` needs `job.json`
written into the staging folder. Snapshot RPC from 03-M3 already exists (`snapshots.list`, `mapLocation`) —
reconcile, do not duplicate. Progress: decide `analysis.progress` vs `core.progress` (plan 01's shell maps
`core.progress` to the caller's `operationId`) and throttle to 250 ms. For protocol tests the core needs a
custom ccsh path pointing at fake-ccsh (plan 01's `tools.setPath`). Gates with and without `--all-features`.

1. Preflight
2. Queue
3. Contract, RPC, `recover()`, cancel on shutdown
4. CLI `analyse`, `snapshots list|resolve` (resolve stubbed until M5)
5. Fake bridge (later, after the stack merge)

## Steps

- [x] 1. Preflight
- [x] 2. Queue
- [ ] 3. RPC
- [ ] 4. CLI
- [ ] 5. Fake bridge (later)

## Notes

Environment (2026-11-19): Linux, rustc 1.95 (workspace toolchain), git 2.56, node 26, npm 12.2. Branched from
`feature/studio-05-m2` (verified, merge pending).

### 1. Preflight
- Api first (`methods/analysis.rs`): `WarningCode` (`NOT_REPO_ROOT`, `SHALLOW_CLONE`, `LOW_DISK_SPACE`), `ProblemCode`
  (untagged union of `AnalysisErrorCode` and `WarningCode`, so a blocking problem names the job error the run would
  end with; plan's kebab-case `ProblemCode` that repeats every error code corrected), `Severity`, `PreflightProblem`
  (`error(JobError)`, `warning(code, message)`), `PreflightResult::of(problems)` (`ok` = no error). Not reachable from a
  method yet, so the contract is unchanged.
- `analysis/preflight.rs`: `DiskSpace` port, `SystemDiskSpace` (`fs4::available_space`), `DiskPlaces { store, temp }`,
  `PreflightContext { tools, git, disk, places }`, `PreflightSubject { folder: &GitFolder, kind, profile, target,
  largest_snapshot_bytes }`, `run_preflight` (≤ 4 parameters; the plan's `project, folder` became the subject).
  Constants `MIN_STORE_FREE_BYTES` (200 MiB), `STORE_SPACE_FACTOR` (3), `MIN_TEMP_FREE_BYTES` (1 GiB).
- Every check runs (all problems at once), in table order. git checks only for git folders or commit targets and
  only when git is usable; they go through `GitService::repository_info` (one `rev-parse` for top level, prefix and
  shallow, instead of the plan's two calls) and `resolve_commit` (`rev-parse --verify <sha>^{commit}`, instead of
  `cat-file -e`). **Deviations:** a git folder that is no repository is `NOT_A_REPOSITORY` for a working-tree target
  too, since `execute` fails with it; unreadable free space is a log warning, not a problem.
- New crate `fs4` 1.1.0 (MIT OR Apache-2.0, `default-features = false`); its dependencies `rustix` 1 and
  `windows-sys` 0.61 were already in the lockfile. `cargo deny` is not installed here; the licence is on the
  `deny.toml` allow list.
- Tests (`tests/preflight.rs`, temporary repositories, stub `DiskSpace`): one per table row (java missing and java
  too old as two), plus `should_pass_a_commit_of_a_healthy_repository`; unit
  `should_read_the_free_space_of_an_existing_folder`.

### 2. Queue
- Api: `JobState` (`is_finished`), `AnalysisJob` (the plan's fields; `id: JobId`, `batchId: BatchId | null`, flat
  `projectId` / `folderId`, `folder()`), new store id `BatchId` (plan: `String`). Core `ids::new_job_id` (`job-<16 hex>`).
- `analysis/queue.rs`: see the "As built" paragraph under "Job queue" in plan 05. **Deviations:** no `concurrency`
  parameter or `Priority` argument (one `drive` loop; a job without `batch_id` is direct); the queue does not own
  the executor but is driven by its owner, so `AnalysisService<'core>` (which borrows the core) can execute without
  `Arc` cycles; the caller passes the existing snapshot (`existing`) because the queue knows no store.
- Progress: the job always holds the latest `JobProgress`; notifications are throttled with plan 04's
  `ProgressThrottle` at `PROGRESS_INTERVAL` 250 ms. Updates that arrive with the end of the run are applied before
  the job finishes (found by `should_emit_a_notification_on_every_transition`, which failed once without it).
- `MAX_FINISHED_JOBS` 100: the oldest finished (by finishing order, not queue order) are dropped. `shutdown` cancels
  queued jobs at once and running ones through their token; `drive` returns after the running job ended; `enqueue`
  then answers `NOT_ALLOWED`. `cancel` of an unknown job is `NOT_FOUND`, of a finished one a no-op.
- Tests (`tests/queue.rs`, scripted executor): the plan's eight names plus
  `should_cancel_queued_and_running_jobs_on_shutdown`, `should_throttle_progress_notifications_but_keep_the_latest_progress`,
  `should_forget_finished_jobs_on_clear`; 30 repeated runs green.
