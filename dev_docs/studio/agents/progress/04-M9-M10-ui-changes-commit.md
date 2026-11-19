---
name: 04-M9/M10 renderer — changes, diff and commit
state: progress
version: 1
---

## Goal

The Changes tab of History: working-tree changes grouped and stageable, a diff view, discard to the recycle bin,
and the commit box with amend (renderer halves of plan 04 M9 task 2 and M10 task 2).

## Tasks

Copied from `04-git-branches-and-history.md` section 5, M9 task 2 and M10 task 2. Combined into one agent by
orchestration (same area, weekly budget). Branched from `feature/studio-stack`. Design overrides the plan's UI:
`design/04-history.md` (Log/Changes tabs, H11 changes panel, H12 commit box, H13 diff view, H15 confirmations
incl. discard and amend-of-pushed; "Deviations from the plan"), `design/00-design-principles.md`, mock-up.

Core contract (on the stack): `git.workingTree {repo}` → `GitWorkingTree`; `git.diffFile {repo, path, kind}` →
`GitDiff` (≤ 2 MiB shown, `isTruncated`; over 4 MiB `OUTPUT_TOO_LARGE`); `git.stage {repo, target: paths|all}`,
`git.unstage {repo, paths}`, `git.discard {repo, entries: [{path, kind, change}]}` — send rows exactly as listed
(1–1000), each returns a fresh `GitWorkingTree`; codes `CHANGED_SINCE_LISTED`, `NOT_ALLOWED`, `INDEX_LOCKED`,
`IO` (recycle bin unavailable), `RECYCLE_FAILED`. Discard always goes to the recycle bin. `git.commit {repo,
subject, body, amend}` → `GitOperationResult`; codes `IDENTITY_UNKNOWN`, `NOTHING_TO_COMMIT`, `HOOK_FAILED` (hook
output in `details.detail`), `CONFLICTS`, `OPERATION_IN_PROGRESS`. Every call ends with `repository.changed`
(parts incl. `workingTree`).

From `04-M7-M8-ui-prompts-fetch-branches.md`: run every write through `GitOperationService.run` (hooks notice,
progress, refresh); confirmations through `GitConfirmationService.ask` with texts in `effectText.ts`; failures like
`BranchActionsService.report` (error toasts persist, accept a follow-up action). Diff text rendered through
interpolation only (never `innerHTML`). The "Open changes" link and the committer label left open by 04-M4 can be
completed here if the design words them.

1. Changes tab, changes panel, change rows, diff view, diff line parsing (M9 task 2)
2. Commit box, commit message service, draft per repository, amend-of-pushed confirmation (M10 task 2)

## Steps

- [x] 1. Changes and diff
- [ ] 2. Commit box

## Notes

Environment (2026-11-19): Arch Linux, node 26.13, npm 12.2.2. Branch `feature/studio-04-m9m10-ui` from
`feature/studio-stack` (`92d1dcf46`). Core built into `core/target/studio-04-m9m10-ui` (linked as
`core/target/debug/codecharta-core` in the worktree).

### Verified first
The contract as this file states it: `git.workingTree`, `git.diffFile`, `git.stage` (tagged `target`),
`git.unstage`, `git.discard` (rows `{ path, kind, change }`), `git.commit` (`GitCreateCommitParams`), `git.isAncestor
{ repo, ancestor, descendant }` → `boolean`; `ChangedPart` includes `workingTree`. `GitOperationService.run`,
`GitConfirmationService.ask`, `effectText.ts` and the failure toast as 04-M7/M8 describe them. The mock-up has no
Changes tab (only H11–H13 text in `design/04-history.md`), so the text is the only design source for this tab.

### 1. Changes and diff (M9 task 2)
- **Structural first:** `BranchActionsService.report` moved into `services/gitFailureReport.service.ts`
  (`GitFailureReport.report(error, context)`), used by branch actions, changes and (task 2) the commit box.
- **Tabs (H4):** `HistoryTabService` (root) + `repos/historyTab.repo.ts`, key `codeChartaHistoryTab.<projectId>`
  ("log" without a project or stored value). `cc-history-toolbar` shows "Log" / "Changes" (`role="tablist"`,
  `ml-auto`, `cc-current-underline` as `cc-mode-toggle`) with the changed-file count as `badge badge-sm`
  (`badge-warning` with conflicts, hidden at 0) — the count is the status counts' sum, like the uncommitted row (a new
  folder counts once there, while the list names its files one by one). `cc-git-history-panel` swaps the three panes
  for `cc-changes-panel` (resizable island, 360 px, 260–640, `changesWidth` in `codeChartaHistoryLayout`) and
  `cc-diff-view`. The H9 working-tree details now end in "Open changes" (`btn btn-link btn-sm`) → Changes tab (the
  link 04-M4 left open).
- **`GitChangesService`** (root): reads `git.workingTree` whenever a ready status arrives while the Changes tab is
  shown — status is re-read after every write (`GitOperationService`), on `repository.changed` and on window focus,
  so the list follows all three; a read keeps the old list on screen (no flicker). Groups via `model/changeRows.ts`
  (Conflicted, Staged, Changes, Untracked; sorted by path; row key `<kind>:<path>` since a file can be listed twice).
  Selection: click = only, Ctrl/⌘ = toggle, Shift = range from the anchor; the clicked row's diff is shown. A shown
  file that moves group (stage / unstage) keeps its diff in the new group; a vanished one clears it. Writes go through
  `GitOperationService.run` (kinds `stage`, `unstage`, `discard` added), more than 1000 paths are sent in chunks under
  one operation id; the answered `GitWorkingTree` replaces the list at once. Failures: `GitFailureReport`
  (`CHANGED_SINCE_LISTED` worded per H6; the refresh afterwards re-reads the list).
- **Discard:** only unstaged and untracked rows (design H11 shows no discard on staged rows, and the core would
  refuse a staged row without its unstaged row); confirmation `discardConfirmation(paths)` in `effectText.ts` (H15,
  ≤ 10 names then "and n more", Cancel / **Discard** `btn-error`), then exactly the confirmed rows as listed.
- **Panel (H11):** header "CHANGES" + "Stage all" (`fa-plus`, `target: all`); group headers with caret (collapse in
  memory), count ("(2)"; Conflicted as `badge-warning`), Staged "Unstage all", Changes "Stage all"; with two or more
  rows selected these read "Unstage 2 selected" / "Stage 3 selected" and act on the selected rows of that group
  (**choice:** from two rows on, since one selected row is just the row whose diff is shown). Rows (`cc-change-row`,
  28 px): worded badge `w-16` (H9's words plus "conflict" / "untracked"), file name ("old.ts → money.ts" for
  renames, path in `title`), folder `/60`; hover/focus buttons Stage `fa-plus` "Stage <file>", Unstage `fa-minus`,
  Discard `fa-rotate-left` "Discard changes to <file>". **Reading of H11:** conflicted rows show the Discard button
  disabled with the title "Use Abort to undo a merge" (H11 says they "have no Discard" yet gives a title; the title
  needs an element). Keyboard: listbox, ↑/↓/Home/End move and select (Shift extends), Space stages / unstages, Delete
  discards the selection, Enter shows the diff; handled keys stop propagation. Empty, truncated (> 5 000) and failed
  (with Retry) states as H11. Every write is disabled with "Waiting for the previous git operation…" while one runs.
- **Diff (H13, `util/diffLines.ts`):** kinds header / hunk / added / removed / context / note with the plan's classes,
  old and new line numbers from the hunk header; a conflicted file's combined diff (`@@@`, two prefix columns) is
  coloured by its columns without old numbers. Header: path `font-mono text-sm` + kind badge (`badge-ghost`,
  `badge-warning` for conflicted — colour not given by H13). Body: `cc-diff-lines`, `font-mono text-xs`, 20 px rows,
  a sticky two-number gutter in `.cc-source`'s colours (Tailwind classes; `.cc-source` itself is for `innerHTML` rows
  and a larger font), **always virtualised** (`util/virtualWindow.ts`, plan: above 2 000 lines — one path is simpler and
  a 2 MB diff has ~40 000 lines); text by interpolation only. States: "Select a file to see its changes.", "Binary
  file — no text diff.", footer "Diff cut at 2 MB.", skeleton, error with Retry (`OUTPUT_TOO_LARGE` has no sentence,
  so "Git failed: <message>").
- **Fake bridge:** `changes`, `areChangesTruncated`, `diffs` per repository; `git.workingTree`, `git.diffFile`,
  `git.stage`, `git.unstage`, `git.discard` move rows, refuse unlisted rows (`CHANGED_SINCE_LISTED`) and conflicted
  discards (`NOT_ALLOWED`), keep the status counts in step once `changes` is seeded; every write now announces parts
  `status`, `refs`, `workingTree`, as the core does.
- Tests (plan names where they apply): `gitChanges.service.spec.ts` — four groups; working tree read only on the
  Changes tab; stage / unstage rows and stage all; chunks; **discard confirmation names the files and sends exactly
  those rows**; declined / nothing discardable; **list refreshed after each action and on focus**; changed-since-listed
  toast; selection modes and diff; diff follows the file; retry; forgotten on a folder change.
  `changesPanel.component.spec.ts` — groups, badges, names; stage / unstage / discard from the row and from groups;
  multi-selection labels; keyboard; collapse; busy; empty, truncated, failure. `diffView.component.spec.ts` — **diff
  lines coloured**, **diff rendered through interpolation only**, binary, truncated, virtualised, conflicted badge,
  retry. `historyTab.service.spec.ts` — **tab remembered per project**. Toolbar, details, panel, layout, effect text,
  error text, changed-file text, api and fake-bridge specs extended. E2E "History changes": diff colours, stage after
  the hooks notice, discard after the confirmation.

