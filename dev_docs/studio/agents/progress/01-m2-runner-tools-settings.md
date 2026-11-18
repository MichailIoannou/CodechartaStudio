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

- [ ] 2.1 Data dir and settings
- [ ] 2.2 Child environment and batch guard
- [ ] 2.3 Fake tool and temp repo helpers
- [ ] 2.4 Runner and tree kill
- [ ] 2.5 Tools and doctor
- [ ] 2.6 shell.resolvePath

## Notes

