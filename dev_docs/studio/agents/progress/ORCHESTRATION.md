# Orchestration state

Single source of truth for which milestone of plans 01–06 is where. Updated and committed by the
orchestrator after every change of state. Another machine continues from this file alone.

## Branching

- **Current (since 2026-11-20): `feature/studio-next`** (worktree `.claude/worktrees/studio-stack`),
  branched from `feature/studio-analyses-compare`, the top of the six stacked branches the owner pushes
  (`docs/studio-plans` → `feature/studio-desktop-foundation` → `feature/studio-themes` →
  `feature/studio-projects` → `feature/studio-git-history` → `feature/studio-analyses-compare`; split from
  `Claude-Work` at 97e2df043, identical content, every gate verified by the orchestrator per branch). New
  milestones branch from `feature/studio-next` as `feature/studio-<plan>-<milestone>` and merge back into
  it after verification; it becomes the next PR(s) on top of the stack. `feature/studio-integration` and
  `feature/studio-stack` are history only. The notes below describe how the work got here.

- `feature/studio-integration` (local, branched from `main` at `96a239f00`) collects this file and
  every verified milestone. It is never pushed or merged into `main` without the owner.
- Each milestone runs on `feature/studio-<plan>-<milestone>` (e.g. `feature/studio-01-m1`), branched
  from the current tip of `feature/studio-integration`, and is merged back into it after verification.
- Spikes run on throwaway branches; only their progress file is kept.
- **`feature/studio-stack`** (worktree `.claude/worktrees/studio-stack`, created 2026-11-19) =
  `feature/studio-integration` + the verified core stack (`feature/studio-06-m5`, i.e. 03-M2 … 06-M5). It
  exists because the stack cannot be merged into integration while the main checkout holds uncommitted
  owner edits to plan 03. **UI milestones that need the plan 03–06 core branch from `feature/studio-stack`
  and merge back into it.** When the owner's edits are committed, merge `feature/studio-stack` into
  `feature/studio-integration` (fast path; resolve progress-file add/add conflicts with the stack's
  versions). Verified at 491068258: cargo fmt/clippy/test with and without features 833/837, cargo-deny,
  contract drift, format, lint, tsc, npm test 663/663, build, test:electron 45/45, e2e:desktop 10/10.
- **Parallel UI agents (owner request, 2026-11-19):** several agents may change `visualization/` at the
  same time, each in its own worktree on its own area, all branched from `feature/studio-stack`. The
  orchestrator merges them into the stack one at a time, resolves conflicts in shared files (nav bar,
  `VIEW_TABS`, `app.config.ts`, fake bridge, `CHANGELOG.md`) and re-runs every gate after each merge. This
  replaces the prompt's "at most one agent changing `visualization/`" rule for UI work.
- Builds: Rust output goes to a per-branch folder under the main checkout's `core/target` (e.g.
  `core/target/studio-05-m4`; the stack uses `core/target/stack`) via `CARGO_TARGET_DIR` — a single shared
  folder let one agent's smoke test run another branch's binary; never
  under `/tmp` (16 GB RAM tmpfs — filled once on 2026-11-19).

## Design gate

`dev_docs/studio/agents/design/STATUS.md` exists since 2026-11-18 (committed by the designer directly on
`feature/studio-integration`). Checked 2026-11-18 22:40: **every area is "ready"** (handed over in
5935e1ed6, last design commit 95606737e). UI milestones may start; the design files override the plans'
UI descriptions.

## Milestones

**2026-11-20:** every row below marked "merge pending", "verified, not merged" or "done on
`feature/studio-stack`" is now in the six stacked branches (see Branching) and verified there; web e2e of
04-M9/M10 and 06-M2/M3 passed on `feature/studio-analyses-compare` (195/195).

State: todo · blocked · in progress · done. "UI" = needs its design area to be ready (all ready since 2026-11-18 22:40).

| Milestone | Kind | State | Blocked on | Branch | Last verified commit |
|---|---|---|---|---|---|
| 01-M0 Spikes | spike | done (Linux); Windows/macOS items open for owner | owner hardware for S1/S2/S3/S4/S5 remainder | feature/studio-01-m0 | 977074f72 |
| 01-M1 Core skeleton, protocol, contract, CI | core | done | — | feature/studio-01-m1 | c6b3d9a7f (merged 8688edb53) |
| 01-M2 Process runner, tools, settings, doctor | core | done (Windows-only tests not yet run) | — | feature/studio-01-m2 | 5169e28c9 (merged a57c8e7e9) |
| 01-M3 Electron shell | shell | done (Windows/macOS and CI not run) | — | feature/studio-01-m3 | d8cdbfdfd (merged 1ce44fc54) |
| 01-M4.1 Renderer seam (desktop bridge port, fake) | renderer, no UI | done | — | feature/studio-01-m4 | bf7736960 (merged 7a539b1a8) |
| 01-M4.2 Desktop tools panel | UI | done | — | feature/studio-01-m4-2 | b832050a5 (merged caf24b63e) |
| 02-M0 Spike | spike | done | — | feature/studio-02-m0 | f0d4006c9 |
| 02-M1 Dark by default | UI | done | — | feature/studio-02-m1 | 5fadc0ca3 (merged db5d2dc60) |
| 02-M2 No-flash boot | UI | done | — | feature/studio-02-m2 | bcd46657d (merged 407d7551e) |
| 02-M3 Radial map and word cloud | UI | done | — | feature/studio-02-m3 | 45090be56 (merged 660082556) |
| 02-M4 Dependency graph, color-range diagram | UI | done | — | feature/studio-02-m4 | ddf7e6b7f (merged 2daeb8b08) |
| 02-M5 Editor schemes (quick toggle dropped, OD10) | UI | done | — | feature/studio-02-m5 | 057018bc9 (merged a0827d426) |
| 02-M6 Native window appearance | UI | done | — | feature/studio-02-m6 | b0e051814 (merged 7523f1965) |
| 02-M7 Metrics bar, file extension bar, toasts (OD6, OD7, OD8; new) | UI | done on `feature/studio-stack` (a965b437e; web e2e 188/188) | integration merge: as 03-M2 | feature/studio-02-m7 | fb2af451a |
| 03-M0 Spikes | spike | in progress (items 0, 3 done on Linux; 1, 2, 4 wait) | 01-M3 for items 1, 2, 4; owner hardware for item 3 on Windows | feature/studio-03-m0a | 0432ed0ad |
| 03-M1 Store core | core | done (Windows lock/rename paths not run) | — | feature/studio-03-m1 | 218bdffad (merged 2aedf471f) |
| 03-M2 Projects: core, RPC, CLI, shell, fake | core + shell | done on `feature/studio-stack` (part B via feature/studio-03-shell); integration merge pending | integration merge: owner's uncommitted plan 03 edit | feature/studio-03-m2, feature/studio-03-shell | 598d6ffd7 (merged into stack e8de7965e) |
| 03-M3 Snapshots: core, RPC, CLI, shell | core + shell | done on `feature/studio-stack` (task 6 via feature/studio-03-shell); integration merge pending | integration merge: as 03-M2 | feature/studio-03-m3, feature/studio-03-shell | 1b51a0bb3 (merged into stack e8de7965e) |
| 03-M4 Renderer load path | renderer | done on `feature/studio-stack`; integration merge pending | integration merge: as 03-M2 | feature/studio-03-m4 | ce4e78324 (merged into stack e041d661a) |
| 03-M5 Projects UI | UI | done on `feature/studio-stack`; integration merge pending | integration merge: as 03-M2 | feature/studio-03-m5 | 8c93d3f13 (merged into stack 10b8b4135) |
| 03-M6 Import and store settings | UI + core | done on `feature/studio-stack`; integration merge pending | integration merge: as 03-M2 | feature/studio-03-m6 | 0994d5f75 (merged into stack 1ebe30d2c) |
| 03-M7 Local source and scenarios | UI | done on `feature/studio-next` | — | feature/studio-03-m7 | b2fd355f3 (merged 113f918db) |
| 04-M1 Core: fixtures, contract, runner, status, refs | core | verified, **merge pending** (contains 03-M2 + 03-M3; resolve add/add conflicts on progress files with the branch versions); fake-bridge seed todo | merge: as 03-M2; seed: 01-M4.1; git 2.31 spike: owner | feature/studio-04-m1 | 74c17fd76 (verified, not merged) |
| 04-M2 Core: log, details, queries, changed files | core | verified, **merge pending** (contains 03-M2, 03-M3, 04-M1; resolve add/add progress-file conflicts with the branch versions) | merge: as 03-M2 | feature/studio-04-m2 | ab90aaac3 (verified, not merged) |
| 04-M3 History view, branches pane (chip replaced by W1) | UI | done on `feature/studio-stack`; integration merge pending | integration merge: as 03-M2 | feature/studio-04-m3 | 5877e3661 (merged into stack 14881e68f, fix 5b2462566) |
| 04-M4 Commit list with graph, filters, details | UI | done on `feature/studio-stack` (385adc20f; web e2e 176/176) | integration merge: as 03-M2 | feature/studio-04-m4 | 8642672fb |
| 04-M5 Selection, keyboard, context menu, ports (+ 05-M4 task 5 badges) | UI | done on `feature/studio-stack` (1b38f5819; web e2e 177/177) | integration merge: as 03-M2 | feature/studio-04-m5 | 9e5c3d35c |
| 04-M6 Read-only end-to-end and docs (+ 04 design follow-ups O8.3) | UI | done on `feature/studio-next` | — | feature/studio-04-m6 | ccaa94c42 (merged 3e78ab5ef) |
| 04-M7 Operation queue, progress, prompts | core + UI | core and task 5 done on `feature/studio-stack` (1ec7c9496; web e2e 185/185) | integration merge: as 03-M2 | feature/studio-04-m7 | e6f9e6a9b (verified, not merged) |
| 04-M8 Fetch and branches | core + UI | core and task 2 done on `feature/studio-stack` (1ec7c9496; web e2e 185/185) | integration merge: as 03-M2 | feature/studio-04-m8 | 3b4702f9d (verified, not merged) |
| 04-M9 Changes and diff | core + UI | core and task 2 merged into `feature/studio-stack`; **web e2e pending** (paused) | — | feature/studio-04-m9 | e6b12bb6d (verified, not merged) |
| 04-M10 Commit | core + UI | core and task 2 merged into `feature/studio-stack`; **web e2e pending** (paused) | — | feature/studio-04-m10 | a9b06d0fb (verified, not merged) |
| 04-M11 Pull, push, abort | core + UI | done on `feature/studio-next` (UI 116e4fedb) | — | feature/studio-04-m11-ui | merged e8e5bd3b0 |
| 04-M12 Workflow e2e, docs, stash | UI | done on `feature/studio-next` without stash (core has none) | stash: core support | feature/studio-04-m11-ui | merged e8e5bd3b0 |
| 05-M0 Spikes on a real Windows machine | spike | done (Linux); Windows items W1–W5 open for owner | owner hardware (W1–W5) | feature/studio-05-m0 | 071cfd98a |
| 05-M1 Run one analysis from the core | core | verified, **merge pending** (top of the unmerged stack) | merge: as 03-M2 | feature/studio-05-m1 | a6eff44c7 (verified, not merged) |
| 05-M2 Snapshot records | core | verified, **merge pending** (top of the unmerged stack) | merge: as 03-M2 | feature/studio-05-m2 | 3eff64af5 (verified, not merged) |
| 05-M3 Queue, preflight, RPC, CLI | core (+ fake bridge) | tasks 1–4 verified, **merge pending** (top of the unmerged stack); task 5 todo | merge: as 03-M2; task 5 (fake bridge): core stack merge | feature/studio-05-m3 | b3b7a6164 (verified, not merged) |
| 05-M4 Analyse from the UI, browse snapshots | UI | done on `feature/studio-stack` (8747e752b; web e2e 175/175); history badges (task 5) after 04-M4 | integration merge: as 03-M2 | — | — |
| 05-M5 Nearest snapshot and stale notice | core + UI | done on `feature/studio-stack` (UI web e2e 177/177) | integration merge: as 03-M2 | feature/studio-05-m5 | 52c6c9a88 (verified, not merged) |
| 05-M6 Batches, retention, cleanup | core + UI | done on `feature/studio-next` (UI with 05-M7) | — | feature/studio-05-m6-ui | 2ec7551bc (merged 7dd31b1e7) |
| 05-M7 E2E and docs | UI | done on `feature/studio-next` (with 05-M6 UI) | — | feature/studio-05-m6-ui | 2ec7551bc (merged 7dd31b1e7) |
| 06-M0 Spikes | spike | blocked | items 1–2: `gh`/`glab` not installed (owner); item 3: Windows; item 4: desktop build with projects (after 03 UI) | — | — |
| 06-M1 Compare core: commit vs commit | core + UI | done on `feature/studio-stack` (renderer web e2e 180/180) | integration merge: as 03-M2 | feature/studio-06-m1 | 698643e98 (verified, not merged) |
| 06-M2 Entry points (+ core tasks 1–2) | core + UI | done on `feature/studio-next` (open entries with 06-M4/M5 UI) | — | feature/studio-06-m4m5-ui | merged da931a47d |
| 06-M3 Missing snapshots and staleness | UI (no core tasks) | merged into `feature/studio-stack` with 06-M2; **web e2e pending** (paused) | — | feature/studio-06-m2m3 | 96232878b |
| 06-M4 Changed files | core + UI | done on `feature/studio-next` | — | feature/studio-06-m4m5-ui | c9e21dd84 (merged da931a47d) |
| 06-M5 PRs and merge requests | core + UI | core tasks 1, 4 and UI tasks 5–7 (number entry, C7 states) done on `feature/studio-next`; tasks 2, 3, 8 (listing) blocked | tasks 2, 3, 8: 06-M0 fixtures (gh/glab, owner) | feature/studio-06-m4m5-ui | merged da931a47d |
| 06-M6 Polish and stretch | core + UI | done on `feature/studio-next` (tasks 1–6; task 6 rename-aware delta, owner option 1) | — | feature/studio-06-m6 | 47f671da9 (merged f10ec41fc) |

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
- 04-M1 (see `04-M1-core-status-refs.md` on `feature/studio-04-m1`): git errors are new `ErrorCode`
  values (`GIT_TOO_OLD`, `NOT_A_REPOSITORY`, `DUBIOUS_OWNERSHIP`, `BARE_REPOSITORY`, `INDEX_LOCKED`,
  `PARSE_FAILED`, `COMMAND_FAILED`) with git's text in `details.detail` (overview section 10 wins over the
  plan's camelCase `GitErrorCode`); plan 04's runner is `git::GitCli` over a `git::GitProcess` port
  (`GitRunner` was taken by plan 03); unknown folder → `NOT_FOUND`, missing on disk → `FOLDER_UNAVAILABLE`;
  `TempRepo` extended in place. Git 2.31 spike open (no 2.31 binary obtainable without installing):
  run `src/git/parse/testdata/capture.sh` and the tests with git 2.31 first on `PATH`.
- 02-M1 (see `02-m1-dark-by-default.md`): followed the design over the plan for panel edges (Rider-style
  islands: 6 px gaps, 10 px corners, `shadow-lg`, no border) and the picker layout; no nav-bar toggle (OD10).
  `DB_VERSION` is 37 (renumber at merge if another plan takes it). Design items T4 (metrics bar refresh,
  OD6) and T5 (blended file extension bar, OD7) are outside M1 and still to schedule. Changelog says the
  Domain/Dependencies charts and radial layouts follow later (M3/M4).
- 01-M4.1 (see `01-m4-1-renderer-seam.md`): `createFakeDesktopBridge` carries `/* istanbul ignore next */`
  because coverage counters break the "rebuilt from its own source text" test (the fake is injected into
  Playwright pages as source). First coverage exclusion in `visualization/app`; owner decision
  2026-11-19: keep it (option 1). Later fakes may use the same single-function comment for the same reason.
  `shell.coreState` is typed locally (not in the generated contract). The fake's body must stay
  self-contained (no imports, no outer helpers, no async/await).
- 04-M2 (see `04-M2-core-log-details.md` on `feature/studio-04-m2`): `git.measureDistances` returns
  `GitCommitDistances`; line streaming built on the runner's chunk stream; ref names checked in-process;
  every sha to `show`/`diff-tree` is peeled with `^{commit}`; new codes `LOG_SESSION_EXPIRED`,
  `UNKNOWN_REVISION`. Acceptance: 100 006-commit repo, pages to offset 5000 in 417–451 ms, cached 3.4 ms.
  Mutating operations must call `GitMemory::forget_logs`, fetch must call `fetched`.
- 01-M4.2 (see `01-m4-2-desktop-tools.md`): followed the design over the plan (summary line; "Show" opens
  the data folder; core-state alerts replace the rows; skeletons, progress, failure alert, narrow layout).
  Wording the implementer had to supply is logged as O2 in `design/open-questions.md`. Not assigned to any
  milestone yet: app-wide core-offline / "Back online" toasts (D4, OD5, needs the toast slot of OD8/OD9),
  the "Open desktop tools" deep link (D5), the offline icon in the workspace status (W1); error toasts still
  auto-close (OD8 not built).
- Verification gap found 2026-11-19: earlier core milestones were verified with `--all-features` only
  (as CI does). `cargo clippy --all-targets -- -D warnings` without features fails on the unmerged stack
  (first seen on `feature/studio-04-m2`: unused imports in `codecharta-cored/tests/protocol.rs`; more in
  `askpass_mode.rs` on 04-M7). The integration tip is clean. Fix requested on `feature/studio-04-m7`
  (top of the stack); fixed in e6f9e6a9b. From now on core verification runs clippy and tests both with and without
  `--all-features`.
- 04-M7 core half (see `04-M7-queue-prompts.md` on `feature/studio-04-m7`): spike (f) corrected the plan
  (`LC_ALL` overrides `LC_MESSAGES`; mutating commands now drop `LC_ALL` and set the other categories);
  progress uses `core.progress`, prompts carry `requestId` (shell maps to operationId); new code
  `AUTHENTICATION_CANCELLED`; only `prompt.answer`/`prompt.cancel` renderer-callable; events
  `prompt.requested`/`prompt.closed`; test-only `core.credentialFill` behind `test-methods`. Socket
  folder 0700 / socket 0600 on Linux; Windows pipe items and `GetShortPathNameW` unverified.
- 04-M8 core (see `04-M8-fetch-branches.md` on `feature/studio-04-m8`): `git.switch`/`git.branchDelete`
  take a tagged `target`; remote delete is `push --progress --delete --end-of-options <remote> refs/heads/<b>`;
  create-with-checkout is one `switch -c`; `fetch_refspecs` adds `--no-tags --refmap= --no-write-fetch-head`
  so only `refs/codecharta/*` is written (D5), is not an RPC method, and refuses other destinations
  (checked). New codes `BRANCH_EXISTS`, `BRANCH_NOT_FULLY_MERGED`, `BRANCH_CHECKED_OUT_ELSEWHERE`,
  `LOCAL_CHANGES_WOULD_BE_OVERWRITTEN`, `OPERATION_IN_PROGRESS`, `AUTHENTICATION_REQUIRED`,
  `NETWORK_UNAVAILABLE`.
- 02-M3 (see `02-m3-radial-wordcloud.md`): radial folder swatches now computed in the components
  (memoised selectors could not follow a theme change); `DependencyGraphScreenshotService.exportBackground()`
  returns `null` until M4; `lowestContrastAlongGradient` added; `--wordCloudColor*` CSS variables removed.
  Dark tinted folders fade to a murky burgundy (as planned); a lighter `radial.tintTarget` is the knob if
  the owner dislikes it.
- 04-M9 core (see `04-M9-changes-diff.md` on `feature/studio-04-m9`): discarding a staged rename uses the
  fallback (restore old path, unstage new path, recycle it) because `restore --staged --worktree` deletes
  the new file for good; paths go to git on stdin (`--pathspec-from-file=- --pathspec-file-nul`);
  discard works per listed row and recycles, never deletes (checked: no direct file removal in `src/git/`);
  new code `CHANGED_SINCE_LISTED`; diffs over 4 MiB → `OUTPUT_TOO_LARGE`, 2 MiB shown.
- 04-M10 core (see `04-M10-commit.md` on `feature/studio-04-m10`): params type `GitCreateCommitParams`;
  message file in `<dataDir>/git-messages/`, `-c user.useConfigOnly=true commit --cleanup=whitespace -F`;
  preconditions from status counts; amend/cherry-pick/revert/bisect in progress → `OPERATION_IN_PROGRESS`;
  gpg failures → `COMMAND_FAILED`; new codes `IDENTITY_UNKNOWN`, `NOTHING_TO_COMMIT`, `HOOK_FAILED`,
  `CONFLICTS`. gpg signing and `commit-msg` hooks have no automated tests.
- 02-M4 (see `02-m4-dependency-graph.md`): `DependencyGraphComponent` reads `activeTheme()` in its render
  effect (ECharts `renderItem` reads colours lazily); `ChartScreenshotService.exportBackground()` inlined;
  `badgeContrastColor()` added; "level N" captions on level bands are faint in both themes (unchanged).
- 04-M11 core (see `04-M11-pull-push.md` on `feature/studio-04-m11`): force-with-lease names the destination
  ref (`refs/heads/<upstream branch or b>:<sha>`); pull refuses before git runs without upstream
  (`NO_UPSTREAM`), on a detached head or with an operation in progress; network output classified on
  stderr and stdout; ssh-agent hint added; checked: push never uses plain `--force`. Known gap: rebase
  pull with uncommitted changes fails as `COMMAND_FAILED` (no autostash). New codes `NOT_FAST_FORWARD`,
  `PUSH_REJECTED`, `NO_UPSTREAM`, `STALE_PUSH_LEASE`. Plan 04's core work is complete (M1, M2, M7–M11 cores).
- 05-M0 Linux (see `05-m0-spikes.md`): the plan's direct-java launch holds; exit 2 messages go to stderr
  (exit 1 to stdout); `meta.commitHash` absent; a non-sha `--commit` silently analyses HEAD (exit 0), so
  preflight must resolve the sha; a killed run leaves a `locked initializing` worktree that needs
  `git worktree remove -f -f`; progress must key on the `Files` unit only; pass
  `-Djava.io.tmpdir=<jobTempDir>`; keep `-Dstdout.encoding=UTF-8`; signal exits never map to
  `analysis-failed`; non-empty stderr is not a failure (JDK 27 reflection warnings). `gh` not installed.
- 02-M5 (see `02-m5-editor-schemes.md`): the JetBrains light scheme is `rider-day` / "Rider Day" (design),
  token values derived from Rider's own theme file — logged as O3 for confirmation. Registry order:
  cc-dark, cc-light, nord, one-dark, vs-dark, vs-light, darcula, rider-day. Plan corrections for
  `02-themes.md` (not applied because of the owner's uncommitted edit there): retitle M5 "Editor color
  schemes" and drop task 4; replace `intellij-light`/"IntelliJ Light" with `rider-day`/"Rider Day"; use the
  registry order above.
- 05-M1 (see `05-m1-run-analysis.md` on `feature/studio-05-m1`): `AnalysisErrorCode`/`JobError`/`JobProgress`
  in core-api with SCREAMING_SNAKE_CASE (added `CRASHED`, `OUTPUT_TOO_LARGE`); profile hash ignores
  `parallel`; progress follows only `Files` bars, hand-written parser; fake-ccsh is a binary inside
  `codecharta-core`; java-direct also used on unix (so `-Djava.io.tmpdir` applies). Real-ccsh scratch run:
  ccsh 2.4.0 + OpenJDK 27, exit 0, `<job>/afdb82c.map.cc.json.gz`, progress 0→50→99.
- 02-M6 (see `02-m6-native-appearance.md`): reused `setWindowBackground` and `DESKTOP_BRIDGE`; added a
  validated `setColorScheme` shell action (`nativeTheme.themeSource`, saved in `shell.json`, default dark)
  instead of the plan's `NATIVE_APPEARANCE` token; default window background `#1e2329`. **Plan 02 is
  complete** (pending owner/designer answers to O3).
- 05-M2 (see `05-m2-snapshot-records.md` on `feature/studio-05-m2`): extended 03-M3's `SnapshotRepository`
  (no parallel module); sweep also repairs `.replaced-*` and deletes `.failed-*` inside per-folder
  snapshot directories only (checked); `SnapshotSummary` gained `target`, `finishedAt`, `durationMs`,
  `notInMap`; `SnapshotId` accepts the overview's working-tree id form; `execute` returns
  `JobFailure::{Cancelled, Failed}`; `branchesAtRun` lists local branches only. No real ccsh through
  `execute` yet; `gh`/`glab` flags unverified (W5).
- 05-M3 core (see `05-m3-queue-rpc-cli.md` on `feature/studio-05-m3`): warnings as a separate
  `WarningCode` (`NOT_REPO_ROOT`, `SHALLOW_CLONE`, `LOW_DISK_SPACE`); `fs4` 1.1.0 for free disk space
  (cargo-deny passes); the queue is driven by its owner (`drive(&impl JobExecutor)`), no concurrency knob;
  liveness of a running job by a file lock on `job.lock`, not the pid; progress as its own
  `analysis.progress` event (a job outlives its request); `snapshots.changed` after `analysis.finished`;
  failed-job log has no RPC yet (add `analysis.readLog` api-first when the UI needs it). Real ccsh 2.4.0
  produced working-tree and commit snapshots via the CLI with no worktree left behind.
- 05-M5 core (see `05-m5-nearest-snapshot.md` on `feature/studio-05-m5`): `rev_list_with_parents` without
  `--date-order` (which forced a full walk: 368 ms vs 1.6 ms); resolutions carry reason codes; cache keyed by a
  fingerprint of the snapshot set (imports/moves/deletes emit no event). 100k commits: 8–704 ms first call,
  µs cached. `SnapshotResolution` kinds: `exact`, `nearest` (`ancestor`/`descendant`/`diverged`, `behind`,
  `ahead`), `latest` (reason), `none` (reason). Resolving never enqueues.
- 05-M6 core (see `05-m6-batches-retention.md` on `feature/studio-05-m6`): a failing recycle bin removes
  nothing and answers `RECYCLE_FAILED` (for every caller of the system recycler); permanent removal only
  with `permanently: true` (checked in code: user-facing deletes of snapshots, projects and folder snapshots
  recycle unless `permanently`; other direct removals are internal staging/failed/replaced leftovers).
  A forced re-analysis replaces its snapshot and deletes the old copy for good — asked as O4.
  Batch counts over 200 refused (`BAD_REQUEST`); tags take the newest 200 with `leftOut`; `prune` stops at
  the first failure; `delete` refuses a snapshot being written; `planPrune`/`prune` are per folder. New codes
  `SNAPSHOT_BEING_WRITTEN`, `RECYCLE_FAILED`. **Plan 05's core work is complete** (M1–M3, M5/M6 core halves).
- 06-M1 core (see `06-m1-compare-core.md` on `feature/studio-06-m1`): types in `methods/compare.rs`; the plan's
  `SnapshotRef` is `ComparedCommit`; no new git module (reuses plan 04) and one `SideLookup` trait; no new
  error codes; `staleBy` = `behind + ahead` for every relation; size limits 15 MB warn / 60 MB block are
  provisional (06-M0 item 4). `Revision` refuses short names, so branches/PRs need their own intent fields.
- 06-M4 core (see `06-m4-changed-files.md` on `feature/studio-06-m4`): reuses plan 04's name-status parsing;
  new `GitService::changed_paths` (`--relative`, no 5000-file cut); picks the first folder that has both
  commits; no new error code.
- Disk incident 2026-11-19: the disk filled (1.3 GB free) because every agent worktree built its own
  `core/target` (up to 15 GB each). Clean, fully committed agent worktrees were removed (branches kept) and
  remaining `core/target` dirs deleted: 139 GB free. From now on core agents use a shared `CARGO_TARGET_DIR`
  in the scratchpad, and verified worktrees are cleaned right away.
- 06-M5 core (see `06-m5-prs-core.md` on `feature/studio-06-m5`): `hosting.status`; queued
  `hosting.fetchChangeRequestHead` writes only `refs/codecharta/pr/<n>` (GitLab `mr/<n>`); `compare.resolve`
  gains a `changeRequest` intent (`alreadyMerged`, `baseMode: mergeBase`, `pullRequest` head label); a head
  not in the clone is the new error `HEAD_NOT_LOCAL`; a missing base branch is `UNKNOWN_REVISION` (the plan's
  base-branch fetch is not built); folder record gains an optional `hosting` override (cannot be cleared
  yet); new codes `REF_NOT_ON_REMOTE`, `HEAD_NOT_LOCAL`.
- 03-M2/M3 shell (see `03-m2-projects.md`, `03-m3-snapshots.md` on the stack): shell-composed methods go through
  `bridge.request(...)` (no new bridge keys): `projects.pickFolder`, `projects.readSourceFile`,
  `projects.revealFolder` (new name), `snapshots.pickImportFile` (filters from the caller: `json`, `gz`),
  `snapshots.readMapChunk` (≤ 32 MiB, realpath inside the store root). The relay runs composed methods
  before the allow-list; the composed set is exactly those five (checked) and shell-only core methods stay
  out of the allow-list (checked). Fake bridge gained an in-memory projects/snapshots backend. 03-M0 item 1
  (64 MiB IPC timing) still not run.
- 03-M4 (see `03-m4-renderer-load-path.md` on the stack): read/rename/checksum step in
  `load/services/projectSnapshotReader.ts`; `LoadFilesOptions` exported via the facade; `isFilesWriteDue`
  false only when every loaded map is a project map and nothing is persisted; `readSnapshotMap` kept for now.
  API for 03-M5: `loadProjectSnapshots`, `bootFromProject`, `showSampleFiles`, `unloadAllFiles`.
  One e2e flake ("Cluster explorer › should keep every rendered row the same height") seen only when run
  concurrently with the desktop smoke suite; passed when run alone.
- 03-M5 (see `03-m5-projects-ui.md` on the stack): followed the design over the plan — overview page at
  `#/project` (P3) instead of a home component; no folder selector (OD1), folders switch in P1; P1 replaces
  the upload button in the desktop app only; P6 has no Snapshots tab; dialog errors inline. Core:
  `ProjectSummary` carries folders and `updatedAt`. `FolderGitService` in the feature until area 04's
  `GitRepositoryService` exists. `readSnapshotMap` retired. Picker titles chosen by the implementer → O5.
  Left: 03-M6 (open/import P8, P11, Snapshots…), area 04 (sync, Open History), area 05 (W1 status,
  Analyse), reload after core reconnect (OD5).
- 03-M6 (see `03-m6-import-store.md` on the stack): `store.changeRoot` replaces plan 01's `paths.setStoreRoot`
  (copies or adopts; old store left in place; refused while analyses run); no relaunch (OD5: the core swaps the
  store live); drag and drop built after spike item 4 passed on Linux (`webUtils.getPathForFile` works in the
  sandboxed preload); dropped paths checked (absolute, cc.json ending, regular file, ≤ 4 GiB) and confirmed
  natively before inspection (checked); move dialog (P9) built without a host until area 05's snapshots dialog.
  Commit 27dd9d99d does not build alone (fixed in aa02ef516; interactive rebase unavailable). Wording supplied
  → O5 addendum.
- 04-M3 (see `04-M3-history-view.md` on the stack): History tab only when the active project has a git
  folder; `GitRepositoryService` follows the working folder and replaces 03-M5's `FolderGitService`;
  projects import git (not the reverse) — git reads projects through the `WORKING_FOLDER_SOURCE` port; no
  branch chip (W1), no Log/Changes tabs or sync button yet (M8/M9); merge/rebase banners wait for M11.
  Merge into the stack conflicted with 03-M6 in two projects components and the fake bridge — resolved by
  keeping both sides (03-M6's `OpenFileService`/`StoreFolderService`, 04-M3's `GitRepositoryService`; fake
  `git` store plus `commits` seed); an import-order slip in that resolution fixed in 5b2462566.
  Open for the owner/designer (in the progress Notes): "folder select" in the not-a-repository notice vs. the
  design's no-folder-select rule; "Open desktop tools" cannot jump to the section yet; `gitTooOld` version
  read from message text.
- 05-M4 (see `05-m4-analyse-ui.md` on the stack): W1 workspace status (`features/workspaceStatus`) replaces the
  jobs indicator and branch chip; snapshots dialog (S4) hosts the move/bind dialog (P9); log dialog (S9) via the
  new core method `analysis.readLog`; fake bridge analysis handlers (05-M3 task 5). Not built: the loaded-snapshot
  registry (task 2; `shownSnapshot` already covers it with one working folder), the "other profile" flag (no
  profile hash in the renderer), W1's "Show commit…/Show current checkout/Analyse <short>" (05-M5, area 06),
  history badges (task 5, after 04-M4), entry points on the overview (would create a projects→snapshots cycle).
  Merge into the stack conflicted with 04-M3 (05-M4 still used `FolderGitService`): ported the snapshots dialog
  and W1 to `GitRepositoryService`, kept 04-M3's fake `git` handlers plus 05-M4's analysis handlers, removed a
  duplicated `activeProject`/`workingFolder` in `projectsFacade.ts`.
- 04-M4 (see `04-M4-commit-list.md` on the stack): 100 000 commits — first rows 146 ms, page median 33 ms,
  scroll frames median 16.6 ms, 35 rows in the DOM. Design over plan: lanes join at the fork dot; filters in the
  COMMITS pane header (`commitFilters`), no folder picker (OD1); uncommitted changes as a dashed lane into HEAD.
  Design gaps left open (no invented wording): committer line label, "Open changes" (no Changes tab yet), git's
  `unknown` change kind, analysing without percent. cc-light contrast notes (two blue lanes, faint selection)
  left to the designer. Merge conflict in the fake bridge with 05-M4: kept both sides' handlers.
- 05-M5 UI (see `05-m5-nearest-snapshot.md` on the stack): the stale notice is a persistent toast projected into
  `cc-toast` (OD9), over the map views only; the plan's snapshot chip became W1 changes (staleness badge,
  "Asked for", "Show current checkout", "Analyse <short>"); the map follows the design's table and replaces
  05-M4's "last asked analysis switches the map". Follow-up bug (not assigned): a folder without a remembered
  snapshot can load twice (newest snapshot, then the resolved one). For 02-M7: keep `<ng-content />` first in
  the toast `<output>` and the notice projected inside `<cc-toast>`.
- 04-M5 (see `04-M5-selection-menu-ports.md` on the stack): `CommitAction.label` Title Case + optional
  `detailsLabel`; second selection gets the left primary border; analysed markers with job states winning over
  snapshots; map locator reads `shownSnapshot` instead of a file-name registry; Check Out / New Branch arrive with
  04-M8. Plan 06 needs a disabled state on `CommitAction` (C1: disabled "Compare with Parent" for a root commit).
  CHANGELOG conflict with 05-M5 resolved by keeping 04-M5's broader "Analyses in the app" entry plus "Nearest
  analysis".
- Weekly budget 79% at 2026-11-19 13:08 (resets 2026-11-20 13:00): one agent per related group of tasks from now
  on (e.g. 04-M7 task 5 + 04-M8 task 2 + the "Show in map" action in one agent).
- 06-M1 renderer (see `06-m1-compare-core.md` on the stack): no `cc-compare-button` — the Compare tab opens the
  dialog in a desktop project with a git folder; chip with clickable sides, swap and a caret menu; workspace status
  shrinks to icon-only beside the chip; legend caption "Δ = head … − base …". The M1 dialog sends the `commits`
  intent, so the core orders the sides (M2's ref picker + `explicit` intent fixes "Base stays base"). Gap against
  the owner decision until M3: "Use nearest" offered but not "Analyse missing". Designer finding: at 1280 px the
  base/head captions still show and branch names truncate first.
- 04-M7/M8 renderer (see `04-M7-M8-ui-prompts-fetch-branches.md` on the stack): shell fix — `main.js` now maps
  `prompt.requested.requestId` to the caller's operation id (`shellPolicy.pageNotificationOf`; a prompt without an
  operation id is passed on with `requestId: null` instead of being dropped); one `cc-sync-button` (OD3), fetch
  only until M11; fetch progress in W1 ahead of a running analysis; failures are error toasts that stay until
  dismissed (shared `ToastService` change — overlaps 02-M7/OD8, reconcile when 02-M7 merges); Show in map only
  when the folder has an analysis; confirm and branch dialogs hosted in the History panel. Security tests: the
  answer never reaches console/HTML/state, input cleared before sending, sent once, Cancel/Escape send
  `prompt.cancel`. Wording supplied by the implementer: branch-menu icons, reused hints, "Upstream" label.
- Owner answers 2026-11-19 (`design/open-questions.md`, uncommitted owner edits in the main checkout at the time):
  O2 (picker title "Choose <tool>"; "Custom path not found: <path>"; keep "Programs" and the generic failure
  toast; light summary contrast unchanged), O3 (keep Rider Day values; Darcula and VS Dark get their own neutral
  graph palettes), O4 (recycle-bin failure → persistent error toast, no "Delete permanently"; forced re-analysis
  replace accepted; clean-up for the working folder only), O5 (keep "Add folder"/"Re-link"; truncation OK; keep
  import wording; remove the 4 GiB drop limit; cancelling "Look for commit… in another folder" removes the
  just-created project), O6 (keep the Dependencies Legend tool; legend above the bar stands), O7 (option A).
  Applied in: 02-M7 (O6/O7), `feature/studio-fixes-owner-answers` (O2, O3, O5 — merged into the stack, web e2e
  done on the stack, web e2e 185/185), 05-M6 renderer later (O4). Drop safeguards after removing the size limit: absolute `.cc.json(.gz)`
  path, regular file, native confirmation (checked).
  Designer follow-ups named in the answers: T4 in `02-themes.md`, `05-snapshots.md` (recycle failure state,
  working-folder clean-up), `03-projects.md` (cancel removes the project).
- 02-M7 option A (see `02-m7-metrics-bar.md`): panels publish `--cc-bar-inset-left/right`; bars centre between them,
  min 30rem, slide over 300 ms; cells shrink and truncate; layout name icon-only below 1280 px; #4557's test now
  asserts centring in the free space. **Known limit (for the designer, to be added to `open-questions.md` once the
  owner's pending edits there are committed):** at ~900 px with both panels open only 236 px are free; the bar stops
  at 30rem and its right part (tools incl. Legend) lies under the inspector until it closes; Layout and metric cells
  stay reachable. Options: a compact bar mode, or a z-order change.
- 04-M9/M10 renderer (see `04-M9-M10-ui-changes-commit.md` on the stack): worded badges, Log/Changes tabs in the
  toolbar, commit box at the bottom of the changes panel, Discard only on unstaged/untracked rows, diff always
  virtualised, >1000 paths sent in chunks under one operation id; "Open changes" link added. Design gaps:
  identity commands as plain lines in a toast (H6 wants copy blocks); `CONFLICTS`/`OUTPUT_TOO_LARGE` fall back to
  "Git failed: …"; the mock-up has no Changes tab. Merged cleanly.
- 06-M2/M3 (see `06-m2-m3-entry-points-missing.md` on the stack): core branch and explicit intents; ref picker in
  `features/gitHistory`; `explicit` intent keeps Base as base; base mode remembered per project; History Compare
  entries incl. disabled Compare with Parent via the new `disabledReasonFor?`; `BRANCH_ACTIONS` port (branch-menu
  entries appear once rendered); Pull requests segment left out (no `hosting.list*`, no design state). Merge
  conflict in the shared `contextMenuItem`: 04-M7/M8's `disabled` (real `disabled` attribute) and 06's
  `disabledReason` (`aria-disabled` + title) both kept (8a409bed3).

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

None open.

Design questions are in `design/open-questions.md`.

## Session log

- 2026-11-22: development resumed for the owner follow-ups on nav bar fit and metrics bar fit (principles §3, P1, W1, C2, T4; mock-up `nav-and-bar-fit.html`); designer commits merged (7dbc02134); agent on `feature/studio-nav-and-bar-fit`.
- 2026-11-22: compact metrics bar verified and fast-forwarded into `feature/studio-next` (ed5d9c48b): cell icons on the settings buttons, Scenarios bookmark menu, `cc-metric-glyph` (in shared, to avoid a feature cycle), compact two-row bar below 30rem / back at 32rem; the 02-panels-give-way behaviour reverted (strip, selection dot, dependency inspector strip). Gates at ed5d9c48b: format, quality gate 0 errors (46 warnings), npm test 823/823 (6691), lint, tsc, electron, build, e2e desktop 20/20, web 230/230. Designer follow-ups appended as O13. Development paused again.
- 2026-11-22: development resumed for the designer's compact metrics bar (02-themes T4 "Cell icon instead of the cog" and "T4 compact bar", owner answer to question 12, question 15 default); designer commits merged (0d8a370ca); agent on `feature/studio-compact-metrics-bar`, which also removes the 02-panels-give-way behaviour.
- 2026-11-22, **paused by the owner** after this round. Merged the O11 tweaks. Final gates at fe460f811, all
  green: format, quality gate 0 errors (46 warnings), npm test 815/815 (6662), lint, tsc, cargo fmt/clippy and
  tests with and without features (870 / 866), contract drift, test:electron, build, e2e:desktop 20/20, web
  e2e 231/231. No agents running. Open for the owner/designer: O12 (strip button side, view-switcher vs chip
  z-order, window-control button hiding/left placement and reset, P12 modal, rename-delta edge cases);
  owner items: gh/glab-based PR listing (06-M5 tasks 2, 3, 8), Windows/macOS checks (spikes, window controls),
  stash (needs core support). The six stacked PR branches are fixed by the separate CI session;
  `feature/studio-next` holds all their fixes and becomes the next PR(s) on top of the stack.

- 2026-11-22: gates at 70801aae9 green (quality gate 0 errors, npm test 813/813 (6642), build, test:electron,
  e2e:desktop 20/20, web e2e 228/228). Merged the projects/snapshots follow-ups (P12 re-link from the source
  view, state line, S4/S8 wording) and the rename-aware delta (06-M6 task 6, transient `fileRenames` slice,
  only `DeltaGenerator` does the arithmetic). Questions added to O12 (items 3, 4). O11 tweaks agent running.

- 2026-11-22: merged the panels follow-ups (dependency view gives way, inspector strip with a dot, D2 offline
  focus) and the window controls (D6/D7: "Use CodeCharta's title bar", Breeze buttons on Linux,
  `titleBarOverlay` on Windows, `hiddenInset` on macOS; verified on KDE Wayland: shadow, edge resize,
  double-click, right-click menu; Windows/macOS not checked). Agent-reported gates: quality gate 0 errors,
  npm test 810 suites (6608), test:electron 116, e2e:desktop 20, web e2e 226. Designer questions as O12.
  Projects/snapshots agent running; renames and O11 tweaks queued.

- 2026-11-22: gates at 49a602cdc all green — quality gate 0 errors (first time), npm test 807/807 (6578),
  cargo 870/866, contract, test:electron, build, e2e:desktop 19/19, web e2e 224/224. Designer delivered O10
  (D6 setting, D7 window controls, `mockups/window-controls.html`) and answered O11; merged (18b8f88cd).
  Window-controls agent started; panels agent resumed (merge next + the O11 z-order bug). Queued, one at a
  time for CPU: projects/snapshots agent, renames agent, and the O11 history/compare tweaks (Pull stays
  enabled, branch menu holds Push/Force/Publish during a merge, "renamed" once).

- 2026-11-22: the machine rebooted (wiped `/tmp`: Playwright browsers, sample repo, scripts); Chromium 1243 now in
  `~/.cache/ms-playwright`; sample repo rebuilt durably at `/home/mike/Programming/sample-shop` as project "Sample
  Shop". Merged the stack's gate and CI fixes (fake bridge split, service splits, Windows store fix), the 3D map
  depth fix (upstream bug: `lowp` shader precision on GPUs that honour it), the history and compare follow-ups,
  and removed the default Electron menu bar. Owner asked to lighten CPU: panels, projects/snapshots and renames
  agents paused; gates now run one at a time. Owner request O10 (hide native window decorations, own window
  controls) waits for design ("designer first"); O11 holds the latest follow-up questions.

- 2026-11-21: merged the CI fixes of the stack (smoke tests with software WebGL, Windows path in a core test,
  gate config for `*.test.js`; gates at f391e393a all green incl. cargo 870/866, web e2e 220/220), the
  SonarCloud skip without token, and the designer's answers to O9 (ad536f668 on `docs/studio-plans`). The owner
  added the quality gate (`ccsh gate visualization`, as CI runs it) to the checks in `CLAUDE.md`; it fails on
  `feature/studio-next` with 14 errors in 13 files. Started six agents: rename-aware delta (06-M6 task 6, owner
  approved option 1, renamed files keep the "changed" colour); fake bridge split; compare gate + C2 revision 2
  and O9.5/O9.8; history gate + O9.2/O9.6/O9.7; projects/snapshots gate + O9.3/O9.4; panels/charts gate + O9.1.

- 2026-11-21: merged 06-M6. Gates at f10ec41fc: cargo fmt, clippy and tests with and without features
  (870 / 866), contract drift, format, lint, tsc, npm test 802/802 (6544 tests), build, test:electron,
  e2e:desktop 18/18, web e2e 220/220. Designer questions added to O9 (item 8). Owner decision needed:
  rename-aware delta plan (`progress/06-m6-rename-aware-delta-plan.md`). No agents running.

- 2026-11-21: merged the H5 sync-button placements (workspace status, project overview; git dialogs hosted
  once in the app shell). Gates at b0372ec10: format, lint, tsc, npm test 798/798 (6509 tests), build,
  test:electron, e2e:desktop 18/18, web e2e 218/218. Designer questions added to O9 (item 7). The owner pushed
  the six stacked branches; their CI failures (desktop smoke timing, core tests on macOS and Windows) are
  fixed in a separate session, whose fixes `feature/studio-next` must take before it becomes a PR. 06-M6 running.

- 2026-11-21: merged 06-M4/M5 UI (+ 06-M2 open entries, C2) with an orchestrator fix: compare opens the desktop
  tools through the shared `GlobalConfigurationOpener` instead of a second dialog (7ff85ace5 and its test update); then
  04-M11 UI + 04-M12. Gates at e8e5bd3b0: format, lint, tsc, npm test 797/797 (6504 tests), build,
  test:electron, e2e:desktop 18/18, web e2e 215/215. Designer questions added to O9 (items 5, 6). Started
  06-M6 and the H5 sync-button placements (workspace status, project overview).

- 2026-11-20: merged 03-M7 (gates at 1153cdf13: format, lint, tsc, npm test 768/768, build, test:electron
  80/80, e2e:desktop 16/16, web e2e 196/196), then 02 side panels give way + 01 D2 deep link, 04-M6 + 04
  follow-ups and 05-M6 UI + 05-M7 (conflicts in the History view, its e2e, the desktop smoke test and the
  changelog resolved by keeping both sides). Gates at 7dd31b1e7: format, lint, tsc, npm test 778/778
  (6312 tests), build, test:electron, e2e:desktop 18/18, web e2e 207/207. Designer questions logged as O9.
  04-M11 UI + 04-M12 started from `feature/studio-04-m6`; 06-M4/M5 UI still running.

- 2026-11-20: owner resumed development. Six stacked branches built from `Claude-Work` and verified per
  branch by the orchestrator (format, lint, tsc, npm test, cargo fmt/clippy/test with and without
  features, contract drift, test:electron, build, e2e:desktop, web e2e:ci; only failure: main's
  `urlExtractor.spec.ts` on Node 26 on `docs/studio-plans`, fixed in the next branch). Created
  `feature/studio-next`. Started five UI agents in parallel: 04-M6 + 04 design follow-ups; 05-M6 UI + 05-M7;
  06-M4/M5 UI + 06-M2 open entries + compare follow-ups; 02 T4 "side panels give way" + 01 D2 deep link;
  03-M7. 04-M11 UI waits for the 04 follow-ups (same files).

- 2026-11-19, **paused by the owner**: 04-M9/M10 renderer and 06-M2/M3 merged into `feature/studio-stack`;
  gates on the final stack (8a409bed3): cargo fmt/clippy/test with and without features 853/857, contract drift,
  format, tsc, lint, npm test 766/766, build, test:electron 80/80, e2e:desktop 16/16. **Not yet run: web e2e:ci on
  the final stack** — run it first when resuming. For the owner: a sample repository (scratchpad `sample-shop`,
  built from `sample-projects/`, with a merged feature branch, a tag `v1.0` and one uncommitted change) was added
  as project "sample shop" to the real store (`~/.config/codecharta-visualization`) with two analyses (ec16692,
  c96efe2), and the current stack build was launched with the real ccsh. Remaining when resuming: 04-M6, 04-M11
  renderer, 04-M12; 05-M6 renderer (with O4 answers) and 05-M7; 06-M4/M5 renderer, 06-M6; 03-M7; integration merge of
  `feature/studio-stack` once the owner's plan edits are committed; design follow-ups (900 px bar limit, O-answers
  needing design edits).
- 2026-11-19: O2/O3/O5 fixes passed web e2e 185/185 on the stack. 02-M7 merged; the toast conflict resolved as 02-M7's positioned container with the stack's `<ng-content />` (stale notice) first, both sides' specs kept (one missing brace fixed); gates: format, tsc, lint, npm test 752/752, build, test:electron 80/80, e2e:desktop 16/16; web e2e running.
- 2026-11-19: fixes for O2/O3/O5 merged cleanly into the stack; gates: format, tsc, lint, npm test 749/749, build, test:electron 80/80, e2e:desktop 16/16; web e2e running. 02-M7 resumed to commit its option-A work.
- 2026-11-19: owner answered O2–O7; resumed 02-M7 for option A, started a Sonnet fixes agent for O2/O3/O5. Closed the old CodeCharta window (opened by the orchestrator) and launched the current stack build with the real ccsh on PATH for the owner.
- 2026-11-19: 04-M7/M8 renderer passed web e2e 185/185 on the stack. Weekly usage 83%: started the last agent before the reset (04-M9/M10 renderer: changes, diff, commit); no new agents until the weekly reset (2026-11-20 13:00) apart from fixes.
- 2026-11-19: 04-M7/M8 renderer merged into the stack (fake-bridge conflict resolved); gates: format, tsc, lint, npm test 749/749, build, test:electron 79/79, e2e:desktop 16/16; full web e2e running (the agent's last full run had 185/186 before its fix).
- 2026-11-19: 06-M1 renderer merged cleanly into the stack; gates: format, tsc, lint, npm test 739/739, build, test:electron 76/76, e2e:desktop 16/16; web e2e running. 06-M2+M3 started as one agent (weekly 80%).
- 2026-11-19: 04-M5 merged into the stack (CHANGELOG conflict resolved); gates: format, tsc, lint, npm test 730/730, build, test:electron 76/76, e2e:desktop 16/16; web e2e running. Renderer of 04-M7 task 5 + 04-M8 task 2 + Show in map started in parallel with the 06-M1 renderer.
- 2026-11-19: 05-M5 UI merged cleanly into the stack; gates: format, tsc, lint, npm test 722/722, build, test:electron 76/76, e2e:desktop 16/16; web e2e running. 06-M1 renderer started in parallel (5-hour 72%, weekly 77%).
- 2026-11-19: 04-M4 merged into the stack (fake-bridge conflict resolved); gates on the merged stack: format, lint, tsc, npm test 720/720, build, test:electron 76/76, e2e:desktop 16/16; web e2e running. 04-M5 (+ history badges) started in parallel with the 05-M5 UI.
- 2026-11-19: 05-M4 merged into the stack with conflicts resolved and ported; gates on the merged stack: cargo with and without features 844/848, contract drift, format, lint, tsc, npm test 708/708, build, test:electron 76/76, e2e:desktop 16/16; web e2e running. 05-M5 UI started in parallel (weekly usage 75%: two UI agents at a time).
- 2026-11-19: 04-M3 stack merge passed web e2e 173/173 — done on the stack. 02-M7 held: its wider bar sits under the open explorer (Layout cell unreachable by mouse at 1920 px); the agent had switched the e2e page object to keyboard, which hides it. Fixing needs a design change (T4 and upstream PR #4557 keep the bar centred on the window) — asked as O7.
- 2026-11-19: 04-M3 merged into the stack with conflicts resolved; gates on the merged stack: format (after an import-order fix), lint, tsc, npm test 698/698, build, test:electron 76/76, e2e:desktop 16/16; web e2e running. 04-M4 started in parallel.
- 2026-11-19: 03-M6 verified on `feature/studio-stack` (cargo with and without features 843/847, cargo-deny, contract drift, format, lint, tsc, npm test 686/686, build, test:electron 76/76, e2e:desktop 16/16; web e2e running on port 9031). 05-M4 started in parallel; running agents told to use per-branch cargo folders and their own e2e port.
- 2026-11-19: owner asked for UI agents in parallel. Started 04-M3 (History view) and the new 02-M7 (metrics bar, file extension bar, toasts) alongside 03-M6, three UI agents at once, each on its own branch from the stack.
- 2026-11-19: 03-M5 verified on `feature/studio-stack` (cargo with and without features 834/838, contract drift, format, lint, tsc, npm test 681/681, build, test:electron 69/69, e2e:desktop 14/14, web e2e:ci 169/169). Screenshots sent to the owner. 03-M6 started.
- 2026-11-19: 03-M4 verified on `feature/studio-stack` (format, lint, tsc, npm test 664/664, build, test:electron 70/70, e2e:desktop 14/14, web e2e:ci run alone 165/165) and merged into the stack. 03-M5 started.
- 2026-11-19: 03-M2/M3 shell and fake bridge verified on `feature/studio-stack` (format, lint, tsc, contract drift, npm test 663/663, build, test:electron 70/70, e2e:desktop 14/14, web e2e:ci 165/165) and merged into the stack. 03-M4 started from the stack.
- 2026-11-19: owner asked why no custom UI was being built in parallel. Orchestrator error: UI agents were
  only allowed to start from `feature/studio-integration`, which lacked the unmerged core stack. Fixed by
  creating `feature/studio-stack` (verified, see Branching) and starting the UI lane from it. `/tmp` (tmpfs)
  filled from the shared cargo target in the scratchpad; moved to `core/target` on disk.
- 2026-11-19, end of session: 06-M5 core verified on a scratch merge (clippy and cargo test with and without
  features: 833/837, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). **No allowed work
  remains**: every core-only task that can run on Linux without `gh`/`glab` is verified, and every UI
  milestone left needs the core stack in the integration branch.
  - Unmerged verified core stack (merge in this order, or just `feature/studio-06-m5`, which contains all of
    them; resolve add/add conflicts on progress files with the branch versions): 03-M2, 03-M3, 04-M1, 04-M2,
    04-M7 core, 04-M8 core, 04-M9 core, 04-M10 core, 04-M11 core, 05-M1, 05-M2, 05-M3 core, 05-M5 core,
    05-M6 core, 06-M1 core, 06-M4 core, 06-M5 core. Blocked only by the owner's uncommitted edit to
    `03-projects-and-managed-store.md` in the main checkout (03-M2 edits the same file).
  - After the merge: re-run all gates on integration (incl. build, e2e:ci, e2e:desktop), then the UI lane can
    run 03-M2/M3 part B, 03-M4..M7, 04-M3..M6 and the UI halves of 04-M7..M11, 05-M4..M7, 06-M1..M6, and the
    fake-bridge tasks (04-M1 seed, 05-M3 task 5, 05-M5 task 2).
- 2026-11-19: disk full; cleaned agent worktrees (139 GB free). 06-M4 core verified on a scratch merge (clippy and cargo test with and without features: 800/804, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). 06-M5 core tasks 1 and 4 started.
- 2026-11-19: 06-M1 core verified on a scratch merge (clippy and cargo test with and without features: 789/793, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). 06-M3 has no core tasks. 06-M4 core started.
- 2026-11-19: 06-M0 recorded as blocked (no gh/glab, Windows, needs projects UI); 06-M1 core tasks 1–3 started with provisional size limits.
- 2026-11-19: 05-M6 core verified on a scratch merge (clippy and cargo test with and without features: 766/770, cargo-deny, contract drift, format, lint, tsc, npm test 663/663); deletion paths read in code. Plan 05 core complete. Design question O4 logged.
- 2026-11-19: 05-M5 core verified on a scratch merge (clippy and cargo test with and without features: 747/751, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). 05-M6 core started.
- 2026-11-19: 05-M3 core verified on a scratch merge (clippy and cargo test with and without features: 724/728, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). After the reset (5%), 05-M5 core started.
- 2026-11-19: 05-M2 verified on a scratch merge (clippy and cargo test with and without features: 682/686, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). 05-M3 tasks 1–4 started.
- 2026-11-19: 02-M6 verified on the merged integration branch in a scratch worktree (format, lint, tsc, npm test 663/663, build, test:electron 45/45, e2e:desktop 10/10, web e2e:ci 165/165). Plan 02 complete. The visualization lane now has no allowed work until the core stack (03-M2…05-M1) is merged into integration.
- 2026-11-19: 05-M1 verified on a scratch merge (clippy and cargo test with and without features: 642/646, cargo-deny, contract drift, format, lint, tsc, npm test 663/663). 02-M6 merged; web e2e running. 05-M2 started.
- 2026-11-19: 02-M5 verified on the merged integration branch in a scratch worktree (format, lint, tsc, npm test 663/663, build, test:electron 42/42, e2e:desktop 10/10, web e2e:ci 165/165). 02-M6 started (reusing the shell's `setWindowBackground`).
- 2026-11-19: 05-M0 Linux spikes recorded; 02-M5 merged, web e2e running; 05-M1 started from feature/studio-04-m11.
- 2026-11-19: 04-M11 core verified on a scratch merge (clippy and cargo test with and without features: 578/582, cargo-deny, contract drift, format, lint, tsc, npm test 661/661). Plan 04 core complete. 05-M0 Linux spikes started.
- 2026-11-19: 02-M4 verified on the merged integration branch in a scratch worktree (format, lint, tsc, npm test 661/661, build, test:electron 42/42, e2e:desktop 10/10, web e2e:ci 157/157). 02-M5 started without the quick toggle (OD10).
- 2026-11-19: 04-M10 core verified on a scratch merge (clippy and cargo test with and without features: 557/561, cargo-deny, contract drift, format, lint, tsc, npm test 661/661). 02-M4 merged; web e2e running. 04-M11 core started.
- 2026-11-19: 04-M9 core verified on a scratch merge (clippy and cargo test with and without features: 538/542, cargo-deny, contract drift, format, lint, tsc, npm test 659/659). 04-M10 core started.
- 2026-11-19: 02-M3 verified on the merged integration branch in a scratch worktree (format, lint, tsc, npm test 659/659, build, test:electron 42/42, e2e:desktop 10/10, web e2e:ci 157/157). 02-M4 started.
- 2026-11-19: 04-M8 core verified on a scratch merge (clippy and cargo test with and without features: 502/506, cargo-deny, contract drift, format, lint, tsc, npm test 659/659). 02-M3 merged; its web e2e is running. 04-M9 core started.
- 2026-11-19: 04-M7 core half verified after the fix on a scratch merge (clippy and cargo test with and without features: 471/475, cargo-deny, contract drift, format, lint, tsc, test:electron 42/42, npm test 658/658). 04-M8 core started.
- 2026-11-19: 02-M2 verified on the merged integration branch in a scratch worktree (owner was running the app from the main checkout): format, lint, tsc, npm test 658/658, build, test:electron 42/42, e2e:desktop 10/10, web e2e:ci 156/156. 04-M7 core half sent back: featureless clippy fails (see deviations).
- 2026-11-19: 01-M4.2 verified on the merged integration branch (format, lint, tsc, npm test 657/657, coverage 96.86/90.3/95.46/96.79, build, test:electron 42/42, e2e:desktop 10/10, web e2e:ci 155/155) — plan 01 complete except owner-hardware items. 04-M2 verified (merge pending). 04-M7 core half and 02-M2 started.
- 2026-11-19: owner kept the istanbul-ignore comment on the test fake (option 1).
- 2026-11-19: 01-M4.1 verified on the merged integration branch (format, lint, tsc, npm test 654/654, coverage 96.87/90.26/95.44/96.8) and merged; 01-M4.2 started.
- 2026-11-19: 02-M1 verified on the merged integration branch (format, lint, tsc, npm test 649/649 with 43 snapshots unchanged, coverage 96.84/90.24/95.43/96.77, build, test:electron 42/42, e2e:desktop 9/9, web e2e:ci 153/153) and merged. After the usage reset (3%): 01-M4.1 and 04-M2 started.
- 2026-11-19: 04-M1 verified on a scratch merge of integration + 04-M1 (cargo fmt/clippy/test 354, cargo-deny, contract drift, format, lint, tsc, test:electron 42/42, npm test 636/636). Merge pending, as for 03-M2.
- 2026-11-18 23:50: 04-M1 started in the core lane at the owner's request (5-hour usage 87%, reset at 00:10).
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
