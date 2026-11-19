---
name: 05-M1 run one analysis from the core
state: progress
version: 1
---

## Goal

Run one `ccsh analyse` from the core: validated and hashed analysis profiles, the argv, output and failure
parsing, progress from stderr, a scripted ccsh stand-in, per-platform launch resolution, and a cancellable
runner on plan 01's process runner (plan 05, Milestones, M1).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M1 (tests to write first are listed there).
Branched from `feature/studio-04-m11` (plan 03 and 04 cores verified, merge pending).

Must apply the 05-M0 findings (`05-m0-spikes.md`): direct-java launch holds; pass `-Dstdout.encoding=UTF-8`
and `-Djava.io.tmpdir=<jobTempDir>`; exit 1 messages on stdout, exit 2 on stderr; progress keyed on the
`Files` unit only (ignore `Byte`), never decreasing, capped at 99; strip control bytes from stdout; a
signal exit (`code()` is `None`) never maps to `analysis-failed`; non-empty stderr is not a failure (JDK
reflection warnings); never `-i`; a non-sha `--commit` silently analyses HEAD, so only full SHAs are passed.
Output fixtures are the strings captured in 05-M0. Windows items are `#[cfg(windows)]` and unverified here.
Gates with and without `--all-features`.

1. Profiles
2. Argv
3. Output and failures
4. Progress
5. fake-ccsh and test helpers
6. Launcher
7. Runner

## Steps

- [x] 1. Profiles
- [x] 2. Argv
- [x] 3. Output and failures
- [x] 4. Progress
- [ ] 5. fake-ccsh
- [ ] 6. Launcher
- [ ] 7. Runner

## Notes

Environment (2026-11-19): Linux, rustc 1.95 (workspace toolchain), OpenJDK 27.0.1, ccsh 2.4.0 built in this
worktree with `cd analysis && ./gradlew installDist` (git-ignored). Windows code is `#[cfg(windows)]` or
reached through `TargetOs::Windows` in unit tests; nothing Windows-specific ran.

### Reconciliation of "Required from other plans" (overview section 10), against `core/` as built

| Plan 05 assumes | Built (ground truth) | M1 consequence |
|---|---|---|
| 01 `ProcessRunner::run(RunSpec { program, args, cwd, env, timeout, max_output_bytes, cancel, on_stdout, on_stderr })`, `RunError::{Timeout, Cancelled, ToolNotFound, Io}` | `process::ProcessRunner::run(RunRequest { tool, program, args, cwd, env, env_remove, timeout, max_output_bytes, askpass, output: OutputMode::{Collect, Stream(mpsc::Sender<OutputChunk>)}, stdin }, &CancellationToken) -> CoreResult<RunOutput { exit_code: i32, stdout, stderr, duration }>`; errors are `CoreError::{Timeout, Cancelled, OutputTooLarge, ToolNotFound, ToolFailed, BadRequest, Io}`; a signal exit is `exit_code == -1` (`NO_EXIT_CODE`), never `None` | the runner streams through `OutputMode::Stream`; `NO_EXIT_CODE` made `pub` so `run_ccsh` can tell a signal from an exit |
| 01 `launch::plan_launch` (`cmd.exe /d /s /v:off /c "…"`) for `.cmd`/`.bat` | no `plan_launch`: the runner spawns a batch file with std's own escaping after `launch::check_batch_args` (refuses `"`, `%`, `!`, CR, LF, NUL → `BAD_REQUEST`) | `CmdShim` runs the shim through `ProcessRunner` directly; its refusal maps to `INVALID_ARGUMENTS` with the plan's hint. No second quoting routine |
| 01 `hardened_env()` | `process::env::hardened_env(parent, extra_search_folders)` | used as is (tests build `ProcessRunner::new(hardened_env(..))`) |
| 01 `tools::ToolsService::{check, resolve}` → `ToolsReport { tools, can_use_git, can_analyse }`, states `ok/missing/failed/too_old`; test override env `CODECHARTA_CCSH_PATH` (UNVERIFIED) | `tools::Tools::{doctor, resolve, run, set_path, clear_path}` → `ToolsReport { checked_at, tools: Vec<ToolStatus>, can_use_git, can_analyse }`, `ToolState::{Ok, Missing, TooOld, Failed}`, `ToolSource::{Custom, JavaHome, Path, WellKnownFolder}`; no env override (tests use `SearchLocations::only` or custom tool paths) | `resolve_ccsh_launch` reads a `&ToolsReport`; tests use `LaunchOverride::Executable(fake-ccsh)`. M3's protocol test needs a way in: a custom ccsh path in the settings, not an env variable |
| 01 JSON-RPC router, `EventSink::emit(CoreEvent)` | `serve/dispatch.rs` route table; `Notifier::{progress(ProgressParams), emit(name, payload)}`; long work reports `core.progress { requestId, message, done, total }` (04-M7) | not used in M1; M3 decides between `analysis.progress` and `core.progress` |
| 01 contract generation | `npm run contract` (visualization) runs `export-contract`; only types reachable from a registered method or event are exported | M1 api types (`methods/analysis.rs`) are not reachable yet, so the generated contract does not change until M3 registers methods |
| 03 `AnalysisProfile { without, exclude, extra_args }` | `codecharta_core_api::methods::projects::AnalysisProfile { exclude: Vec<ExcludePattern>, without: Vec<AnalyserName>, parallel: bool }`; `AnalyserName` is a closed enum (`rawtextparser … svn`, `gitlogparser` is rejected on deserialisation); `ExcludePattern` = 1..200 chars, no line break | no `extra_args`; `parallel` decides `-p`. See task 1 deviations |
| 03 `SnapshotRecord` with `analysis.profile { without, exclude, extraArgs }`, `profileHash` | `snapshots::record::{SnapshotRecord, AnalysisRecord, AnalysisProfileRecord { without, exclude, extra_args }}` | the hash input keeps the record's three keys (`extraArgs` always `[]`) |
| 03 `StorePaths`, `write_json_atomic`, `FolderRef`/`SnapshotRef`, a snapshot lister | `store::paths::StorePaths` (incl. `staging_dir`), `store::atomic::write_json_atomic`, api `FolderRef`/`SnapshotRef`, `snapshots::SnapshotRepository` | M2 extends `SnapshotRepository` instead of writing a second one |
| 04 `GitService` (`resolve_commit`, `count_commits`, `merge_base`, `is_ancestor`, `refs_pointing_at`, `status`, `refs`, streaming `rev_list`) | `git::GitService::{resolve_commit, rev_list_count, merge_base, is_ancestor, measure_distances, refs_at, rev_list (streaming, `ShaSink`), status, refs, log, commit_details, …}` | names for M2/M5: `count_commits` = `rev_list_count`, `refs_pointing_at` = `refs_at` |
| plan `Sha` newtype | api `values::CommitSha` (40 or 64 lowercase hex) | used instead of a new `Sha` |
| plan `tests/common/` | `core/crates/codecharta-core/tests/support/` | test helpers go there |

### 1. Profiles
- Api first: `codecharta_core_api::methods::analysis::{JobProgress (tag "mode"), AnalysisErrorCode, JobError { code, message, hint }}`.
  **`AnalysisErrorCode` serialises SCREAMING_SNAKE_CASE** (overview section 10 over the plan's kebab-case) and is
  append-only. Two codes beyond the plan: `CRASHED` (the child ended by a signal the core did not send — never
  `ANALYSIS_FAILED`, per 05-M0) and `OUTPUT_TOO_LARGE` (the runner's output cap fired). No method uses the types
  yet, so `npm run contract` leaves the generated contract unchanged.
- `analysis/profile.rs`: `ValidProfile` (sorted, deduped `exclude` and `without`, `parallel`), `validate_profile`
  → `Result<ValidProfile, JobError>` (plan: `AnalysisError`; the core has no such type and every failure here is a
  job failure), `profile_hash` = first 8 hex of SHA-256 (`sha2` 0.10, already a dependency) over
  `{"exclude":[…],"extraArgs":[],"without":[…]}` — the snapshot record's three profile keys; `parallel` is left
  out because it changes the speed, not the map.
- Deviations (plan 03's profile as built): no `extra_args`, so "reject each forbidden extra argument" has nothing
  to test — the argv guard of task 2 covers `-i`/`-q`/`-nc`; `without` is the closed enum `AnalyserName`, so
  "normalise gitlogparser to git" is impossible (deserialisation rejects it; plan 03's own test asserts that) and
  was replaced by `should_sort_and_dedupe_both_lists`; "reject an unknown without entry" is tested as a
  deserialisation failure. `ExcludePattern` already guarantees non-empty and no line break; the validator adds
  comma and NUL. Extra test: `should_hash_the_record_keys_and_ignore_parallel`.

### 2. Argv
- `analysis/argv.rs`: `AnalyseArgvInput { folder_path, output_base, profile: &ValidProfile, commit: Option<&CommitSha> }`,
  `build_analyse_argv` → `analyse <folder> -o <output_base> [-p] [--without=<csv>] [--exclude=<pattern>]… [--commit=<sha>]`.
  `-p` only when `profile.parallel` (plan: always). Exclude patterns are always written as one `--exclude=<p>`
  argument, so a pattern `-i` reaches ccsh as `--exclude=-i`. Errors are `INVALID_ARGUMENTS` (relative path,
  an element equal to `-i`/`--interactive`). `CommitSha` already guarantees a full lower-case sha; confirming it
  with `git cat-file -e` stays with the caller (preflight, M3).
- Extra tests: `should_leave_out_parallel_and_empty_lists`, `should_refuse_an_interactive_flag_as_a_whole_argument`.

### 3. Output and failures
- `analysis/output.rs`: `parse_map_line` (last `Map: ` line, trailing `\r`/spaces trimmed), `parse_not_in_map`,
  `strip_control_characters` (drops C0/C1 controls except `\n \r \t`, 05-M0 finding 6), `classify_failure`,
  `classify_start_failure`.
- **Deviation — the run result is an enum, not flags:** `CcshRunResult { end: RunEnd, stdout, stderr }` with
  `RunEnd::{Exited { code }, Signalled, Cancelled, TimedOut, InteractiveTrap, OutputTooLarge}` instead of
  `exit_code: Option<i32>` + three booleans (no impossible combinations). It lives in `output.rs` because the
  classifier needs it before the runner exists; `runner.rs` produces it.
- **Deviation — `classify_failure(&CcshRunResult) -> Option<JobError>`**: `None` for a cancelled run (not a
  failure); spawn errors go through `classify_start_failure(&CoreError)` because the built runner reports them as
  `CoreError::ToolNotFound { tool }` (java for java-direct, ccsh otherwise) or `BadRequest` (batch-file argument
  refusal → `INVALID_ARGUMENTS` with the plan's "set the ccsh path to the ccsh.bat …" hint), not as `io::Error`.
- Order (first match wins): cancelled → none; stderr `ccsh needs Java` / `Unrecognized option: --enable-native-access`
  → `JAVA_TOO_OLD` (hint: the marked line and the next non-empty one); interactive trap; timeout; output cap →
  `OUTPUT_TOO_LARGE`; signal → `CRASHED`; exit 2 → `INVALID_ARGUMENTS` with the first non-empty **stderr** line;
  stdout `No commit found for` → `UNKNOWN_COMMIT`; `Failed to create git worktree` → `WORKTREE_FAILED` (long-path
  hint); `Git command timed out` → `GIT_TIMEOUT`; other non-zero exit → `ANALYSIS_FAILED` with the last non-empty
  stdout line; exit 0 → `NO_OUTPUT` (the caller asks only when no map was found). stderr is otherwise ignored
  (JDK 27 reflection warnings).
- Fixtures are the 05-M0 strings (`--without=x`, `--nonsense`, the missing full sha, the JDK warning, the commit
  run's summary block with `─`×72 and SO bytes); the java-too-old text follows `CcshLauncher.java`.

### 4. Progress
- `analysis/progress.rs`: `ProgressParser::{new, push(&str) -> Option<u8>, progress() -> JobProgress}`.
  **Deviation:** `push` takes `&str`, because the built runner streams already-decoded UTF-8 chunks
  (`OutputChunk::Stderr(String)`), not bytes.
- **Rule changed per 05-M0 finding 5** (not the plan's `unit:total` sum): only bars with unit `Files` count; the
  shown percent is `floor(100 · parsed / total)` of the most advanced `Files` bar seen so far, never decreasing,
  capped at 99 until the process exits; `Byte` bars, logger lines and JDK warnings are ignored;
  `Indeterminate` until the first bar.
- Hand-written matcher of the plan's regex (no `regex` crate; the core has none and the tools version parser is
  hand-written too): `<1-3 digits>% [=*> *] *<n>/<total> <unit>, ETA: <N/A|HH+:MM:SS>`. Segments split on `\r`
  and `\n`; the unfinished last segment is kept and also read, but only once its ETA is complete, so a count cut
  off by a chunk boundary is never read (`should_not_read_a_count_cut_off_inside_the_eta`). A segment longer than
  4096 characters without a separator is dropped.
- Test renamed: "aggregate two interleaved trackers" → `should_follow_the_most_advanced_of_two_interleaved_trackers`.
  Extra: `should_ignore_the_byte_unit`, `should_follow_a_parallel_run_mixed_with_log_lines`. Fixture bars are
  drawn by a test helper that reproduces `ProgressTracker.kt` exactly (05-M0 kept no raw stderr bytes).
