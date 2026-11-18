# Orchestration state

Single source of truth for which milestone of plans 01–06 is where. Updated and committed by the
orchestrator after every change of state. Another machine continues from this file alone.

## Branching

- `feature/studio-integration` (local, branched from `main` at `96a239f00`) collects this file and
  every verified milestone. It is never pushed or merged into `main` without the owner.
- Each milestone runs on `feature/studio-<plan>-<milestone>` (e.g. `feature/studio-01-m1`), branched
  from the current tip of `feature/studio-integration`, and is merged back into it after verification.
- Spikes run on throwaway branches; only their progress file is kept.

## Design gate

`dev_docs/studio/agents/design/STATUS.md` exists since 2026-11-18 (committed by the designer directly on
`feature/studio-integration`). Checked 2026-11-18 22:40: **every area is "ready"** (handed over in
5935e1ed6, last design commit 95606737e). UI milestones may start; the design files override the plans'
UI descriptions.

## Milestones

State: todo · blocked · in progress · done. "UI" = needs its design area to be ready (all ready since 2026-11-18 22:40).

| Milestone | Kind | State | Blocked on | Branch | Last verified commit |
|---|---|---|---|---|---|
| 01-M0 Spikes | spike | done (Linux); Windows/macOS items open for owner | owner hardware for S1/S2/S3/S4/S5 remainder | feature/studio-01-m0 | 977074f72 |
| 01-M1 Core skeleton, protocol, contract, CI | core | done | — | feature/studio-01-m1 | c6b3d9a7f (merged 8688edb53) |
| 01-M2 Process runner, tools, settings, doctor | core | done (Windows-only tests not yet run) | — | feature/studio-01-m2 | 5169e28c9 (merged a57c8e7e9) |
| 01-M3 Electron shell | shell | done (Windows/macOS and CI not run) | — | feature/studio-01-m3 | d8cdbfdfd (merged 1ce44fc54) |
| 01-M4.1 Renderer seam (desktop bridge port, fake) | renderer, no UI | todo (next) | — | feature/studio-01-m4 | — |
| 01-M4.2 Desktop tools panel | UI | todo | 01-M4.1 | — | — |
| 02-M0 Spike | spike | done | — | feature/studio-02-m0 | f0d4006c9 |
| 02-M1 Dark by default | UI | in progress | — | feature/studio-02-m1 | — |
| 02-M2 No-flash boot | UI | todo | 02-M1 | — | — |
| 02-M3 Radial map and word cloud | UI | todo | 02-M2 | — | — |
| 02-M4 Dependency graph, color-range diagram | UI | todo | 02-M3 | — | — |
| 02-M5 Editor schemes (quick toggle dropped, OD10) | UI | todo | 02-M4 | — | — |
| 02-M6 Native window appearance | UI | todo | plan 01 | — | — |
| 03-M0 Spikes | spike | in progress (items 0, 3 done on Linux; 1, 2, 4 wait) | 01-M3 for items 1, 2, 4; owner hardware for item 3 on Windows | feature/studio-03-m0a | 0432ed0ad |
| 03-M1 Store core | core | done (Windows lock/rename paths not run) | — | feature/studio-03-m1 | 218bdffad (merged 2aedf471f) |
| 03-M2 Projects: core, RPC, CLI, shell, fake | core + shell | part A (tasks 1–7) verified, **merge pending**; part B todo | merge: uncommitted owner/designer edits to plan 03 in the main checkout; part B (tasks 8–9): 01-M4.1 | feature/studio-03-m2 | 168d4fa21 (verified, not merged) |
| 03-M3 Snapshots: core, RPC, CLI, shell | core + shell | part A (tasks 1–5) verified, **merge pending** (after 03-M2; resolve the add/add conflict on `03-m3-snapshots.md` with the branch's version); part B todo | merge: same as 03-M2; part B (task 6): 01-M4.1 | feature/studio-03-m3 | f93165d40 (verified, not merged) |
| 03-M4 Renderer load path | renderer | todo | 03-M3; check for visible parts first | — | — |
| 03-M5 Projects UI | UI | todo | 03-M4 | — | — |
| 03-M6 Import and store settings | UI | todo | 03-M5 | — | — |
| 03-M7 Local source and scenarios | UI | todo | 03-M6 | — | — |
| 04-M1 Core: fixtures, contract, runner, status, refs | core | todo | plan 03 core | — | — |
| 04-M2 Core: log, details, queries, changed files | core | todo | 04-M1 | — | — |
| 04-M3 History view, branches pane, chip | UI | todo | 04-M2; plan 03 renderer (03-M4/M5) | — | — |
| 04-M4 Commit list with graph, filters, details | UI | todo | 04-M3 | — | — |
| 04-M5 Selection, keyboard, context menu, ports | UI | todo | 04-M4 | — | — |
| 04-M6 Read-only end-to-end and docs | UI | todo | 04-M5 | — | — |
| 04-M7 Operation queue, progress, prompts | core + UI | todo | 04-M2 | — | — |
| 04-M8 Fetch and branches | core + UI | todo | 04-M7 | — | — |
| 04-M9 Changes and diff | core + UI | todo | 04-M8 | — | — |
| 04-M10 Commit | core + UI | todo | 04-M9 | — | — |
| 04-M11 Pull, push, abort | core + UI | todo | 04-M10 | — | — |
| 04-M12 Workflow e2e, docs, stash | UI | todo | 04-M11 | — | — |
| 05-M0 Spikes on a real Windows machine | spike | blocked | owner: needs a Windows machine | — | — |
| 05-M1 Run one analysis from the core | core | todo | plan 04 core | — | — |
| 05-M2 Snapshot records | core | todo | 05-M1 | — | — |
| 05-M3 Queue, preflight, RPC, CLI | core | todo | 05-M2 | — | — |
| 05-M4 Analyse from the UI, browse snapshots | UI | todo | 05-M3; 04 UI | — | — |
| 05-M5 Nearest snapshot and stale notice | core + UI | todo | 05-M3 | — | — |
| 05-M6 Batches, retention, cleanup | core + UI | todo | 05-M5 | — | — |
| 05-M7 E2E and docs | UI | todo | 05-M6 | — | — |
| 06-M0 Spikes | spike | todo | plan 05 core (item 3 needs Windows) | — | — |
| 06-M1 Compare core: commit vs commit | core + UI | todo | plan 05 core | — | — |
| 06-M2 Entry points | UI | todo | 06-M1 | — | — |
| 06-M3 Missing snapshots and staleness | core + UI | todo | 06-M1 | — | — |
| 06-M4 Changed files | core + UI | todo | 06-M3 | — | — |
| 06-M5 PRs and merge requests | core + UI | todo | 06-M4 | — | — |
| 06-M6 Polish and stretch | UI | todo | 06-M5 | — | — |

The core/UI split of mixed milestones is provisional; it is confirmed against the plan text when
the milestone is started.

## Deviations from the plans

- 01-M0 (see `01-m0-spikes.md`): contract generator is ts-rs 12 with `with_large_int("number")` and
  `biome check --write` on the output. For M3: the relay reads `event.senderFrame` synchronously before
  any `await`; the CSP gains `frame-src 'none'`. darwin core binary built on a macOS runner.
- Pre-M3 fix needed: with npm 12 `script/ensureElectron.js` reports success but the allowScripts gate
  blocks the Electron download; `npm start` / packaging need `install.js` called directly. To be done
  as task 0 of 01-M3.
- 02-M0 (see `02-m0-spike.md`): plan 02 design holds. For M1: delete `@theme` lines 19-38; task 7 must
  also set label `color` and `border` from the `buildingLabel` palette. E2E on this Linux machine
  needs a temporary `channel: "chromium"` override (no Google Chrome installed); not a repo change.

- 01-M1 (see `01-m1-core-skeleton.md`): `rust-toolchain.toml` channel `stable` + `rust-version = "1.95"`
  (an exact pin made rustup download); workspace `resolver = "3"`; `serve` requires `--data-dir` until
  2.1; licences checked by a `cargo-deny` job in `test_core.yml` (not run locally); Rust prerequisite
  documented in `dev_docs/DEV_START_GUIDE.md` (root README has no prerequisites section).
- 01-M2 (see `01-m2-runner-tools-settings.md`): no `directories` crate (pulls an MPL-2.0 crate that
  `deny.toml` refuses); the core computes Electron's appData folder itself. `RunRequest` gains `tool`,
  `ToolSource` gains `javaHome`; doctor CLI exit codes 0 ready / 1 not ready / 2 check failed.
  Windows-only `.cmd` and job-object tests are `#[cfg(windows)]` and first run on the `windows-latest`
  CI job; the job-object assignment race (S4) stays open.
- 03-M0 part A (see `03-m0-spikes.md`): for 03-M1 use std `File::try_lock` (drop `fs4`), lock only
  `.lock`; no `directories` crate; `trash` 5.4.0 is fine. Plan 01 as built lacks a `GitRunner` trait
  (03-M2 adds an async one over `Tools::run`); there is no `--store-root` / `CODECHARTA_STORE_ROOT`
  (`--data-dir` already isolates the store); `paths.setStoreRoot` overlaps plan 03's `store.changeRoot`.
  To check after 01-M3: `pickFolder` returns a path to the renderer vs plan 03's pick-token rule;
  `readSnapshotMap` reads whole files vs plan 03's chunks; bridge call shape.
- Owner decision OD1 (`design/owner-decisions.md`, README; commit 15c92e430): one working folder at a time.
  Plan 03's `project.json.view.visibleFolderIds` becomes `workingFolderId`; the multi-folder selector of
  03-M5 is removed; 04 and 05 read the working folder. Passed to the 03-M1 agent; applies to the store
  format from whichever 03 milestone first writes `project.json` (03-M2 per the plan).
- 03-M1 (see `03-m1-store-core.md`): new error codes `STORE_NEWER_SCHEMA`, `STORE_LOCKED`; store problem
  code `Io`; only `ProjectId`/`FolderId`/`SnapshotId` newtypes so far; the leftover sweep removes only
  `.tmp-*` files and `.incoming-*` folders in the store's own folders. Plan 03 text corrected by the
  agent (names from plan 01, module table, error codes, crate list).
- 01-M3 (see `01-m3-electron-shell.md`): `chooseToolExecutable(tool, { title, filters })` and
  `chooseStoreRoot({ title })` take the caller's options (no shell wording; the Windows `exe, cmd, bat`
  filter moves to the renderer); picker/shell actions in `electron/shellActions.js`; extra internal
  channel `codecharta:hello`; one reusable `build_core.yml` instead of two build matrices;
  `script/appCheckCoreModes.js`. `pickFolder`/`pickFile` return a path string — plan 03's pick tokens
  are reconciled in 03-M2 part B. Unverified: Windows/macOS, CI runner labels (`ubuntu-24.04-arm`,
  `windows-latest` → arm64, `macos-latest` both darwin targets), a real native picker click.
- Local e2e on this machine: `app/playwright.helper.ts` picks `channel: "chrome"`, which is not
  installed; verification uses a temporary, never-committed `chromium` override with Playwright's
  browser under `node_modules/.cache/ms-playwright`.
- 03-M2 part A (see `03-m2-projects.md` on `feature/studio-03-m2`): results wrapped in named types
  (`ProjectList`, `ResolveCommitResult`, `SourceFileLookup`) for the contract exporter; async `GitRunner`
  trait in `git/runner.rs`; six error codes appended (`TOKEN_EXPIRED`, `DUPLICATE_FOLDER`,
  `DUPLICATE_LABEL`, `FOLDER_UNAVAILABLE`, `DIFFERENT_HISTORY`, `TOO_LARGE`); `trash` 5.4.0 added
  (cargo-deny passes); OD1 applied (`workingFolderId`, `projects.setView { projectId, view }`).
  Pick tokens settle the 01/03 conflict: the shell builds `projects.pickFolder` (native dialog → shell-only
  `projects.inspectFolder` → token), the renderer sends only tokens; plan 01's path-returning
  `pickFolder` stays for the shell's own uses. Shell-only methods are absent from the renderer allow-list
  (checked). For 03-M3: `NOT_A_COMMIT` not yet appended; `resolve_commit` lacks `%cI` and `%P`.
- 03-M3 part A (see `03-m3-snapshots.md` on `feature/studio-03-m3`): `snapshot.json` gains `createdAt`
  (addition to overview section 5); `snapshots.list` answers `SnapshotList`; `NOT_A_COMMIT` appended;
  `flate2` and `sha2` added (cargo-deny passes); `Store::open` repairs a half-moved snapshot; CLI errors
  print `CODE: message`. Shell-only `snapshots.inspectImportFile` and `snapshots.mapLocation` are absent
  from the renderer allow-list (checked). For the shell: compare the map's realpath against the store root
  before reading chunks; `checksum`/`rootName` stay null until `recordMapFacts`. Imports have no size limit.

## Known environment issues (not caused by the milestones)

- This machine runs Node 26.13 while `mise.toml` and CI pin Node 24. On Node 26 the upstream
  `urlExtractor.spec.ts` fails 9 tests (`Cannot delete property 'location' of #<Window>`). Owner decision
  (2026-11-18): the original is excluded in `visualization/conf/jestUnit.config.json`
  (`testPathIgnorePatterns`) and replaced by `urlExtractor_fixed.spec.ts` next to it, which drops the
  `window.location` mocking (the source never reads it). Verified by the orchestrator: `npm test` 636/636
  suites, 4861 passed, coverage 96.71 / 90.1 / 95.33 / 96.62; `tsc`, `npm run lint`, root format check green.

## Owner decisions taken from the open questions (2026-11-18)

1. Windows/macOS spike items of 01-M0 (S1, S2, S3 Gatekeeper, S4, S5): work continues without them; the
   owner tests later with the procedures in `01-m0-spikes.md`.
2. `Unicode-3.0` added to `license_policy.json` (allow); the one-crate exception in `core/deny.toml` is
   replaced by `Unicode-3.0` in its allow list. `cargo deny check licenses sources` (0.21.0, installed
   only in a scratch folder) passes locally: `licenses ok, sources ok`. `license_policy.json` is an
   upstream file; the edit may need upstream approval later.
3. `actions/cache@v5` pinned by SHA (`caa296126883cff596d87d8935842f9db880ef25`, confirmed as the `v5` /
   `v5.1.0` tag with `git ls-remote`) in `test_core.yml`.
4. Rust toolchain stays `stable` with `rust-version = "1.95"`.
5. Node 26 spec: see above.

## Open questions for the owner

Design questions are in `design/open-questions.md`; none are left here.

## Session log

- 2026-11-18: 03-M3 part A verified on a scratch merge of integration + 03-M2 + 03-M3 (cargo fmt/clippy/test 282, cargo-deny, contract drift, format, lint, tsc, test:electron 42/42, npm test 636/636). Merge pending, as for 03-M2.
- 2026-11-18 22:40: design ready for all areas. 02-M1 started (visualization lane) and 03-M3 part A started (core lane, from feature/studio-03-m2). 03-M2 merge still pending on the uncommitted plan 03 edit.
- 2026-11-18, end of session: 03-M2 part A verified on a scratch merge of `feature/studio-integration` +
  `feature/studio-03-m2` (cargo fmt/clippy/test 230, cargo-deny, contract drift, format, lint, tsc,
  npm test 636/636, test:electron 42/42). Real merge refused: the main checkout has uncommitted edits to
  `02-themes.md`, `03-projects-and-managed-store.md`, `04-git-branches-and-history.md` and two design
  files, not made by the orchestrator. Next session: once those are committed, run
  `git merge --no-ff feature/studio-03-m2` and re-run the gates; then start 01-M4.1 (visualization lane)
  and 03-M3 (core lane). Session stopped at 5-hour usage ~75% to stay clear of the limit.
- 2026-11-18: 01-M3 verified on the merged integration branch (format, lint, tsc, contract drift, npm test 636/636, test:electron 42/42, ensureElectron download on npm 12, build, e2e:desktop 9/9, web e2e:ci 149/149) and merged.
- 2026-11-18: 03-M1 verified on the merged integration branch (cargo fmt/clippy/test 164, contract drift, format, lint, tsc, npm test 636/636, coverage 96.71/90.1/95.33/96.62) and merged; 03-M2 part A started.
- 2026-11-18: 03-M1 started in the core lane (plan 01 core done; 03-M0 store items answered on Linux).
- 2026-11-18: design files appeared (all areas blocked for owner review); format check now fails on the mock-up (O1). 03-M0 part A verified (notes read) and recorded.
- 2026-11-18: 03-M0 part A (reconciliation + core-only spike item 3) started in parallel with 01-M3.
- 2026-11-18: 01-M2 verified (same gates, same Node 26 caveat) and merged; 01-M3 started (no visible UI: picker titles come from callers, core state is only an event).

- 2026-11-18: 01-M1 verified (cargo fmt/clippy/test, contract drift, format, lint, tsc, npm test with the Node 26 caveat) and merged; 01-M2 started.
- 2026-11-18: 02-M0 verified (format check green, notes read); plan 02 now waits only on design 02-themes.
- 2026-11-18: 01-M0 verified (format check green, notes read); 01-M1 and 02-M0 started.
- 2026-11-18: file created; no design folder yet, so all UI work is blocked on design.
- 2026-11-18: owner answered the five open questions; decisions applied (see above). Orchestrator verified and committed them (af33d0252).
