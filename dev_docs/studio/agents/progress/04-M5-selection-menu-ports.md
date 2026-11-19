---
name: 04-M5 selection, keyboard, context menu, ports (+ 05-M4 task 5 history badges)
state: complete
version: 1
---

## Goal

Select one or two commits (or the working tree), navigate the history by keyboard, offer a commit context
menu with contributed actions, and plug the snapshots feature into the history: analysed markers and
"Analyse this commit" (plan 04 section 5 M5, plus plan 05 M4 task 5).

## Tasks

Copied from `04-git-branches-and-history.md` section 5 M5 and `05-commit-analysis-and-snapshots.md` M4 task 5.
Branched from `feature/studio-stack` (04-M4 commit list and 05-M4 snapshots UI merged). Design overrides the
plans' UI: `design/04-history.md` (H8 selection, H10 context menus, keyboard), `design/05-snapshots.md` S10
(history markers and commit actions — `ANALYSED_COMMITS`, `COMMIT_ACTIONS` providers), S5 (analyse actions),
`design/06-compare.md` C1 where it puts compare entries in the commit menu (only the hook here — compare itself
is plan 06), `design/00-design-principles.md`.

From `04-M4-commit-list.md`: `CommitSelectionService` holds one item — add the second, keep selection across
refresh, export from the facade; list is `role=listbox tabindex=0`, rows have no ids yet; with the
uncommitted-changes row shown, a commit's row index is its commit index + 1; `CommitListComponent.rowViews`
caches per SHA — add every new row state to its computed's dependencies; `ANALYSED_COMMITS` and
`LOADED_MAP_LOCATOR` exist but are not exported from the facade; `COMMIT_ACTIONS` is missing; the action row
goes between the parents line and CHANGED FILES; `CommitDetailsService.selectCommit(sha)` and
`GitLogService.refLabels()` exist. From `05-m4-analyse-ui.md`: jobs and catalog services, snapshot view service,
analysis enqueue; owner decision: selecting a commit never starts an analysis by itself.

1. Commit selection (one or two items, working tree)
2. Keyboard navigation
3. Ports, commit context menu, two-commit summary
4. (05-M4 task 5) Snapshot badge provider and "Analyse this commit" commit action via the ports

## Steps

- [x] 1. Selection
- [x] 2. Keyboard
- [x] 3. Ports and context menu
- [x] 4. History badges and analyse action

## Notes

Environment (2026-11-19): Arch Linux, node 26, npm 12.2. Branch `feature/studio-04-m5` from `feature/studio-stack`
(`8feb45bcd`).

### 1. Selection
- `CommitSelectionService` keeps a first item (the one picked first) and an optional second (added by Ctrl+click or
  Shift+arrow); `selection().items` are in list order (working tree first, then newest; a commit not in the loaded list,
  e.g. a parent picked from its link, sorts last). A third Ctrl+click replaces the second item; Ctrl+click on a selected
  item while two are selected drops it (not in the plan; the usual list behaviour, so Ctrl+click can also undo).
  `extend`, `setSecond` (Shift+arrow: back on the first item only the first stays), `dropSecond` (Escape), `select`,
  `clear`; signals `selection`, `selectedSha` (only while exactly one commit is selected — the details service reads it),
  `selectedKeys`, `secondKey`, `focusedKey` (the row the keyboard moves from). Keys: the SHA or `WORKING_TREE_KEY`
  (`model/commitSelection.ts selectionKeyOf`).
- Kept across a refresh: `GitLogService.firstPageLoads` counts each page one that replaces the list; then listed
  commits take their fresh summary, and a commit that is not listed is dropped only when no further page can list it
  (`hasMore` false) — a commit further down than page one stays selected after a refs refresh. The working-tree item
  follows the status while the uncommitted row shows and goes when it disappears. Cleared on a repository change.
- Rows: selected `bg-primary/20 font-semibold`, the second item also `border-l-2 border-primary` (H8);
  `CommitListComponent.rowViews` depends on `selectedKeys` and `secondKey`.

### 2. Keyboard
- `util/commitListKeys.ts`: `commitListCommandOf(event)` maps H8's keys to commands (move, copySha, focusSearch,
  dropSecond, runPrimary, openMenu) and `rowIndexAfter(target, current, rowCount, pageSize)`; `util/virtualWindow.ts
  scrollTopShowing` gives the nearest scroll position that shows a row. ↑/↓ select; Shift+↑/↓ set the second item
  (Shift with Home/End/Page keys moves without extending — H8 names only Shift+arrows); Home/End; PageUp/PageDown by
  the rows that fit the viewport; Ctrl/Cmd+C copies the focused commit's full SHA (toast "Copied a1b2c3d", new
  `CommitClipboardService`); Ctrl/Cmd+F or `/` focus the commit search (the list emits `searchRequested`, the panel calls
  `CommitFiltersComponent.focusSearch()`); Escape drops the second item. Handled keys `preventDefault` +
  `stopPropagation` (principles §9); F5 and keys the list does not take bubble to the panel (its F5 refresh, M3).
  Ctrl+C with the working tree focused is let through (nothing to copy).
- Moves start at the focused row (`CommitSelectionService.focusedKey`), or at the first row while nothing is focused;
  the uncommitted-changes row is row 0 while shown; the trailing loading/retry row is not reachable. The focused row is
  scrolled into the window by setting the viewport's `scrollTop` and the list's scroll signal at once.
- Rows have ids (`commit-option-<sha>`, `commit-option-working-tree`, `CommitRowComponent rowIdOf`); the listbox names the
  focused one in `aria-activedescendant`. No separate focus style: the selection follows the focus, so the selected
  row is the focused one (design H8 defines none).

### 3. Ports, context menu, two-commit summary
- `ports/commitActions.port.ts`: `CommitAction { id, label, detailsLabel?, icon, hoverHint, isPrimary, isOfferedFor, run }`,
  `COMMIT_ACTIONS` (multi, one action per provider, listed in provider order). **Deviation from the plan's shape:**
  `label` is the menu's Title Case ("Analyse This Commit", S5 / H10) and the optional `detailsLabel` the details-pane
  button's sentence case ("Analyse this commit", H9 / S5) — an action without it stays in the menu (e.g. "Analyse the Last
  Commits from Here…"); `icon` holds full Font Awesome classes. `CommitActionsService` (`offeredFor`, `detailsActionsFor`,
  `runPrimary`): Enter and double-click run the first offered `isPrimary` action, nothing without one (Enter is then let
  through).
- `components/commitContextMenu` (`cc-commit-context-menu`, `cc-floating-menu` + `cc-context-menu-item`, `w-64`): offered
  contributed actions, a divider, Copy SHA ("Copy the full commit hash", toast "Copied a1b2c3d" as Ctrl+C) and Copy
  Subject ("Copy the first line of the message"; no toast — the design words none). Right-click on a row outside the
  selection selects it first; inside a two-item selection the selection stays, and the actions get both items. Menu key /
  Shift+F10 opens it under the focused row (inset 24 px); opened from the keyboard the first item takes the focus, ↑/↓
  move between items, Escape closes and gives the focus back to the list (keys stopped). A click outside closes it.
- **H10 items not shown:** "Check Out '<branch>'", "Check Out '<remote>' as New Branch…", "New Branch Here…" are write
  entries (plan: from M8; 04-M8 UI is not on the stack) — design rule "unbuilt features are not shown". The menu has its
  hook: they go after a second divider below Copy Subject; `GitLogService.refLabels()` names the branches at a commit.
- The working-tree row gets a menu only when a contribution is offered for it (S5 "Analyse Working Tree", C1 "Compare
  with HEAD"); without one, right-click / Menu key open nothing (no empty menu).
- Details (H9): the offered actions with a `detailsLabel` are `btn btn-sm gap-2` buttons (icon `fa-fw`, `title` the hint)
  between the parents line and CHANGED FILES. Two items: each as short SHA (`font-mono`) + subject (`font-semibold`),
  the working tree as the list row's "Uncommitted changes (3)" (design gap: H9 words only two commits), then for two
  commits "a1b2c3d is 3 commits ahead of and 1 behind 9f8e7d6" (`git.measureDistances`, target = the newer, `onlyInTarget`
  = ahead, `onlyInCandidate` = behind; `CommitDetailsService.distance`, latest selection wins; a failure shows the git
  sentence in `text-error`), then the two-commit action buttons. The same one sentence form for every count (the design
  gives no other form; "0 behind" stays).
- `GitApiService.measureDistances`; the fake answers `git.measureDistances` from the seeded parents (ancestor sets).

### 4. History badges and analyse actions (05-M4 task 5)
- `features/snapshots/gitHistory/provideSnapshotsForGitHistory()` (exported from the snapshots facade, spread into
  `app.config.ts` providers): `ANALYSED_COMMITS` → `SnapshotBadgeProvider`, `LOADED_MAP_LOCATOR` → `SnapshotMapLocator`,
  two `COMMIT_ACTIONS`. The gitHistory facade now exports the three ports, their types and `CommitSelection` (knip has a
  consumer now). Dependency direction snapshots → gitHistory; dependency-cruiser clean.
- `util/commitMarkers.ts commitMarkersOf({ snapshots, jobs, shownSnapshotId })`: a commit snapshot (`target: "commit"`) or
  a commit-bound import marks its commit `analysed` (import: `analysedAt` null, note "imported map, analysis time
  unknown" → title "Analysed — imported map, analysis time unknown"); unbound imports and working-tree analyses mark
  nothing; with several snapshots of one commit the shown one wins, then an analysis over an import, then the newest;
  `isLoadedInMap` = it is `ProjectsFacade.shownSnapshot`. The latest job of a commit (by `queuedAt`) wins when queued,
  running (with its percent) or failed (with its message); done / cancelled leave the snapshot to speak. "other profile"
  is not marked: no renderer API knows the current profile (05-M4 notes; 05-M5's resolution carries `isCurrentProfile`).
- `SnapshotBadgeProvider.markersFor(repo)` hands out one computed per folder (snapshots from `SnapshotCatalogService`,
  jobs from `AnalysisJobsService`, shown snapshot); `markerOf(repo, sha)`.
- `SnapshotMapLocator.nodePathOf(repo, path)`: only while a snapshot of that folder is shown and `GitRepositoryService`
  knows the folder's `folderPrefix`; the path must lie inside the folder; node path `/root/<path within folder>`
  (`PROJECT_ROOT_NAME`), returned only when the loaded map has that node (`LoadedMapReadStore.pathToNode`, new read store
  over `pathToNodeSelector`). This replaces 05-M4 task 2's file-name registry, as that progress file foresaw.
- `gitHistory/analyseCommitActions.ts`: "Analyse This Commit" / details "Analyse this commit", `fa-solid fa-play`, hint
  "Run ccsh on this commit in a temporary worktree" (S5), offered for one commit without an analysis — also after a
  failed one (retry), not while queued or running (it would only toast "already queued"); "Analyse Working Tree" (S5,
  "Analyse the files as they are on disk now") in the uncommitted changes' menu, no details button (H9 shows none for
  the working tree). Both run `SnapshotViewService.analyse({ …, surface: "status" })`: answers as S5 (toasts, problems
  in W1 ACTIVITY, S6), the map opens when that analysis finishes (05-M4 behaviour). Selecting a commit starts nothing
  (owner rule).
- **Not built here:** "Analyse the Last Commits from Here…" (S5) needs the batch dialog S7 (05-M6 UI, not on the stack);
  the H9 resolution line and the primary "Show in map" (S10, S5, Enter / double-click) need 05-M5's resolution flow,
  which the parallel 05-M5 UI work owns — it should contribute a `CommitAction` with `isPrimary: true`, `label` "Show in
  Map" (hint per S5), `detailsLabel` "Show in map", `icon` "fa-solid fa-map", provided **before** the analyse actions in
  `provideSnapshotsForGitHistory()` (H9 shows it first).
- Changelog: "Git history" names keyboard navigation, the copy menu and the two-commit distance; "Analyses in the app"
  names analysing any commit picked in the History and the analysed marks there (rewritten, no new entries).

### Screenshots (Playwright, stand-in bridge; scratch spec, not committed)
- Seed: billing-api on feature/invoice-rounding with 3 uncommitted files, ten commits with a merge; snapshots: Release 2.4.0
  analysed and shown in the map, "Start the invoice module" analysed, "Import the 2025 tax rates" a commit-bound import;
  jobs: running 42 % ("Add currency table"), queued ("Round half-even…"), failed ("Tidy the tax tables"). 1600×900,
  cc-dark and cc-light.
- Seen against H8 / H9 / H10 / S5 / S10: the Analysis column reads "42 %", "in map", "queued", "analysed", "failed",
  "analysed" (the import) as worded soft badges; selecting the failed commit fills the details with "▶ Analyse this
  commit" between the parents line and CHANGED FILES; nothing analyses by itself. Click + Ctrl+click: both rows tinted,
  the second with the left primary border; details "6666666 Release 2.4.0 / 2222222 Add the billing api skeleton / 6666666
  is 4 commits ahead of and 0 behind 2222222". Right-click on an unanalysed commit: menu at the pointer "Analyse This
  Commit · — · Copy SHA · Copy Subject". Keyboard (Home, ↓, ↓, Shift+↓, Shift+F10): two rows selected, the menu under the
  focused row with "Copy SHA" focused. Right-click on "Uncommitted changes (3)": "Analyse Working Tree" only.
- **Fixed after looking** (`fix(visualization): keep the second selection in line and focus the keyboard menu`): the
  2 px border of the second row shifted its graph lane by 2 px (now `pl-1.5` keeps the `px-2` inset); the menu opened
  from the keyboard did not show its focus — the first item was focused while the menu was still `visibility: hidden`
  (it measures itself one frame later), so the focus was lost. `cc-floating-menu` gained a `positioned` output (emitted
  once it has clamped itself; it no longer clamps after it is destroyed) and the commit menu focuses after the next
  render; `cc-context-menu-item` gained `focus-visible:bg-base-200` so the focused item is visible in every menu.
- Observations for the theme owner (not changed, classes are the design's): in cc-light the soft "analysed" / "42 %"
  badges are pale on white; a hovered selected row shows the hover grey instead of the selection tint (hover wins, in
  both themes, as in M4); the column header "GRAPH" runs into "COMMIT" when the graph is one lane wide (M4 layout).

### Shared files touched
- `app/app.config.ts` (one spread: `...provideSnapshotsForGitHistory()`), `features/gitHistory/facade.ts`,
  `features/snapshots/facade.ts`, `util/desktop/desktopBridge.mocks.ts` (+ spec: `git.measureDistances`; body stays
  self-contained), `features/shared/components/floatingMenu` (`positioned` output, no clamp after destroy),
  `features/shared/components/contextMenuItem` (`focus-visible:bg-base-200`), `visualization/CHANGELOG.md` (two entries
  rewritten). Plans: `04-git-branches-and-history.md` (port as built, M5 task 3 as built), `05-commit-analysis-and-
  snapshots.md` (M4 as built), `progress/05-m4-analyse-ui.md` (task 5 done).

### For 04-M6 and plan 06
- 04-M6 e2e: test ids `commit-context-menu`, `commit-details-actions`, `commit-details-two`, `commit-details-two-item`,
  `commit-details-distance`; row ids `commit-option-<sha>`; the fake answers `git.measureDistances`. The plan's M6
  scenario "right-click offers Copy SHA" works with the stand-in bridge (Copy SHA is always in the commit menu).
- Plan 06 (compare entry points, design C1): contribute `CommitAction`s through `COMMIT_ACTIONS` (multi, one per
  provider, from the compare feature into gitHistory's facade tokens; provider order = menu order). Two-commit "Compare":
  `isOfferedFor: s => s.items.length === 2`, `detailsLabel` "Compare" makes it a button in the two-item details;
  "Compare with Parent" / "Compare with Current" / "Compare with…" are menu-only (no `detailsLabel`) or set it for H9's
  "Compare with…" button; "Compare with HEAD" on the working tree item. **Gap:** C1 wants "Compare with Parent" shown
  disabled with a reason for a root commit; `CommitAction` has no disabled state yet — add an optional
  `disabledReasonFor?(selection): string | null` to the port and render it in `cc-commit-context-menu` (the menu item
  component has no disabled input either).
- 05-M5 (parallel): the primary "Show in map" action and the H9 resolution line are not here (see step 4).
- Check Out / New Branch entries of H10: 04-M8 UI, after Copy Subject behind a second divider.

### Gates (final)
format:check clean; npm test 728 suites / 5755 tests green with the coverage gate; lint (depcruise, styles, knip)
clean; tsc clean; build ok; e2e:ci 176/176 (temporary port 9037 and the chromium channel, both reverted);
test:electron 76/76; e2e:desktop 16/16 with the core built into `core/target/studio-04-m5`.

