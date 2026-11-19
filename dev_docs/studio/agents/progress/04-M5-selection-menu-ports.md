---
name: 04-M5 selection, keyboard, context menu, ports (+ 05-M4 task 5 history badges)
state: progress
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
- [ ] 3. Ports and context menu
- [ ] 4. History badges and analyse action

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

