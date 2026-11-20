---
name: 05-M4 analyse from the UI and browse snapshots
state: complete
version: 1
---

## Goal

Analyse the current checkout or a commit from the desktop app, see progress, and list, open and re-open
snapshots — the step that makes maps appear in projects (plan 05, Milestones, M4).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M4, **adjusted to the design**, which
overrides the plan's UI: `design/05-snapshots.md` (W1 workspace status in the nav bar map slot — it absorbs
the plan's `cc-analysis-jobs-indicator` (S3 merged into W1) and the branch chip (H2); S4 snapshots dialog;
S5 analyse actions; S6 preflight problems; S9 analysis log dialog; read "Deviations from the plan"),
`design/00-design-principles.md`, `design/journeys.md`, `design/owner-decisions.md` (OD5 core offline, OD8
toasts top right, OD9 stale notice is a persistent toast — the notice itself is 05-M5), mock-up
`design/mockups/studio-screens.html`. Branched from `feature/studio-stack` (05-M3 core, 03-M5 projects UI,
03-M6 open/import and move dialog present).

Also in scope: 05-M3 task 5 (the fake bridge's scriptable `analysis.*` / `snapshots.*` handlers and
notification emitters `completeJob`, `failJob`, … — the factory body stays self-contained) and wiring 03-M6's
move/bind dialog (P9) into the snapshots dialog (S4), which is its host. Failed-job logs: the core has
`read_failed_log` but no RPC — add `analysis.readLog {jobId}` api-first if S9 needs it (core change: cargo
gates with and without `--all-features`, own `CARGO_TARGET_DIR`). Out of scope here: task 5 (history badges,
S10) — it plugs into the History commit list, which another agent is building (04-M3/M4); leave it for after
04-M4 and say so.

Parallel work note: other agents work on 04-M3 (History view) and 02-M7 (metrics bar, toasts) at the same
time. Keep shared-file edits (nav bar, `app.config.ts`, fake bridge, `CHANGELOG.md`) small and localised.

1. Jobs and snapshot catalog services
2. Loaded snapshot registry
3. W1 workspace status (replaces the jobs indicator), including analysis progress
4. Snapshots dialog (S4) with Open, Show log (S9), analyse actions (S5), preflight problems (S6), move/bind (P9)
5. ~~History badges~~ — after 04-M4
6. Changelog
+ 05-M3 task 5: fake bridge analysis/snapshot handlers

## Steps

- [x] 1. Jobs and catalog
- [x] 2. Registry — covered by 03-M5's `ProjectsService.shownSnapshot` (see Notes); the file-name registry waits for its consumer
- [x] 3. Workspace status W1
- [x] 4. Snapshots dialog
- [x] 5. History badges — built in 04-M5 (see `04-M5-selection-menu-ports.md` step 4)
- [x] 6. Changelog
- [x] Fake bridge analysis handlers (05-M3 task 5)
- [x] Core: `analysis.readLog { jobId }` (design deviation 4)

## Notes

Environment (2026-11-19): Arch Linux, node 26, npm 12.2, rustc 1.95. Branch `feature/studio-05-m4` from
`feature/studio-stack` (`9855c8fb1`). Own `CARGO_TARGET_DIR` `core/target/studio-05-m4`.

### Verified before changing code
- 05-M3/M5/M6 core on the stack: `analysis.preflight|enqueue|cancel|list|clearFinished|enqueueBatch|cancelBatch`,
  `snapshots.list|readLog|resolveForCommit|usage|delete|planPrune|prune|move`, events `analysis.*`,
  `snapshots.changed`; `SnapshotSummary` (not the plan's `SnapshotEntry`), `EnqueueResult` tags as in 05-M3 notes.
- 03-M5/M6: `ProjectsService` already holds `snapshotsByFolder` and `shownSnapshot`, loads through
  `loadProjectSnapshots`; `showSnapshot(ref)` opens a snapshot in its folder and navigates to the map;
  `MoveSnapshotDialogComponent` (P9) existed without a host; `FolderGitService` (cached `git.status`) stands in
  for area 04's `GitRepositoryService`, which is not on the stack.

### Core: `analysis.readLog` (api first)
- `AnalysisReadLog` = `analysis.readLog`, renderer, `JobRefParams -> SnapshotLog`; `Analyses::read_failed_log`
  finds the job (`NOT_FOUND` for an unknown job, one that did not fail, or after `clearFinished`) and reads
  `.failed-<jobId>/run.log` through the existing `SnapshotRepository::read_failed_log`. Protocol test
  `should_read_the_log_of_a_failed_analysis_until_it_is_cleared`. Contract regenerated (`coreApi.ts`,
  `coreMethods.generated.json`, `SnapshotLog` doc). "As built (05-M4)" added to plan 05. Cargo fmt, clippy and test
  with and without `--all-features` green (844 / 848 passed); `npm run contract` leaves no diff.

### Fake bridge (05-M3 task 5)
- Seeds `analysisJobs`, `snapshotLogs` (by snapshot id), `failedJobLogs` (by job id); handlers `analysis.preflight`
  (clean), `enqueue` (queued / alreadyQueued per folder + target, emits `analysis.queued`), `cancel`, `list`,
  `clearFinished`, `readLog`, `snapshots.readLog`; emitters `startJob`, `reportProgress`, `completeJob(id, snapshot?)`
  (adds an analysed `SnapshotSummary`, ids `<sha>-01234567` / `worktree-20260101T000000000Z-01234567`, then
  `analysis.finished` + `snapshots.changed`), `failJob(id, error, log?)`. Job ids `job-<16 digits>`. `setResolution`
  waits for 05-M5's renderer. The factory body stays self-contained ("rebuilt from its own source text" green).

### Files
- `features/snapshots/`: `services/analysisJobs.service.ts` (`jobs`, `outcomes$`, `enqueue`, `cancel`,
  `clearFinished`, `readLog`; reloads when `shell.coreState` is ready), `snapshotCatalog.service.ts` (snapshots per
  folder from `ProjectsFacade`, re-reads a folder on `snapshots.changed`, per-folder failure, `readLog`),
  `snapshotView.service.ts` (`analyse`, `retry`, `open`, `rejectedRun` by surface), `snapshotsDialog.service.ts`
  (open state; the nav bar hosts S4); `util/analysisWording.ts`; components `snapshotsDialog` (S4),
  `analysisLogDialog` (S9), `preflightProblems` (S6); `e2e/snapshots.e2e.ts|.po.ts`; `snapshots.mocks.ts`.
- `features/workspaceStatus/` (new, design W1): `components/workspaceStatus` (trigger + MAP / GIT / ACTIVITY
  dropdown, hosts one S9), `components/analysisActivity` (ACTIVITY rows), `util/workspaceTrigger.ts` (pure trigger
  model: icon, branch, map part, badge, fill, title, aria-label).
- Shared files touched (small): `navBar.component.html|ts|spec` (map slot: W1 while a project is open; S4 host next
  to the export dialog host), `projects/facade.ts` + `projectsFacade.ts` (+ `ProjectsService.refreshFolderSnapshots`),
  `desktopTools/facade.ts` (exports `DesktopToolsService` for "Restart core"), `util/desktop/desktopBridge.mocks.ts`,
  `app/tailwind.css` (`--animate-progress-sweep`, design W1), `CHANGELOG.md`. Not touched: `app.config.ts`,
  `codeCharta.component.html`.

### Followed the design over the plan
- W1 replaces the plan's `cc-analysis-jobs-indicator` and chip (S3 merged, OD2): fixed width `w-40 xl:w-[17.5rem]
  2xl:w-[22rem]`, grid `1rem / 1fr / auto / auto`, fixed icon slot, progress fill (`bg-primary/20`, width = percent,
  `transition-[width]`), sweeping band without a percent (`motion-safe:animate-progress-sweep`, static
  `bg-primary/10` with reduced motion), success tint 1.5 s, error tint until the dropdown opens, visually hidden
  `progressbar`, multi-line `title`, `aria-label` from its parts. Branch hidden below `xl`, ahead/behind only at
  `2xl`, dirty dot. Shown also while the project overview shows (principles §3 map slot).
- S4 is a native dialog hosted by the nav bar (W1 closes its dropdown), opened from W1 "Snapshots…"; per-folder
  `collapse` with `bg-base-200` header and count, column header with the sort tooltip, folder select (actions act
  on the chosen folder, "All" only filters), unbound imports in their own section, Move/Bind (P9) on imported rows,
  Re-analyse (force) and Show log on analysed rows, S6 at the top, "No analyses yet." with "Analyse current
  checkout", per-folder error with Retry, skeleton while refreshing. Rows use CSS subgrid so the design's `auto`
  flags column lines up across rows (one grid per row did not, seen in the first screenshots).
- Nothing starts an analysis by itself (owner rule). The map switches only for the analysis the user asked for
  last in the working folder (W1 / S4 / Retry), with the toast "Showing the analysis of a1b2c3d"; any other finish
  toasts "Analysis of a1b2c3d finished"; a failure toasts "Analysis of a1b2c3d failed: <message>" (S2 wording). This
  is the design's "map follows the target" with the target taken as what the user asked to analyse, until 05-M5
  brings the real target and resolution.
- Enqueue answers as S5: "This analysis is already queued." (info), "Already analysed" (info, opens the snapshot),
  rejected → S6 in the surface that started it (S4 alert, or W1's ACTIVITY section).

### Deviations and gaps (not improvised beyond the minimum)
- **Task 2 (LoadedSnapshotRegistry, ForgetRemovedSnapshotsEffect)** not built: with one working folder (OD1) at
  most one snapshot is loaded, and 03-M5's `ProjectsService.shownSnapshot` already says which (cleared for sample
  maps and on unload). A file-name registry would duplicate it with no consumer (knip). Its consumers are plan
  04's `LOADED_MAP_LOCATOR` (task 5) and 05-M5; build it there if `shownSnapshot` does not suffice.
- **"other profile"** (S4 badge, W1 badge): no renderer API gives the project's current profile hash; 05-M5's
  resolution carries `isCurrentProfile`. Plan test "should mark other-profile rows" not written. The profile cell
  shows the first 4 hex + "…", the full hash in `title` (the design's `without` / `exclude` / `extraArgs` title needs
  the snapshot's profile, which the summary lacks).
- **W1 MAP**: "Show commit…" (needs area 06 C4), "Show current checkout" and "Analyse <short>" (need 05-M5's target)
  not offered. MAP offers "Analyse current checkout" (primary) while the folder has no analysis, and "Snapshots…".
- **W1 GIT**: no contextual sync button / "Open History" (area 04 H5 not on the stack); the changes line reuses
  03-M5's `changesSentence` ("3 uncommitted (1 staged)", "clean") instead of "3 uncommitted changes (1 staged)" so P3
  and W1 say the same. Git problems show the core's message (as 03-M5).
- **05-M6, not here**: S4 Delete and its confirmation, "Clean up…", store-size footer, "Analyse several…" (S7),
  batches in ACTIVITY, Delete key on a row. O4 (open) also concerns those dialogs.
- **S6**: no "Open desktop tools" link (nothing opens the settings dialog on that tab from outside; the hint text
  says it); `LOW_DISK_SPACE` → "Clean up…" waits for S8; `WORKTREE_FAILED` shows the `git config --global
  core.longpaths true` block (selectable, no copy button); no "Analyse anyway" (enqueue refuses only on errors).
- **Core offline**: icon + "Core offline" + "Restart core" (`DesktopToolsService`); no "Open desktop tools".
- ACTIVITY: a cancelled job reads "Analysis of a1b2c3d cancelled" (the design has no cancelled row); a job of
  another folder adds " · <folder>"; working-tree jobs say "working tree" / "the working tree" in sentences.
- S4 "unknown (imported 1 Nov)" uses the short date (fits the 9rem column like the mock-up; full date in `title`).
  Trigger badges stay text at 1024–1279 px (truncated, `max-w-24`), not the design's icon-only badge.
- No P3 entry points ("Snapshots…", "Analyse current checkout" on the analyses card): `projects` cannot import
  `snapshots` (feature cycle); a later milestone can hand them in through a token or move the card.
- 05-M3 task 5 done here; `05-m3-queue-rpc-cli.md` updated.

### Screenshots (Playwright, seeded stand-in bridge, 1600×900 and 1100×900, cc-dark and cc-light; scratch spec, not committed)
- W1 analysing 42 % (fill under icon and branch, ↑2 ↓1, dirty dot, "Analysing · 42 %"), sweeping "Analysing…",
  failed (error tint, "Analysis failed", `failed` badge), not analysed (`not analysed` badge), imported unbound
  (file-import icon, "out imported · analysis time unknown"); at 1100 px icon + map part only ("Analysi… 42 %"
  truncates in `w-40`, as the fixed-width rule allows). Dropdown: MAP "Showing a1b2c3d Fix invoice rounding…",
  Snapshots…; GIT branch → upstream with ↑↓ and changes; ACTIVITY running row with bar and stop button, queued,
  "Analysed 9f8e7d6 · 1 min 12 s" + Open, failed with message and hint + Show log / Retry; Project overview. Same
  sections and order as the mock-up.
- S4 with all folders: billing-api open (working tree / commit / bound import with flags), empty folders collapsed,
  unbound-imports section; hover shows Open / Re-analyse / Show log. Fixed after looking: columns did not line up
  between rows (now subgrid); the imported analysed-at text was cut (short date now). S6 alert with two bullets and
  the longpaths block. S9 log in a `bg-base-200` pre with Copy log / Close. Readable in both themes.
- Desktop (scratch `_electron` spec, fake-ccsh as ccsh and java, a temporary git repository): new project → W1 "not
  analysed" → "Analyse current checkout" → success tint → map shown "@ 6c53515" with the toast "Showing the analysis
  of the working tree": real core, shell relay of `analysis.*` events and map read work together.

### Left for later
- Task 5 (S10 markers, `provideSnapshotsForGitHistory`) done in 04-M5; 05-M5 (target, resolution, S2 notice,
  stale/ahead badges, "Show current checkout", "Analyse <short>"); 05-M6 UI (S7, S8, delete); M7 desktop smoke with
  fake-ccsh (the scratch spec above is a starting point).

### How to try it in the desktop app
`cd analysis && ./gradlew installDist` (real ccsh; Java ≥ 22), then `cd visualization && npm run build && npm run
start` (core from `core/target/debug`). If ccsh is not found: Settings → Desktop tools → pick
`analysis/build/install/codecharta-analysis/bin/ccsh`. Create a project with a folder (project menu → New
project…). The nav bar shows the workspace status "⎇ main  not analysed"; open it → "Analyse current checkout" (or
"Snapshots…" → "Analyse HEAD commit"). The status fills with progress; when the analysis is done the map opens.
"Snapshots…" lists every analysis; Open reopens one, Show log shows ccsh's output.

