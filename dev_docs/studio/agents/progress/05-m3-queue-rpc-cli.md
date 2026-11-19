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
- [x] 3. RPC
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

### 3. RPC, recovery, cancel on shutdown
- Api first: `PreflightParams`, `EnqueueParams` (`force` defaults to false), `EnqueueResult` (tag `status`:
  `queued` / `alreadyQueued` with `job`, `alreadyAnalysed` with `snapshotId`, `rejected` with `problems`),
  `JobRefParams`, `AnalysisJobList { jobs }`, `AnalysisJobChanged { job }`, `AnalysisProgress { jobId, progress }`,
  `SnapshotLog { log }`. Methods (all renderer): `analysis.preflight`, `analysis.enqueue`, `analysis.cancel`,
  `analysis.list`, `analysis.clearFinished`, `snapshots.readLog`. Events (renderer): `analysis.queued`,
  `analysis.started`, `analysis.progress`, `analysis.finished`, `analysis.failed`, `analysis.cancelled`,
  `snapshots.changed` (`FolderRef`). Contract regenerated (21 new type files, `coreApi.ts`,
  `coreMethods.generated.json`). **Reconciled with 03-M3:** `snapshots.list` and `snapshots.mapLocation` (shell)
  are unchanged; only `readLog` is new.
- **Decision `analysis.progress` vs `core.progress`:** `analysis.progress { jobId, progress }`. `core.progress` names a
  request id and the shell maps it to the caller's `operationId`; an analysis outlives its `analysis.enqueue`
  request and may be watched by a renderer that reloaded, so it is keyed by job. Throttled to 250 ms in the queue.
- Core: `Core` owns the `AnalysisQueue` (`analysis_queue()`), exposes `runner()` (05-M2 asked for it) and
  `analyses() -> analysis::jobs::Analyses` with `preflight`, `enqueue` (preflight first; a blocking problem answers
  `rejected`; then the existing commit snapshot `<sha>-<profileHash>` is looked up and passed to the queue),
  `cancel`, `list`, `clear_finished` (also deletes the `.failed-<jobId>` logs of the cleared failed jobs, new
  `SnapshotRepository::forget_failed`), `recover`, `drive`. `drive` runs a private `CoreExecutor` that builds plan
  05-M2's `AnalysisService` per job from the core (`snapshots()`, `git()`, `runner()`, `tools()` as hosting CLI,
  the cached tools report, `ANALYSIS_TIMEOUT`, `HOSTING_BUDGET`, no launch override).
- Validation happens before anything runs: ids and the sha are api newtypes (`BAD_REQUEST` from `read_params`), an
  unknown project or folder is `NOT_FOUND` from `resolve_folder`, an unknown job `NOT_FOUND`.
- Recovery: see the "As built" note under "Crash recovery" in plan 05. **Deviation:** liveness is the job's file
  lock (`job.lock`, std `File::try_lock`), not the pid; the pid is recorded for the log. `store/sweep.rs` now skips
  staging directories that hold a `job.json` (`store::paths::{JOB_FILE_NAME, JOB_LOCK_FILE_NAME}`); without that the
  sweep would delete them before the janitor could clean the user's repository. A marker that cannot be written
  only logs a warning; the analysis still runs.
- Serve: `serve/analysis_routes.rs` (routes, `AnalysisTasks { driver, recovery, forwarder }`,
  `forward_analysis_events`). At start the driver and the recovery run as tasks; at the end of the session (EOF or
  `core.shutdown`) `AnalysisTasks::stop` shuts the queue down (queued jobs cancelled, the running one's token
  cancelled, so ccsh's process tree is killed and the janitor runs) and waits up to `SHUTDOWN_GRACE` before
  `Core::shutdown` kills what is left.
- fake-ccsh also answers `-version` like a JDK 25 on stderr, so protocol and CLI tests set both the ccsh and the java
  tool path (in `core-settings.json`) to it. The cored tests find it beside the core binary
  (`tests/support/analysis.rs::fake_ccsh`); when only `codecharta-cored` was built they build it once with
  `cargo build -p codecharta-core --bin fake-ccsh` (the plan's original fallback; `CARGO_BIN_EXE_*` is per package).
- Tests: core `tests/recovery.rs` (`should_clean_a_leftover_temp_folder_of_a_dead_pid_and_leave_one_of_a_live_pid`,
  with an orphan `codecharta-worktree-1` the janitor removes), `tests/snapshot_record.rs`
  `should_mark_a_running_commit_analysis_for_the_recovery`, store unit
  `should_leave_the_staging_folder_of_an_analysis_to_the_recovery`, api serialisation tests; protocol
  `tests/analysis_protocol.rs`: the plan's three (`should_reject_a_malformed_sha_an_unknown_project_and_a_path_like_snapshot_id`,
  `should_emit_analysis_queued_started_and_finished_over_serve` — also `alreadyAnalysed`, `snapshots.list`,
  `snapshots.readLog`, `analysis.list` — and `should_clean_a_leftover_temp_folder_of_a_dead_pid_on_start_and_leave_one_of_a_live_pid`)
  plus `should_report_a_failed_analysis_and_forget_it_on_clear`.
