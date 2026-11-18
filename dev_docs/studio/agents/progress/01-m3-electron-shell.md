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
- [x] 3.3 Shell policy
- [x] 3.4 Core client
- [x] 3.5 Preload, relay, lifecycle
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

### 3.3
- `electron/shellPolicy.js` (pure, CommonJS, Node built-ins only): `describeTrustedPage`, `isTrustedSender`,
  `judgeNavigation`, `resolveCoreExecutable`, `planCoreRestart`, `isRendererMethod`, plus `isRendererEvent` and
  `isValidOperationId` (the relay needs both; one test each beyond the plan list).
- Sender snapshot shape: `{ hasFrame, isMainFrame, frameUrl, webContentsId }`, which main captures synchronously
  from `event.senderFrame` / `event.sender` before any `await` (S1).
- A dev server is trusted only when unpackaged and `CODECHARTA_DEV_SERVER_URL` is `http://localhost:<port>` or
  `http://127.0.0.1:<port>`; otherwise the bundled `index.html` is the trusted page. File URLs are compared with
  `fileURLToPath(url, { windows })` + `path.win32`/`path.posix.normalize`, lower-cased on Windows; query and
  hash are ignored. The Windows case is unit tested with a `win32` path on Linux; not run on Windows.
- Backoff reading: failures 1-5 inside 60 s get 0.5/1/2/4/8 s, the sixth gives up (`delayMs: null`), which
  matches manual step 6 ("kill it six times quickly → unavailable").
- `test:electron` = `node --test "electron/*.test.js"` (quoted glob, Node >= 21), and a step in
  `build_visualization_test`. 17 tests green.

### 3.4
- `electron/coreClient.js`: `CoreClient extends EventEmitter` with injected `spawn`, `logStream`, `now`,
  `setTimeout`, `clearTimeout` (added beside the plan's list so the kill timer can be cancelled),
  `clientName`, `protocolVersion`. Methods `start`, `request(method, params) → { id, promise }` (the promise never
  rejects; it resolves `{ ok, value | error }`), `cancel(id)`, `stop() → Promise`, plus `restart()` (only from
  `unavailable`: resets the failure history and starts again) and `currentState()`. Events `"notification"
  (method, params)` and `"state" ({ state, message })`, states `starting | ready | restarting | unavailable |
  stopped`.
- Requests made before the hello answer are queued and written after it (the core gates on hello inline, so
  pipelining would also work, but queueing keeps a failed hello from producing `BAD_REQUEST`s). A cancel of a
  queued request answers `CANCELLED` without writing anything.
- Spawn `ENOENT` → `unavailable` at once with the expected path in the message, no restart. Another spawn error
  counts as an exit. A hello answered with `PROTOCOL_MISMATCH` (or a different `protocolVersion`) →
  `unavailable`, stdin closed, no restart.
- Wire errors: `error.data` is the `ErrorPayload` (the core always sends one, also for framing faults);
  without it the client answers `INTERNAL` with the JSON-RPC message.
- Tests: the seven plan names plus "should report unavailable with the path when the core is missing", "should
  send core.cancel for a running request", "should write the core log to the log stream", "should start again
  from unavailable when restarted". `test:electron`: 28 green.

### 3.5
- `electron/preload.js` (one CommonJS file, `require("electron")` only). At load it asks main once with
  `ipcRenderer.sendSync("codecharta:hello")` → `{ protocolVersion, coreState }` (an extra internal channel next
  to the planned five; the sandboxed preload cannot read `coreMethods.generated.json`). If main refuses the
  sender (answer `null`), **nothing is exposed**. Exposed in this task: `protocolVersion`, `request`, `cancel`,
  `subscribe`, `restartCore`; 3.6 adds the pickers and shell actions.
- `subscribe("shell.coreState", handler)` also delivers the **current** core state once, asynchronously
  (microtask), right after subscribing, then every change — so a renderer that subscribes after boot never
  misses the state. Other events are delivered only as they arrive. Handler exceptions are swallowed.
- `main.js`: order `CODECHARTA_USER_DATA_DIR` (absolute only) → `requestSingleInstanceLock()` (else `app.quit()`)
  → `second-instance` restores/focuses → `app.enableSandbox()` → IPC handlers → `whenReady` → start core → window.
  `webPreferences` as planned; `backgroundColor` from `<userData>/shell.json` or `#ffffff`.
- Sender check: every handler captures `{ hasFrame, isMainFrame: senderFrame.parent === null, frameUrl,
  webContentsId }` synchronously at entry, before anything async (S1), and rejects with `Error("Forbidden")`
  otherwise. A method outside `rendererMethods` answers `{ ok: false, error: { code: "NOT_ALLOWED" } }` (data,
  not a rejection); a bad `operationId` answers `BAD_REQUEST`.
- Operations: `operationId → wire id` per webContents; `core.progress.requestId` is rewritten to the
  `operationId` before forwarding, and progress of requests without one is dropped. Main-frame cross-document
  navigation (`did-start-navigation`), `render-process-gone` and window `closed` send `core.cancel` for every
  in-flight request of that webContents.
- Navigation: `will-navigate` keeps internal, opens external with `shell.openExternal`, blocks the rest;
  `setWindowOpenHandler` always denies and opens only external; `will-attach-webview` prevented. Dev server via
  `CODECHARTA_DEV_SERVER_URL` (unpackaged, localhost only) → `loadURL`.
- Core: `codecharta-core serve --data-dir <userData>`; stderr to `<userData>/logs/core.log`, previous run renamed
  to `core.log.1`; state changes go to the page as `{ event: "shell.coreState", payload: { state, message } }`
  on `codecharta:event`; `before-quit` waits for `CoreClient.stop()` (EOF, kill after 5 s) once, then quits.
- CSP: `frame-src 'none'` added to `app/index.html` (S1). Web e2e stays green with it (html2canvas' clone
  iframe is `about:blank` and not blocked).
- CHANGELOG (Changed): the planned "One desktop window" line, nothing else.
- Smoke: the five planned tests green (7 in total). Extra manual check with a scratch Playwright script (not
  committed): `SIGKILL` of the core → states `ready, restarting, starting, ready`, `core.ping` works again;
  `tools.doctor { refresh: true }` with `operationId: "op-1"` delivered 5 `core.progress` events carrying
  `requestId: "op-1"`; after `close()` no `codecharta-core` process was left and `logs/core.log` existed.
- Web `e2e:ci` ran with a temporary, uncommitted `BROWSER_CHANNEL = "chromium"` in `app/playwright.helper.ts`
  and Playwright's chromium installed only under `node_modules/.cache/ms-playwright`
  (`PLAYWRIGHT_BROWSERS_PATH`), since this machine has no Google Chrome; run as `CI=1 npx playwright test
  --workers=1`.

