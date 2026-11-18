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

- [x] 3.0 Electron download on npm 12
- [x] 3.1 Copy electron files
- [x] 3.2 Smoke harness
- [ ] 3.3 Shell policy
- [ ] 3.4 Core client
- [ ] 3.5 Preload, relay, lifecycle
- [ ] 3.6 Pickers and reveal
- [ ] 3.7 Packaging

## Notes

Environment (2026-11-18): Arch Linux x86_64, node 26.13.0, npm 12.2.2, rustc/cargo 1.95.0, Electron 44.9.1,
`DISPLAY=:1` (no `xvfb-run` needed). Branch `feature/studio-01-m3` from `feature/studio-integration`.

Known red gates that are not this milestone's:
- `npm test`: 9 failures, all in `stores/fileStore/loaders/ccJson/util/urlExtractor.spec.ts` (Node 26 / jsdom,
  see 01-M1). Baseline before any M3 change: 636 suites / 4863 tests, coverage 96.66 / 89.93 / 95.28 / 96.57.
- Root `npm run format:check`: 1 error (`lint/complexity/noForEach`) in
  `dev_docs/studio/agents/design/mockups/studio-screens.html`, committed by the design work (`dee66c89c`), not
  touched here. Every file this milestone changes passes `biome check`.

### 3.0
- Reproduced on a fresh `npm ci`: `node script/ensureElectron.js` printed `npm warn rebuild 6 packages had
  install scripts blocked because they are not covered by allowScripts` and `rebuilt dependencies
  successfully`, and `node_modules/electron/path.txt` stayed missing.
- Fix: run `node_modules/electron/install.js` directly with `process.execPath` (`execFileSync`, no shell),
  then fail with exit 1 when `path.txt` is still missing, so a blocked or failed download can no longer pass
  silently. Works on every npm version (it does not go through npm's script gate). `.npmrc` unchanged.
- Verified: fresh `npm ci` → `ensureElectron.js` → `path.txt` = `electron`; second run is a no-op (exit 0).

### 3.1
- Verified: `build` was `npm run patch && ng build && cp electron/* package.json dist/bundler/browser`;
  `electron/` held `main.js` and `coreMethods.generated.json` (M1), both copied by the glob.
- `script/copyElectron.js` copies an explicit list (today `electron/main.js`, `electron/coreMethods.generated.json`,
  `package.json`; later tasks add their files) with `fs.copyFileSync`, and exits 1 naming the folder when
  `dist/bundler/browser/index.html` is missing (checked by moving it away). An explicit list rather than the old
  glob so `*.test.js` and `smoke.e2e.ts` never reach the bundle.
- `npm run build` green; `cmp electron/main.js dist/bundler/browser/main.js` identical. PowerShell not available
  here: the script uses only Node built-ins and `&&`, which PowerShell 7 and `cmd.exe` both accept (not run on
  Windows). README: removed the "requires unix tools" note of the build section.

### 3.2
- `@playwright/test` is 1.63.0 here; its `_electron.launch` drives Electron 44.9.1 without the CDP fallback.
- `playwright.desktop.config.ts` (`testDir: "./electron"`, `workers: 1`, no `webServer`, `list` reporter),
  `electron/smoke.e2e.ts`, script `e2e:desktop`. Both tests green against the unchanged 55-line `main.js`
  (`2 passed (3.0s)`); until 3.5 that `main.js` ignores `CODECHARTA_USER_DATA_DIR`.
- knip: the Playwright plugin already finds `playwright.desktop.config.ts` (knip called a config entry for it
  redundant), so only `electron/**/*.e2e.ts` is listed under `entry`; the old "no entry on purpose" comment
  is rewritten accordingly.
- CI: job `build_visualization_desktop_smoke` in `test_visualization.yml` as planned; the workflow now also
  triggers on `core/**`, since the smoke suite starts the core. Action references copied from the same file
  (tag style, as in its other jobs); the Rust toolchain comes from preinstalled `rustup` like `test_core.yml`.
  YAML parsed with PyYAML; the job itself has not run (no CI here).

