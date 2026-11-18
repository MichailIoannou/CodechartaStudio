---
name: 01-M2 process runner, tools, settings, doctor
state: progress
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
- [ ] 2.4 Runner and tree kill
- [ ] 2.5 Tools and doctor
- [ ] 2.6 shell.resolvePath

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
