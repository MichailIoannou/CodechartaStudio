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
| 01-M4.1 Renderer seam (desktop bridge port, fake) | renderer, no UI | done | — | feature/studio-01-m4 | bf7736960 (merged 7a539b1a8) |
| 01-M4.2 Desktop tools panel | UI | done | — | feature/studio-01-m4-2 | b832050a5 (merged caf24b63e) |
| 02-M0 Spike | spike | done | — | feature/studio-02-m0 | f0d4006c9 |
| 02-M1 Dark by default | UI | done | — | feature/studio-02-m1 | 5fadc0ca3 (merged db5d2dc60) |
| 02-M2 No-flash boot | UI | done | — | feature/studio-02-m2 | bcd46657d (merged 407d7551e) |
| 02-M3 Radial map and word cloud | UI | done | — | feature/studio-02-m3 | 45090be56 (merged 660082556) |
| 02-M4 Dependency graph, color-range diagram | UI | done | — | feature/studio-02-m4 | ddf7e6b7f (merged 2daeb8b08) |
| 02-M5 Editor schemes (quick toggle dropped, OD10) | UI | done | — | feature/studio-02-m5 | 057018bc9 (merged a0827d426) |
| 02-M6 Native window appearance | UI | done | — | feature/studio-02-m6 | b0e051814 (merged 7523f1965) |
| 03-M0 Spikes | spike | in progress (items 0, 3 done on Linux; 1, 2, 4 wait) | 01-M3 for items 1, 2, 4; owner hardware for item 3 on Windows | feature/studio-03-m0a | 0432ed0ad |
| 03-M1 Store core | core | done (Windows lock/rename paths not run) | — | feature/studio-03-m1 | 218bdffad (merged 2aedf471f) |
| 03-M2 Projects: core, RPC, CLI, shell, fake | core + shell | part A (tasks 1–7) verified, **merge pending**; part B todo | merge: uncommitted owner/designer edits to plan 03 in the main checkout; part B (tasks 8–9): 01-M4.1 | feature/studio-03-m2 | 168d4fa21 (verified, not merged) |
| 03-M3 Snapshots: core, RPC, CLI, shell | core + shell | part A (tasks 1–5) verified, **merge pending** (after 03-M2; resolve the add/add conflict on `03-m3-snapshots.md` with the branch's version); part B todo | merge: same as 03-M2; part B (task 6): 01-M4.1 | feature/studio-03-m3 | f93165d40 (verified, not merged) |
| 03-M4 Renderer load path | renderer | todo | 03-M3; check for visible parts first | — | — |
| 03-M5 Projects UI | UI | todo | 03-M4 | — | — |
| 03-M6 Import and store settings | UI | todo | 03-M5 | — | — |
| 03-M7 Local source and scenarios | UI | todo | 03-M6 | — | — |
| 04-M1 Core: fixtures, contract, runner, status, refs | core | verified, **merge pending** (contains 03-M2 + 03-M3; resolve add/add conflicts on progress files with the branch versions); fake-bridge seed todo | merge: as 03-M2; seed: 01-M4.1; git 2.31 spike: owner | feature/studio-04-m1 | 74c17fd76 (verified, not merged) |
| 04-M2 Core: log, details, queries, changed files | core | verified, **merge pending** (contains 03-M2, 03-M3, 04-M1; resolve add/add progress-file conflicts with the branch versions) | merge: as 03-M2 | feature/studio-04-m2 | ab90aaac3 (verified, not merged) |
| 04-M3 History view, branches pane, chip | UI | todo | 04-M2; plan 03 renderer (03-M4/M5) | — | — |
| 04-M4 Commit list with graph, filters, details | UI | todo | 04-M3 | — | — |
| 04-M5 Selection, keyboard, context menu, ports | UI | todo | 04-M4 | — | — |
| 04-M6 Read-only end-to-end and docs | UI | todo | 04-M5 | — | — |
| 04-M7 Operation queue, progress, prompts | core + UI | core half (tasks 1–4) verified, **merge pending** (top of the unmerged stack); task 5 todo | merge: as 03-M2; task 5 (UI): 04 History UI | feature/studio-04-m7 | e6f9e6a9b (verified, not merged) |
| 04-M8 Fetch and branches | core + UI | core (task 1) verified, **merge pending** (top of the unmerged stack); task 2 todo | merge: as 03-M2; task 2 (UI): 04 History UI | feature/studio-04-m8 | 3b4702f9d (verified, not merged) |
| 04-M9 Changes and diff | core + UI | core (task 1) verified, **merge pending** (top of the unmerged stack); task 2 todo | merge: as 03-M2; task 2 (UI): 04 History UI | feature/studio-04-m9 | e6b12bb6d (verified, not merged) |
| 04-M10 Commit | core + UI | core (task 1) verified, **merge pending** (top of the unmerged stack); task 2 todo | merge: as 03-M2; task 2 (UI): 04 History UI | feature/studio-04-m10 | a9b06d0fb (verified, not merged) |
| 04-M11 Pull, push, abort | core + UI | core (task 1) verified, **merge pending** (top of the unmerged stack); task 2 todo | merge: as 03-M2; task 2 (UI): 04 History UI | feature/studio-04-m11 | ed2e4764c (verified, not merged) |
| 04-M12 Workflow e2e, docs, stash | UI | todo | 04-M11 | — | — |
| 05-M0 Spikes on a real Windows machine | spike | done (Linux); Windows items W1–W5 open for owner | owner hardware (W1–W5) | feature/studio-05-m0 | 071cfd98a |
| 05-M1 Run one analysis from the core | core | verified, **merge pending** (top of the unmerged stack) | merge: as 03-M2 | feature/studio-05-m1 | a6eff44c7 (verified, not merged) |
| 05-M2 Snapshot records | core | verified, **merge pending** (top of the unmerged stack) | merge: as 03-M2 | feature/studio-05-m2 | 3eff64af5 (verified, not merged) |
| 05-M3 Queue, preflight, RPC, CLI | core (+ fake bridge) | tasks 1–4 verified, **merge pending** (top of the unmerged stack); task 5 todo | merge: as 03-M2; task 5 (fake bridge): core stack merge | feature/studio-05-m3 | b3b7a6164 (verified, not merged) |
| 05-M4 Analyse from the UI, browse snapshots | UI | todo | 05-M3; 04 UI | — | — |
| 05-M5 Nearest snapshot and stale notice | core + UI | in progress (core: task 1, task 2 without fake bridge; from feature/studio-05-m3) | UI tasks: core stack merge, 05-M4 | feature/studio-05-m5 | — |
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
