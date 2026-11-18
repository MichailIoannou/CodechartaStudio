---
name: 01-M0 spikes for the core and the desktop shell
state: progress
version: 1
---

## Goal

Settle the UNVERIFIED items plan 01 rests on (Electron sandbox and IPC, shipping a Rust binary, batch
arguments, askpass, contract generation) before any production code is written. No production commits.

## Tasks

Copied from `01-core-and-desktop-shell.md` section 4, M0. This machine is Linux only; anything that
needs Windows or macOS is recorded as open for the owner, not guessed.

### S1. Electron 44 sandbox and IPC
- Sandboxed preload restrictions; `senderFrame` null cases; `will-navigate` for the `vscode://` anchor;
  `contextBridge` copying a 100 MB `Uint8Array` (time, memory).

### S2. Shipping the core binary
- Spawn a hello-world Rust binary from `main.js` unpackaged and from `npm run package:local` with
  `extraResource`; confirm `process.resourcesPath`, that it stays outside the asar and is executable.

### S3. Packaging from Linux with the darwin binary
- Executable bit through artifact upload + `bestzip`; Gatekeeper behaviour (no Mac: open risk).

### S4. Rust on Windows and batch files
- `Command::new("<abs>\\ccsh.cmd")` with metacharacters; `check_batch_args` set; job-object race.

### S5. Askpass
- A Rust executable as `GIT_ASKPASS` / `SSH_ASKPASS` with the listed environment; path with spaces;
  argv shape; local repo and local dummy remote only.

### S6. Contract generation
- `ts-rs`: tagged enums, `Option`, `BTreeMap`, `u64` override, a generated method map; Biome
  formatting of the output. Otherwise choose `specta`.

## Steps

- [ ] S1 (Linux)
- [ ] S1 (Windows) — needs owner hardware
- [ ] S2 (Linux)
- [ ] S2 (Windows, macOS) — needs owner hardware
- [ ] S3
- [ ] S4 — Windows only
- [ ] S5 (Linux)
- [ ] S5 (Windows, Git for Windows) — needs owner hardware
- [ ] S6

## Notes

