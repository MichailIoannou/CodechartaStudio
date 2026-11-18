---
name: 01-M2 process runner, tools, settings, doctor
state: complete
version: 1
---

## Goal

Give the core its data dir and settings, a hardened child-process runner with tree kill, and tool
discovery (`git`, `ccsh`, `java`, `gh`, `glab`) with `tools.doctor` and the `doctor` CLI, as plan 01
section 4 M2 describes.

## Tasks

Copied from `01-core-and-desktop-shell.md` section 4, M2 (tests to write first are listed there).

### 2.1 Data dir, settings file, `paths.*` methods
### 2.2 Child environment and batch-argument guard (`process/env.rs`, `process/launch.rs`)
- S4 (Windows) is still open: implement the plan's `check_batch_args` set; Windows-only tests stay `#[cfg(windows)]`.
### 2.3 `cc-fake-tool` and temporary repository helpers
### 2.4 Process tree and runner
### 2.5 Tools discovery, `tools.*` methods, `doctor` CLI, `Core::shutdown`
### 2.6 `shell.resolvePath`

## Steps

- [x] 2.1 Data dir and settings
- [x] 2.2 Child environment and batch guard
- [x] 2.3 Fake tool and temp repo helpers
- [x] 2.4 Runner and tree kill
- [x] 2.5 Tools and doctor
- [x] 2.6 shell.resolvePath

## Notes

Environment (2026-11-18): Arch Linux x86_64, rustc/cargo 1.95.0, node 26.13.0, npm 12.2.2, git 2.56.0.
The `x86_64-pc-windows-gnu` std is installed here, so every task also ran
`cargo clippy --all-targets --all-features --target x86_64-pc-windows-gnu -- -D warnings` to type-check the
`cfg(windows)` code. That compiles it; it does not run it — no Windows behaviour is claimed as verified.

### 2.1
- Verified against M1: `Core::new(CoreConfig)` and the `serve` `--data-dir` requirement existed as M1 noted;
  both are replaced. `Core::open(CoreConfig)` loads `<dataDir>/core-settings.json` and creates nothing;
  `serve` resolves the data dir with `CoreConfig::resolve(cli, env)` and no longer needs `--data-dir`.
- **Deviation: no `directories` crate.** It pulls in `option-ext` (MPL-2.0), which `core/deny.toml` does
  not allow. `config/paths.rs` resolves the same folder Electron uses as `appData` itself (Windows
  `%APPDATA%`, macOS `$HOME/Library/Application Support`, else `$XDG_CONFIG_HOME` or `$HOME/.config`) +
  `codecharta-visualization`, through the injected env lookup, which also makes it testable. A relative
  `--data-dir` / `CODECHARTA_DATA_DIR` is made absolute (`std::path::absolute`).
- `Paths::info()` returns `CoreResult<PathsInfo>` (plan: `PathsInfo`) because a non-UTF-8 path is an `Io`
  error on the wire. `paths.setStoreRoot` refuses a relative path (`BAD_REQUEST`) and a path that is not
  an existing folder (`NOT_FOUND`); settings stay untouched then.
- Settings: `SettingsStore` keeps the value in a `std::sync::Mutex`; `update` (async as planned) changes a
  clone, writes it (`tempfile::NamedTempFile::new_in(<dataDir>)` + `persist`, after `sync_all`) and only
  then swaps it in, so a failed write changes nothing. The newer-schema check reads `schemaVersion` from
  the raw JSON before typed parsing, so a newer file whose fields changed type is backed up, not called
  corrupt. An unknown `toolPaths` key (a tool this version does not know) makes the file "corrupt".
  Nothing is written on load; the first `update` writes the current schema.
- Crates: `tempfile` 3.27.0 (MIT OR Apache-2.0) moved from nothing to a normal dependency of
  `codecharta-core` (atomic writes) and a dev-dependency of `codecharta-cored`; `tokio` and `tracing` added
  to `codecharta-core`.
- Tests beyond the plan list: `should_make_a_relative_data_dir_absolute`,
  `should_default_to_the_app_folder_in_the_user_config_folder` (Linux only),
  `should_set_and_reset_the_store_root`, `should_refuse_a_relative_or_missing_store_root`,
  `should_open_without_creating_the_data_dir`, protocol `should_answer_paths_inside_the_data_dir`,
  `should_keep_a_chosen_store_root_in_the_settings_file`. The protocol tests now use a fresh temp data dir
  per test instead of one shared folder in the system temp dir.

### 2.2
- `process/env.rs`: `hardened_env`, `askpass_env` as planned, plus `child_env(base, overrides, askpass)` (the
  merge the runner does: request variables over the base, askpass variables last, a later name replaces an
  earlier one) and `variable(env, name)`. Variable names compare case-insensitively on Windows only
  (`Path` vs `PATH`). Search folders already on `PATH` are not added twice.
- `process/launch.rs`: `is_batch_file`, `check_batch_args` with the plan's set (`"`, `%`, `!`, CR, LF,
  NUL) — S4 is still open, so this is the plan's rule, not a verified one. Added `check_args` (NUL for every
  program). The refusal names the 1-based argument number and the character, never the argument (it may
  carry credentials). Extra tests: `should_accept_spaces_and_other_metacharacters_for_batch_files`,
  `should_refuse_nul_for_every_program`.

### 2.3
- `cc-fake-tool` (`codecharta-core/src/bin/cc-fake-tool.rs`) has the plan's modes plus two: asked with
  `--version` / `-version` it prints the sidecar files `<own stem>.stdout` / `<own stem>.stderr` next to
  itself (so a copy named `git` or `java` answers what the test wrote, without env variables that would race
  between parallel tests), and `print-env <name>` (for the `JAVA_HOME` test of 2.5). `echo-args` prints the
  arguments as one JSON array line. `version <text>` prints the text.
- `tests/support/mod.rs`: `fake_tool()`, `install_fake_tool(folder, name)`, `answer_version_with(tool,
  stdout, stderr)`, `system_git()` (scans `PATH`, no child process), `args(&[..])`; re-exports `TempRepo`
  from `tests/support/git_fixture.rs` (overview section 10 name). `TempRepo` runs git with a temp
  `HOME`/`XDG_CONFIG_HOME`, `GIT_CONFIG_NOSYSTEM=1`, fixed author/committer names, emails and dates and
  without inherited `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`; `env()` hands the same variables to the
  runner. `mod.rs` carries `#![allow(dead_code, reason = ...)]` because every integration test binary
  compiles the module and uses a different part of it (the usual shared-test-support pattern).
- Checked with a throwaway test (init + commit in a `TempRepo`, fake `git --version` from sidecars); not
  committed, the 2.4 tests use the helpers.

### 2.4
- Crates: `nix` 0.31.3 (MIT, feature `signal`, unix only) for `killpg` without unsafe code; `windows-sys`
  0.61.2 (MIT OR Apache-2.0, Windows only) for the job object; tokio feature `process`; `tokio-util` in
  `codecharta-core` for `CancellationToken`.
- `process/tree.rs`: `ProcessTree::attach`, `terminate` (unix SIGTERM to the group, Windows
  `TerminateJobObject`) and `kill` (SIGKILL / `TerminateJobObject`); ESRCH (group already gone) is not an
  error. The only unsafe code is the `cfg(windows)` `windows_job` module (`#[allow(unsafe_code)]`, each
  block with a SAFETY comment). It compiles and passes clippy for `x86_64-pc-windows-gnu`; it has **not run
  on Windows**. Job assignment happens right after spawn (not suspended), so the S4 race stays open: a
  grandchild started before the assignment would escape.
- `process/runner.rs`: plan shape, with these differences:
  - `RunRequest` has a `tool: ToolId` field, because `CoreError::ToolNotFound` / `ToolFailed` need the tool
    and the runner has no other way to know it. `RunRequest::new(tool, program, args, timeout)` fills the
    defaults (no cwd, no extra env, 16 MiB, no askpass, collect).
  - `ProcessRunner::new(base_env)` takes the finished base environment (`hardened_env(..)` already put the
    search folders on `PATH`), instead of `(base_env, extra_search_folders)`.
  - Stop sequence on timeout / cancel / output cap: `terminate`, wait up to 3 s for the child, then `kill`
    the whole tree anyway (catches grandchildren that ignore SIGTERM), then kill/reap the direct child.
    A normal exit kills nothing on unix (daemons a tool leaves behind are its business); on Windows the
    job handle closes at the end of the run and `KILL_ON_JOB_CLOSE` ends whatever is left.
  - Validation: absolute program, no NUL in any argument, batch rule for `.cmd`/`.bat`, absolute existing
    cwd, timeout > 0, output cap 1..=256 MiB, all `BAD_REQUEST`. Spawn `NotFound` → `TOOL_NOT_FOUND`,
    `InvalidInput` → `BAD_REQUEST`, other → `TOOL_FAILED`. A child ended by a signal reports exit code -1.
  - `OutputMode::Stream` sends chunks only; the `RunOutput` texts are then empty.
  - `kill_all` kills every live tree (used by `Core::shutdown` in 2.5).
- New `process/output.rs` (pipe readers, cap, streaming) and `process/utf8.rs` (`Utf8Decoder`, holds back
  an incomplete character across reads; invalid bytes become U+FFFD).
- Tests: all plan names in `tests/runner.rs`, plus `should_kill_running_children_on_kill_all` and unit tests
  of the decoder. The two `#[cfg(windows)]` tests (`should_pass_arguments_unchanged_through_a_cmd_file`,
  `should_kill_java_like_grandchild_of_a_cmd_file`, module `batch_files`) are written but **never ran**
  (no Windows here); CI's `windows-latest` job will be their first run. Grandchild liveness: unix
  `kill(pid, 0)`, Windows `tasklist`, polled up to 5 s because a killed grandchild stays a zombie until
  init reaps it. Ran the suite three times in a row: green, no `cc-fake-tool` left running.

### 2.5
- Api (`methods/tools.rs`): `ToolState`, `ToolSource`, `ToolStatus`, `ToolsReport`, `DoctorParams`,
  `SetToolPathParams`, `ClearToolPathParams`; methods `tools.doctor` (renderer), `tools.setPath` (shell),
  `tools.clearPath` (renderer); contract regenerated (renderer allow-list now `core.ping`, `paths.get`,
  `paths.resetStoreRoot`, `tools.doctor`, `tools.clearPath`).
- **Deviation: `ToolSource` has a fourth value `javaHome`** (java found in `$JAVA_HOME/bin`); the plan's three
  values had no honest name for it. `run(Ccsh)` sets `JAVA_HOME` only when java came from `custom` or
  `wellKnownFolder` (with `javaHome` it is already set, with `path` ccsh finds java itself).
- `tools/definitions.rs` (`TOOLS`, `definition(tool)`; git minimum written `2.31.0`), `tools/version.rs`
  (`read_version`, `is_at_least`, hand-written parsing, no regex crate: up to three numeric segments; git,
  ccsh, gh need three, java one; glab = first `x.y.z` that is not part of a longer number),
  `tools/finder.rs` (`SearchLocations { java_home_bin, path_folders, well_known_folders }` with
  `from_environment` and `only(folders)` for tests, `search_folders`, `find_executable`,
  `well_known_folders`), `tools/doctor.rs` (`Tools`, `ToolsSetup { settings, runner, locations }`,
  `ToolRunOptions::new(timeout)`, `ResolvedTool`).
- `Tools::doctor` holds a tokio mutex over the cache while it checks, so concurrent callers share one check.
  The five checks run concurrently with `tokio::join!` in one task (no spawn, no `'static` needed);
  `on_checked(done, total)` follows each. A cancelled doctor answers `CANCELLED`, the runner kills the
  version processes. `resolve` / `run` use the cached report (checking once if there is none).
- A custom path whose file is gone reports `missing` with the problem "The chosen file no longer exists."
  (no silent fall-back to discovery). `setPath` needs an existing absolute file that answers with a version
  (a too-old version is accepted and reported `tooOld`); otherwise `TOOL_FAILED` and the settings stay.
  The status `path` is the lossy UTF-8 form of the path (display only); `run` uses it as the program path,
  so a tool in a non-UTF-8 folder cannot be run — acceptable, noted.
- `checkedAt`: `humantime` 2.4.0 (MIT OR Apache-2.0), `format_rfc3339_seconds` (UTC, `Z`).
- `Core` now owns `Arc<ProcessRunner>` (base env = `hardened_env(process env, well-known folders)`) and
  `Tools`; `Core::shutdown()` = `runner.kill_all()`, called by `serve` after the session finished (EOF or
  `core.shutdown`) and by the `doctor` command. `Core` no longer derives `Debug`.
- Dispatch: tool handlers live in `codecharta-cored/src/serve/tools_routes.rs` (dispatch.rs was getting long);
  `tools.doctor` emits `core.progress { requestId, message: "Checked N of 5 tools", done, total }`.
- CLI: `codecharta-core [--data-dir D] doctor [--json] [--refresh]`; one line per tool
  (`git   ok        2.56.0    /usr/bin/git`, optional absent tools say `absent`); exit 0 = every required
  tool ok, 1 = not, 2 = the check itself failed. On this machine: git 2.56.0 ok, java 27.0.1 ok, ccsh, gh,
  glab not installed → exit 1.
- **Test-only race found and fixed:** copying the fake tool while another test thread forks lets that child
  inherit the copy's write handle until it execs; executing the copy then fails with ETXTBSY ("Text file
  busy", seen once in 40 repeated runs). `install_fake_tool` now runs the copy once and retries while it is
  busy before returning. 40 further repeated runs of `runner` + `tools`: green. Production code is not
  affected (it never runs a file it just wrote).
- Tests: every plan name (unit, `tests/tools.rs`, protocol `should_emit_progress_during_doctor`, CLI
  `should_exit_1_when_a_required_tool_is_missing`), plus `should_read_a_full_java_version`,
  `should_read_gh_and_glab_versions`, `should_not_read_a_version_from_other_text`,
  `should_treat_missing_segments_as_zero`, `should_find_the_definition_of_every_tool`,
  `should_report_progress_for_every_tool`, `should_not_run_a_missing_tool`, CLI
  `should_print_the_report_as_json`, doctor rendering tests. The tools tests install the fake as `git`,
  `ccsh` (on Windows a `ccsh.cmd` calling `ccsh-fake.exe`) and `java` in a temp folder that is the only search
  folder. The protocol and CLI tests point `PATH` and `HOME` at an empty temp folder and remove `JAVA_HOME`;
  the CLI test makes git missing deterministically through a custom path to a file that does not exist.
- Docs: `core/README.md` (data dir lookup, `doctor`, child-process rule), root `CLAUDE.md` core commands.

### 2.6
- Api `methods/shell.rs`: `ShellPathTarget` (`#[serde(tag = "kind", rename_all = "camelCase",
  rename_all_fields = "camelCase")]`; ts-rs 12 renders the fields camelCase too), `ResolvePathParams
  { target }`, `ResolvePathResult { path }`, method `shell.resolvePath` (shell).
- `Paths::resolve(&ShellPathTarget) -> CoreResult<PathBuf>`: data folder, `<dataDir>/logs`, the current store
  root; `snapshotMap` → `NOT_FOUND` until plan 03. Nothing is created on disk (a reveal of a folder that does
  not exist yet is the shell's case to handle: open the parent, plan 3.12 "or its parent").
- Tests: `should_resolve_the_store_root`, `should_answer_not_found_for_snapshot_maps_without_a_store`, plus
  `should_resolve_the_data_and_logs_folders`, api parsing tests and protocol `should_resolve_shell_path_targets`.

### Gates at the end of M2 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` (also for
  `--target x86_64-pc-windows-gnu`), `cargo test --all-features` green; `npm run contract` leaves no diff;
  root `npm run format:check` green; `visualization/`: `npm run lint`, `npx tsc --noEmit -p tsconfig.json`
  green. `npm test`: 636 suites / 4863 tests, 9 failures, all in the known
  `stores/fileStore/loaders/ccJson/util/urlExtractor.spec.ts` (Node 26 / jsdom, see 01-M1 notes); coverage
  gate met (96.66 / 89.93 / 95.28 / 96.57). M2 touches no app code; only generated `model/coreApi/` types.

### For 01-M3 (Electron shell) and plan 03
- Start the core: `codecharta-core serve --data-dir <app.getPath("userData")>` (global flags may come before
  or after the subcommand). Without `--data-dir` the core uses `CODECHARTA_DATA_DIR`, else
  `<appData>/codecharta-visualization`, the same folder as Electron's default `userData`.
- Methods now registered (`METHODS` order): `core.hello` (shell), `core.ping`, `core.shutdown` (shell),
  `paths.get`, `paths.setStoreRoot` (shell), `paths.resetStoreRoot`, `tools.doctor`, `tools.setPath` (shell),
  `tools.clearPath`, `shell.resolvePath` (shell). Event `core.progress` (renderer); client notification
  `core.cancel` (shell). `electron/coreMethods.generated.json` lists the renderer ones.
- `tools.setPath` / `paths.setStoreRoot` take the path from the native picker in main. Errors: `TOOL_FAILED`
  (file does not answer like the tool), `BAD_REQUEST` (relative store path), `NOT_FOUND` (store folder does
  not exist).
- Rust for later plans: `Core::open(CoreConfig::resolve(cli, env))`, `core.paths().store_root()`,
  `core.tools().run(ToolId::Git, args, ToolRunOptions { cwd, env, askpass, .. }, &cancel)`,
  `ProcessRunner` (`RunRequest` has a `tool` field), `SettingsStore::update`, `Paths::resolve` (extend
  `ShellPathTarget` and its match there), `tests/support` (`TempRepo`, `install_fake_command`,
  `answer_version_with`, `is_gone_soon`, `read_pid_file`).
- Still open: S4 (batch argument set and job-object race) and every Windows-only test have not run on
  Windows; the first `windows-latest` CI run is their first execution.
