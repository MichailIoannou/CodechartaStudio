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
- [ ] 2.2 Child environment and batch guard
- [ ] 2.3 Fake tool and temp repo helpers
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

