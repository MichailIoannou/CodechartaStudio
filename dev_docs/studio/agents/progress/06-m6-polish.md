---
name: 06-M6 — polish and stretch (legend caption, two folders, working-tree and imported sides, inspector line, fetched-ref clean-up)
state: complete
version: 1
---

## Goal

Plan 06 M6 tasks 1–5 across the core and the renderer; task 6 (rename-aware delta) as a dated working plan only.

## Tasks

Scope given by orchestration (branch `feature/studio-06-m6` from `feature/studio-next`): M6 tasks 1–5, task 6 as a plan.
Design read: `design/06-compare.md` (C1, C2, C3, C4, C8, C9), `design/00-design-principles.md`, `design/owner-decisions.md`
(OD1: cross-folder comparison stays offered in the compare dialog).

## Steps

- [x] 1. Legend caption — already built in 06-M1 (task 9, "Δ = head a1b2c3d − base 9f8e7d6"); extended to name a side
      without a commit ("Δ = head working tree − base 9f8e7d6")
- [x] 2. Cross-folder comparison: core `resolve_across`, renderer "Compare with another folder"
- [x] 3. Working-tree and imported sides: core `resolve_with_snapshots`, renderer picker group, entry points, chip, legend,
      metrics-only Changes
- [x] 4. (stretch) Inspector git status line
- [x] 5. (stretch) `hosting.removeFetchedRefs` and the folder-menu action
- [x] 6. Working plan `progress/06-m6-rename-aware-delta-plan.md` (no code)
- [x] Changelog, user docs (`gh-pages/.../user-controls/compare.md`), e2e

## Notes

Environment (2026-11-21): Arch Linux, node 26.13, npm 12.2.2, rustc 1.95, own `CARGO_TARGET_DIR`
`core/target/studio-06-m6`.

### Core (contract changes, regenerated with `npm run contract`)
- `ComparisonOrigin::Folders`; `RefLabelKind::{WorkingTree, Imported}`; `SideKind { Commit, WorkingTree, Imported }`;
  `RefInput::{WorkingTree { snapshotId }, Imported { snapshotId }}`.
- **`ComparedCommit` changed shape** (plan: `SnapshotRef`): it gained `kind` and `snapshotId`, and `commit` /
  `shortCommit` became optional (null for a snapshot side). Kept the built name instead of renaming it.
- `SideLookup::status_of(folder, commit, cancel)` (was `status_of(&ComparedCommit)`) plus `snapshot(&SnapshotRef)`.
- **Two folders** (`compare/folders.rs`, `CommitComparison::resolve_across`): each side is picked in its own clone; the
  base folder's clone, then the head folder's, is the one that "has both commits" (`pick_if_local`); only with such a
  clone are the merge base (base mode `mergeBase` with a named base) and the status computed, else tip vs tip and
  `ready`. The same commit in two folders is `ready` (the analyses may differ; identical ones end in "No metric
  differences"). A merge base found in the head folder's clone is attributed to that folder (its snapshots answer
  for it, "Analyse missing" analyses it there); `baseTip` stays in the base folder. Both sides must be in one project
  (`BAD_REQUEST`).
- **Snapshot sides** (`compare/snapshot_sides.rs`, `resolve_with_snapshots`): the snapshot must exist in the side's
  folder (`NOT_FOUND`) and be of the named kind (`BAD_REQUEST`: working tree = `target: workingTree`, imported =
  `source: imported`); status `exact`; no merge base, `baseMode: tip`, `baseTip: null`; the same snapshot on both sides
  is `sameCommit`; origin `folders` across two folders, else `commits`. A snapshot side's folder only has to exist (an
  import may sit in a plain folder).
- `resolve_in_project` dispatches: explicit with a snapshot side → `resolve_with_snapshots`; explicit across folders →
  `resolve_across`; everything else as before.
- `hosting.removeFetchedRefs { folder } → { removed }`: `for-each-ref refs/codecharta` then one
  `update-ref --stdin` transaction with `delete` lines, through the folder's operation queue (`GitService::remove_private_refs`).
- CLI: `compare resolve` prints a snapshot side's id where the short commit would stand. No new CLI subcommand.
- Tests: `tests/compare_sides.rs` (plan names: `should_compare_the_same_commit_of_two_folders`,
  `should_fall_back_to_tip_when_no_clone_has_both_commits`, `should_compare_a_commit_snapshot_with_the_working_tree_snapshot`,
  `should_compare_against_an_imported_snapshot`, `should_not_compute_a_merge_base_for_a_side_without_a_commit`, plus the
  clone-attribution, tip-mode, wrong-kind and same-snapshot cases); `fetch_change_request.rs`
  `should_remove_only_refs_under_the_private_namespace`; protocol tests in `serve_compare.rs` (imported side, two
  projects refused) and `serve_hosting.rs`.

### Renderer
- **Two folders:** the dialog's "Compare with another folder" checkbox (shown with two or more git folders) turns the
  folder row into "Base folder / Head folder" and shows design C3's limits sentence; the head picker lists the head
  folder's refs. `TypedSides.headFolder`; each missing side is analysed in its own folder; recents keep `headFolderId`
  (row label "billing-api → billing-fork"); "Change…" reopens with the head folder (`ComparePrefill.headFolder`).
- **Snapshot sides:** `cc-ref-picker` (gitHistory) takes `snapshots` and lists them last under "Snapshots" (icons
  `fa-pen` / `fa-file-import`, always "analysed"); a picked snapshot resolves to `kind: workingTree|imported` with its
  id. Names: "Working tree (4 Nov 09:12)" and the imported file name (duplicates get " (2)"). The dialog refreshes both
  folders' snapshot lists when they change. `ChangedFilesService` does not ask the core when a side has no commit
  (`unavailable` → "Files with metric changes"). Comparisons with a snapshot side are not remembered in Recent.
- Entry points: new port `snapshots/ports/snapshotActions.port.ts` (`SNAPSHOT_ACTIONS`, rows of the snapshots dialog):
  "Compare with working tree" on commit rows when the folder has a working-tree analysis (the newest one), "Compare
  with…" on working-tree and imported rows (dialog with that side as head); History "Compare with HEAD" on the
  uncommitted-changes row (a `COMMIT_ACTION`, offered once the working tree was analysed). `CompareFacade.compareWithSnapshot`.
  Registered with `provideCompareForSnapshots()` in `app.config.ts`.
- Chip: a snapshot side shows no short commit, its label "working tree" / "imported 12 Nov" / "imported, date
  unknown", and no stale badge; across two folders each side's title ends "in <folder>".
- **Inspector line** (`cc-file-git-change`, from the compare facade, mounted under the inspector header's badges):
  worded change badge + "in git", or "renamed from <old path>" (renames and copies), only while a comparison shows and
  the list came from git.
- **Fetched-ref clean-up:** new port `projects/ports/folderActions.port.ts` (`FOLDER_ACTIONS`), rendered after "Import
  cc.json…" in the project overview's folder "More actions" menu; compare contributes "Remove fetched pull requests"
  (git folders that are present) through `provideCompareForProjects()`; toast "Removed 2 fetched pull requests from
  'billing-api'." / "'billing-api' has no fetched pull requests.".
- E2E: "should compare a commit with the analysed working tree and list the changes from the metrics", "should compare
  a branch of the working folder with one of the fork". The fake bridge resolves explicit intents across folders or
  with a snapshot side tip vs tip.

### Readings of the design (for the designer)
1. **Imported side label date** (C2 "imported 12 Nov" / "imported, date unknown"): taken from the file's modification
   date (`fileModifiedAt`), the only date known of an import's content; "date unknown" when it is missing. The
   store's import time is not used.
2. **Snapshot names in the picker:** "Working tree (<d Mon> <HH:MM>)" from the snapshot's creation time, detail line
   "uncommitted changes on a1b2c3d"; imports by file name with "imported, analysis time unknown". Every working-tree
   analysis is listed, not only the newest; the snapshots-dialog and History actions use the newest.
3. **Cross-folder chip:** C2 has no form for two folders; the folder is only in each side's `title` ("Head: c3d4e5f
   feature/later in billing-fork"), because the chip already runs out of room (06-M4/M5 finding).
4. **"Compare with another folder" placement:** checkbox at the right end of the folder row; the C3 mock-up puts it
   right after the folder select.
5. **Same snapshot on both sides** reads "Both sides are the same analysis — nothing to compare." (C6 only words the
   commit case).
6. **Inspector line** (task 4, not in the design): under the node badges, `badge-xs` worded change (H9 badges) +
   "in git" / "from <old path>".
7. **Folder-menu action** (task 5, not in the design): label "Remove fetched pull requests", icon `fa-broom`, no
   confirmation (the refs can be fetched again), result as a toast.
8. **Recent** does not keep comparisons with a working-tree or imported side (a snapshot cannot be typed back into a
   picker by name reliably once newer analyses exist).

### Deviations
- Task 1 needed no new commit: the caption was built in 06-M1; it only gained the snapshot-side wording here.
- `ComparedCommit` kept its name with optional `commit` instead of the plan's `SnapshotRef { kind, commit?, snapshotId? }`.
- The plan's renderer test "should fall back to metric changes when no clone has both commits" is in
  `compare.service.spec.ts` (across two folders, core answers `unavailable`).

### Shared files touched (small, additive)
`app/app.config.ts` (two provider lines), `features/gitHistory` (picker `snapshots` input, `refOptions`, facade type),
`features/snapshots` (port, dialog row buttons, facade), `features/projects` (port, overview folder menu, facade),
`features/sidebarInspector` (header mounts `cc-file-git-change`; two specs provide `selectedNodePathSelector`), the
fake desktop bridge, `CHANGELOG.md`, `gh-pages` compare doc. Not touched: the nav bar.
