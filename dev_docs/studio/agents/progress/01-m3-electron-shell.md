---
name: 01-M3 Electron shell
state: progress
version: 1
---

## Goal

Make `visualization/electron/` a thin, sandboxed shell that starts the core, relays allow-listed
JSON-RPC calls and events through one preload bridge, offers native pickers and reveal, and ships the
core binary with the packaged app (plan 01 section 4 M3).

## Tasks

Copied from `01-core-and-desktop-shell.md` section 4, M3 (tests to write first are listed there).

### 3.0 Electron download on npm 12 (added by orchestration)
- `script/ensureElectron.js` reports success but npm 12's allowScripts gate blocks the download
  (`01-m0-spikes.md`, side finding). Make it actually install Electron.
### 3.1 Copy electron files without POSIX `cp`
### 3.2 Electron smoke harness and CI job
### 3.3 `shellPolicy.js`
### 3.4 `coreClient.js`
### 3.5 Preload, relay, lifecycle
- From S1: read and check `event.senderFrame` synchronously before any `await`; add `frame-src 'none'`
  to the CSP in `app/index.html`.
### 3.6 Native pickers and reveal
- No user-facing wording in the shell: titles and filters come from the caller.
### 3.7 Packaging with the core binary
- From S3: `chmod +x` after artifact download and a mode check inside the zips; darwin core built on a
  macOS runner.

## Steps

- [ ] 3.0 Electron download on npm 12
- [ ] 3.1 Copy electron files
- [ ] 3.2 Smoke harness
- [ ] 3.3 Shell policy
- [ ] 3.4 Core client
- [ ] 3.5 Preload, relay, lifecycle
- [ ] 3.6 Pickers and reveal
- [ ] 3.7 Packaging

## Notes

