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

- [ ] 1. Selection
- [ ] 2. Keyboard
- [ ] 3. Ports and context menu
- [ ] 4. History badges and analyse action

## Notes

