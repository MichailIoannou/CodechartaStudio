# 04 — History view and git workflow: interface design

Plan: `04-git-branches-and-history.md` (sections 3, 4.7, 4.8, milestones M3–M12).
Principles: `00-design-principles.md`. Desktop only. Mock-up: `mockups/history.html`.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| H1 | History tab | entry in `VIEW_TABS` | nav bar centre | the three existing tabs |
| H2 | Branch chip | `cc-current-branch-chip` | nav bar, end of `navbar-start` | `cc-settings-button` (ghost button) |
| H3 | History view frame | `cc-history-view` → `cc-git-history-panel` | new route `history` | metrics view (explorer left, inspector right) |
| H4 | Toolbar | `cc-history-toolbar` | top of H3 | explorer search bar, `cc-mode-toggle` |
| H5 | Sync buttons and operation progress | `cc-sync-buttons` | right end of H4 | ghost buttons, `loading` |
| H6 | Problem and operation banners | `cc-git-problem-notice`, operation-state banner | under H4 | `explorerFocusBanner`, cluster explorer alert |
| H7 | Branches tree | `cc-branches-tree` | Log tab, left pane | `cc-sidebar-explorer` header and tree rows |
| H8 | Commit list with graph | `cc-commit-list`, `cc-commit-row`, `cc-commit-graph-cell` | Log tab, centre | explorer rows, map-selector rows |
| H9 | Commit details | `cc-commit-details` | Log tab, right pane | `cc-sidebar-inspector` |
| H10 | Commit and branch context menus | `cc-commit-context-menu`, `cc-branch-context-menu` | floating | `cc-node-context-menu` |
| H11 | Changes panel | `cc-changes-panel` | Changes tab, left pane | explorer tree rows |
| H12 | Commit box | `cc-commit-box` | bottom of H11 | `saveScenarioDialog` fields |
| H13 | Diff view | `cc-diff-view` | Changes tab, right | `cc-source-viewer` (`.cc-source`) |
| H14 | Branch dialogs | create, rename, set upstream | native dialogs | `saveScenarioDialog` |
| H15 | Confirmations | switch, delete, discard, pull choice, force push, amend, abort, hooks | native dialogs | `deleteConfirmDialog`, `ConfirmDialogComponent` |
| H16 | Credential prompt | `cc-credential-prompt-dialog` | `views/codeCharta.component.html` | `ConfirmDialogComponent` |
| H17 | Stash (stretch, M12) | menu + dialog | Changes tab | `scenarioListDialog` |

---

## H1 History tab

- Fourth tab in `cc-view-switcher`: label "History", `title` "Show branches and commit history",
  route `#/history`. Same classes as the other tabs (`btn btn-ghost btn-sm`, `cc-current-underline`
  when active).
- **Shown** when `isDesktop()` and the active project has at least one git folder (see Deviations).
  Otherwise absent. If it disappears while active, the app navigates to the metrics view
  (`replaceUrl`).
- **No mode bar.** Hovering History opens no mode bar and the handle under the switcher is not drawn
  while History is the active view (`ViewTab.hasModes = false`).
- Web build: the tab is absent. Opening `#/history` by hand shows, centred in the page,
  `text-base-content/70` "Commit history is available in the desktop app." and a `btn btn-sm`
  "Show the map" (→ metrics).

## H2 Branch chip

**Where.** `navbar-start`, after the map slot (principles §3). Rendered only when the active folder is
a git repository and `GitRepositoryService.status()` is ready.

```
[⎇ feature/invoice-rounding  ↑2 ↓1  ●]      ● = dirty dot (badge badge-warning badge-xs)
[⎇ detached at a1b2c3d]
[⎇ main  ⟳]                                  ⟳ = operation running (loading-spinner loading-xs)
[⎇ main  merging]                            badge badge-warning badge-xs "merging" / "rebasing"
```

- `<a class="btn btn-ghost btn-sm gap-1 max-w-56">` → `routeLinks.history`. Branch name `truncate`;
  `↑n` / `↓n` `text-xs tabular-nums` (omitted when 0 or no upstream; `↑2` uses `fa-arrow-up` icons
  with numbers, not Unicode arrows).
- `title` (multi-line): "Branch 'feature/x' of 'billing-api'\n2 commits to push, 1 to pull
  (origin/feature/x)\n3 changed files\nOpen the history". Detached: "Detached HEAD at a1b2c3d".
  No upstream: "No upstream branch". Gone upstream: "Upstream origin/feature/x no longer exists".
- `aria-label` = the first line of the title.
- Narrow: widths per principles §3 (name `max-w-56` / `max-w-32` / hidden).
- Loading / error: chip absent (never a stale branch name). `gitNotFound`: absent; History says why.

**Data.** `GitRepositoryService.status()` (`head`, `upstream.ahead/behind/isGone`, `counts`,
`operationInProgress`), `activeRepository()`, `GitOperationService` running state.

---

## H3 History view frame

Host `block h-[calc(100vh-var(--cc-bars-height))] overflow-hidden bg-base-100` (no bottom bar, no
metrics bar, no legend). Layout, all in-flow (not fixed panes):

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ H4 toolbar: [billing-api ▾]  Log | Changes 3      [🔍 Search commits ] [Author] [Path]  [⟳]  [⇣ Fetch][↓ Pull 1][↑ Push 2] │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ H6 banners (only when needed)                                                                      │
├──────────────────┬──────────────────────────────────────────────────────────┬─────────────────────┤
│ H7 BRANCHES   «  │ H8 commit list                                           │ H9 DETAILS        » │
│ [filter      ]   │ ✎ Uncommitted changes (3)                                │ Fix invoice rounding│
│ ◉ All branches   │ ●─ Fix invoice rounding  [feature/x] [origin/feature/x] ▣│ a1b2c3d  ⧉          │
│ ▾ LOCAL          │ │● Add currency table                                    │ Mia Chen · 3 Nov    │
│   ✓ feature/x ↑2 │ ●┘ Merge branch 'main'                                   │ …message…           │
│     main         │ ●  Release 2.4.0  [main] [🏷 v2.4.0]                      │ 4 files  +120 −8    │
│ ▾ REMOTE         │ …                                                        │ M src/invoice.ts    │
│   ▸ origin       │                                                          │ A src/currency.ts   │
│ ▸ TAGS (42)      │                                                          │                     │
└──────────────────┴──────────────────────────────────────────────────────────┴─────────────────────┘
   260 px (180–480)                                                              380 px (280–640)
```

- Pane borders `border-r` / `border-l border-base-300`; widths via `ccColumnResizeHandle`
  (double-click resets, arrow keys move, as the explorer). Widths remembered in
  `codeChartaHistoryLayout`.
- Both side panes collapse like the explorer: header button `btn btn-ghost btn-xs btn-square`
  `fa-angle-double-left` "Collapse branches" / `fa-angle-double-right` "Collapse details"; collapsed
  = a 2.5 rem strip with the expand button (`fa-code-branch` "Expand branches", `fa-circle-info`
  "Expand details"). Below `xl` (1280 px) both start collapsed unless the user expanded them before.
- Tabs **Log** and **Changes** sit in the toolbar (H4). The Changes tab replaces the three panes with
  H11 + H13.
- **Keep-alive.** The view keeps scroll, selection and filters across view switches (route reuse).
- **Window focus** refreshes (throttled, plan G5); no visual change unless something changed.

## H4 Toolbar

`flex items-center gap-2 px-2 py-1 border-b border-base-300 min-h-10`.

| Control | Look | Behaviour |
|---|---|---|
| Folder select | `select select-sm select-bordered max-w-48`, options = git folders of the project by label; `aria-label` "Repository folder" | hidden when the project has one git folder; sets the active folder (`ProjectsService.setActiveFolder`, area 03 deviation 3) |
| Tabs | `role="tablist"`, two `btn btn-ghost btn-sm` with `cc-current-underline` (as `cc-mode-toggle`): "Log", "Changes" + `badge badge-sm` count of changed files (hidden at 0; `badge-warning` when conflicts) | tab per project in `codeChartaHistoryTab.<projectId>` |
| Search | `input input-bordered input-sm w-56` placeholder "Search commits", `aria-label` "Search commit messages and hashes", leading `fa-magnifying-glass` | debounced 300 ms; Log tab only |
| Author | `input input-bordered input-sm w-36` placeholder "Author" | same |
| Path | `input input-bordered input-sm w-44 font-mono` placeholder "Path, e.g. src/app" | same |
| Clear filters | `btn btn-ghost btn-xs` "Clear" | only while a filter is set |
| Refresh | `btn btn-ghost btn-sm btn-square fa-rotate`, `title`/`aria-label` "Refresh (F5)" | spins (`fa-spin`) while refreshing |
| H5 | right end, `ml-auto` | — |

While a filter is set: a line under the toolbar `text-xs text-base-content/60 px-2` "Filtered — the
graph is hidden while searching." (plan G6). Narrow: Author and Path collapse into a
`btn btn-ghost btn-sm` "Filters" (`fa-filter`, badge with the count of set filters) opening a popover
(`cc-settings-popover-shell`) holding the two inputs; below `lg` Search shrinks to `w-36`.

## H5 Sync buttons and operation progress

```
idle:      [⇣ Fetch ▾] [↓ Pull 1] [↑ Push 2]
no upstream:[⇣ Fetch ▾] [↓ Pull] [↑ Publish branch]
running:   (spinner) Receiving objects: 45% (2034/4520)        [■ Cancel]
```

- Buttons `btn btn-ghost btn-sm` with icon + text; counts as `badge badge-sm` (`behind` on Pull,
  `ahead` on Push). Titles: "Fetch from all remotes", "Pull 1 commit from origin/main (fast-forward
  only)", "Push 2 commits to origin/main", "Publish 'feature/x' to origin and track it".
- Fetch caret opens a small dropdown (map-selector style): `checkbox checkbox-xs` "Remove branches
  deleted on the remote (prune)", remembered per project.
- Push without anything to push: disabled, title "Nothing to push". Pull with no upstream: disabled,
  title "No upstream branch — set one in the branch menu".
- Detached HEAD: Pull and Push disabled, title "Not on a branch".
- **Running** (any mutating operation of this repository): the three buttons are replaced by
  `loading loading-spinner loading-xs`, the last `git.operationProgress.message` (`text-xs truncate
  max-w-80`, with `done/total` as a `progress progress-primary w-24` when present), and
  `btn btn-ghost btn-xs` "Cancel" (`fa-stop`) for network operations. Every other mutating control of
  the repository is disabled with title "Waiting for the previous git operation…".
- **Results** of network operations: toast (success) "Fetched 3 updated refs", "Already up to date",
  "Pulled 4 commits", "Pushed 2 commits to origin/feature/x", "Published 'feature/x' to origin".
  Failures go to the operation banner (H6), not a toast.

**Data.** `GitOperationService` (running operation, last progress), `git.fetch|pull|push`,
`core.cancel` with the operation id.

## H6 Banners

Stacked under the toolbar, each `mx-2 mt-2`, newest first, at most three visible.

**Problem notice** (`cc-git-problem-notice`): replaces the panes entirely for repository-level
problems (centred block, `max-w-lg`, icon `fa-triangle-exclamation text-warning text-2xl`):

| Code | Text | Action |
|---|---|---|
| `gitNotFound` | "Git was not found. CodeCharta uses the git installed on this computer." | "Open desktop tools" (Global Configuration, area 01) |
| `gitTooOld` | "Git <version> is too old. CodeCharta needs git 2.31 or newer." | same |
| `notARepository` | "'<folder>' is not a git repository." | folder select if another git folder exists |
| `folderNotFound` | "'<folder>' was not found on disk." | "Re-link folder…" (area 03 P5) |
| `dubiousOwnership` | "Git does not trust '<path>' because another user owns it. If you trust it, run this in a terminal:" + copy block `git config --global --add safe.directory <path>` | "Copy command" |
| `bareRepository` | "Bare repositories are not supported." | — |

Copy blocks: `font-mono text-xs bg-base-200 rounded-md px-2 py-1` with a
`btn btn-ghost btn-xs btn-square fa-regular fa-copy` ("Copy command").

**Inline notices** (panel stays usable): `alert px-2 py-1 text-xs` (cluster-explorer style):

| Situation | Tone | Text | Action |
|---|---|---|---|
| shallow clone | info | "Shallow clone: history is cut off, counts are lower bounds." | dismiss (session) |
| merge in progress | warning | "Merging into 'main'. Resolve the conflicts in your editor, stage the files, then commit. 2 files have conflicts." | "Abort merge…", "Refresh" |
| rebase in progress | warning | "Rebasing 'feature/x'. Resolve the conflicts in your editor, stage the files, then continue the rebase in a terminal." | "Abort rebase…", "Refresh" |
| other operation (cherry-pick, revert, bisect) | warning | "A <cherry-pick> is in progress. Finish or abort it in a terminal." | "Refresh" |
| operation failed | error | the `gitErrorText` sentence (below) | "Details" (`<details>` showing `detail` verbatim, `font-mono text-xs whitespace-pre-wrap max-h-40 overflow-auto`), dismiss |
| first page timed out | warning | "The history took too long to load. Running `git commit-graph write --reachable` in the repository makes it faster." | "Retry", copy command |

**Error sentences** (`util/gitErrorText.ts`, one per code; `<…>` filled from the error):

| Code | Sentence |
|---|---|
| `localChangesWouldBeOverwritten` | "Git did not switch: your changes to these files would be overwritten:" + file list (≤ 10, "and n more") |
| `branchCheckedOutElsewhere` | "'<branch>' is checked out in another worktree (<path>)." |
| `branchExists` | "A branch named '<name>' already exists." |
| `indexLocked` | "Another git process is using this repository. Wait for it to finish, then retry." |
| `authenticationRequired` | "Git could not sign in to '<remote>'. Check your credential helper or ssh key; CodeCharta asks only when git asks." |
| `authenticationCancelled` | "Sign-in cancelled. Nothing was changed." |
| `networkUnavailable` | "'<remote>' could not be reached. Check your connection." |
| `identityUnknown` | "Git does not know who you are. Run these in a terminal, then commit again:" + two copy blocks `git config --global user.name "Your Name"` / `git config --global user.email "you@example.com"` |
| `nothingToCommit` | "Nothing to commit. Stage files first." |
| `hookFailed` | "A git hook stopped the operation." (hook output in Details) |
| `notFastForward` | (opens the pull choice, H15) |
| `pushRejected` | "The remote has commits you do not have. Pull first, then push." + "Pull" button |
| `noUpstream` | "'<branch>' has no upstream branch." + "Publish branch" button |
| `conflicts` | becomes the merge/rebase notice |
| `stalePushLease` | "The remote branch moved since you last fetched. Fetch, review, and try again." + "Fetch" button |
| `changedSinceListed` | "The files changed since they were listed. The list is refreshed — check it and try again." |
| `timeout` | "Git did not answer in time." |
| `commandFailed`, others | "Git failed: <message>" |

---

## H7 Branches tree

Pane header as `explorerHeader`: "BRANCHES" + collapse button. Then:

```
[ Filter branches                    ]        input input-bordered input-sm, aria-label "Filter branches"
◉ All branches                                 row; selected = scope All
▾ LOCAL (3)
   ✓ feature/invoice-rounding   ↑2 ↓1          current: fa-check text-primary, font-semibold
     main                       ↓4
   ▸ release/                                  "/" nests (util/branchTree.ts)
     old-experiment             gone           badge badge-warning badge-xs "gone"
▾ REMOTE
   ▾ origin (128)
       main
       feature/invoice-rounding
       … Show all 128                          btn btn-link btn-xs, cap 200 rows
▸ TAGS (42)
```

- Group headers: `text-xs font-semibold uppercase tracking-wide text-base-content/60` with count,
  `fa-caret-down/right`; collapsed state remembered in the layout key.
- Rows: 24 px, `px-2 rounded-md hover:bg-base-200`, icon (`fa-code-branch`, `fa-cloud` for remote
  groups, `fa-tag`), name `truncate` (full ref in `title`, plus "Last commit: <subject>, <relative
  date>"), chips `text-xs tabular-nums text-base-content/60`.
- **Click** = scope the log to that ref (`GitLogScope.Refs`); `bg-primary/20 font-semibold` marks the
  scoped row; "All branches" returns to `All`. Double-click on a local branch = Switch to (H15).
  Ctrl/Shift+click adds refs to the scope.
- Context menu (right-click, Menu key, Shift+F10) = H10 branch menu.
- Worktree branch (checked out elsewhere): `fa-regular fa-folder-open text-base-content/50` after
  the name, title "Checked out in <path>".
- Filter: case-insensitive substring over full names; groups with no hit hide; no hit at all:
  `text-xs text-base-content/60 px-2` "No branch matches 'xyz'."
- Empty states: no branches (fresh repository) "No commits yet."; no remotes: REMOTE group absent;
  no tags: TAGS group absent.
- Keyboard: `role="tree"`; ↑/↓ move, →/← expand/collapse, Enter scopes, Menu opens the context menu.

## H8 Commit list

`role="listbox"`, `tabindex="0"`, `aria-label` "Commits", `aria-activedescendant`. Rows 28 px,
virtualised (plan 4.7). Columns:

```
graph │ subject + ref labels                                          │ ▣ │ author        │ date
 ●─   │ Fix invoice rounding  [feature/x] [☁ origin/feature/x]          │ ▣ │ Mia Chen      │ 2 hours ago
 │●   │ Add currency table                                            │   │ Mia Chen      │ yesterday
```

- **Uncommitted changes row** (when dirty): first row, `fa-pen text-warning` in the graph column,
  "Uncommitted changes (3)" `italic`, no author, no date. Selection item `workingTree`.
- **Graph cell**: inline SVG per row, lane pitch 14 px, dot r 4, `stroke="currentColor"`. Lane colour
  classes in this order: `text-primary`, `text-secondary`, `text-accent`, `text-info`,
  `text-success`, `text-warning`, `text-error`, `text-base-content/60` (see Deviations: not
  `text-neutral`). HEAD commit dot is filled with `base-100` and ringed (stroke 2) so the current
  commit is visible without colour. More than 24 lanes: `+n` `text-xs`.
- **Subject** `truncate min-w-40`: it keeps at least 10 rem before labels take space.
- **Ref labels**, after the subject, `shrink-0`, max 3 (max 1 while the list pane is narrower than
  640 px, a container query `@container` / `@2xl:`) then `badge badge-ghost badge-xs` "+2" (title lists
  all):
  - current branch: `badge badge-primary badge-xs` with `fa-check`;
  - other local branch: `badge badge-outline badge-primary badge-xs`;
  - remote branch: `badge badge-ghost badge-xs` with `fa-cloud`;
  - tag: `badge badge-outline badge-accent badge-xs` with `fa-tag`;
  - `HEAD` when detached: `badge badge-warning badge-xs` "HEAD".
- **Analysed column** (only when area 05's `ANALYSED_COMMITS` port is provided): 24 px; `fa-cube
  text-success` analysed, `loading loading-spinner loading-xs` running, `fa-triangle-exclamation
  text-error` failed; `ring-1 ring-primary rounded-sm` around the icon when that snapshot is the one
  in the map. Titles from area 05.
- Author `truncate w-32` (title: name and e-mail), date `w-28 text-right tabular-nums
  text-base-content/60` relative (title absolute).
- Hover `bg-base-200`; selected `bg-primary/20 font-semibold`; second selection the same plus a left
  `border-l-2 border-primary`.
- **Filtered list**: no graph column; matches of the search text are not highlighted (plain).
- **Paging**: within 100 rows of the end the next page loads; a last row `loading loading-dots
  loading-sm` while loading; on failure the last row is "Could not load more commits." +
  `btn btn-link btn-xs` "Retry".
- **Empty**: no commits "No commits yet."; filter without hits "No commit matches the filter." +
  "Clear filters".
- **Loading first page**: 8 skeleton rows (`skeleton h-4`) instead of a spinner.

**Keyboard** (plan 4.7): ↑/↓ select; Shift+↑/↓ or Ctrl+click set the second selection; Home/End,
PageUp/PageDown; Enter / double-click run the primary commit action (area 05: "Show in map", see
area 05); Ctrl+C copies the full SHA (toast "Copied a1b2c3d"); Menu or Shift+F10 opens the context
menu; Ctrl+F or `/` focuses Search; F5 refreshes; Escape drops the second selection. Handled keys call
`stopPropagation()` (principles §9).

## H9 Commit details

Pane header as `cc-inspector-header` ("DETAILS" + collapse). Content scrolls.

**One commit**

```
Fix invoice rounding                                   (text-base font-semibold, whitespace-pre-wrap)
Rounds half-even as the tax office requires.           (message body, whitespace-pre-wrap, text-sm)

a1b2c3d4e5  ⧉                                          font-mono; copy button "Copy full SHA"
Mia Chen <mia@example.com> · 3 Nov 2026, 14:03          committer line only when different
Parents  9f8e7d6  (link buttons, select that commit)

[▶ Show in map] [⇄ Compare with…]                      contributed actions (areas 05, 06), btn btn-sm

4 files changed  +120 −8                                 text-xs
 M  src/invoice.ts                       +40 −8         letter badge, file name, folder /60, counts
 A  src/currency.ts                      +80
 R  src/old.ts → src/money.ts
 …  and 812 more files (list truncated)
```

- Change letters: `badge badge-xs font-mono` M (`badge-info`), A (`badge-success`), D
  (`badge-error`), R / C (`badge-accent`), T / ? (`badge-ghost`). Binary: counts replaced by "binary".
- Merge commit: line `text-xs text-base-content/60` "Changes compared with the first parent".
- File with a node in the loaded map (`LOADED_MAP_LOCATOR`): the file name is a
  `btn btn-link btn-xs` "Show in map" behaviour (hand over + navigate), `title` "Show
  src/invoice.ts in the map"; otherwise plain text with `title` "Not in the map shown now".
- **Two commits**: both subjects with short SHAs, then "a1b2c3d is 3 commits ahead of and 1 behind
  9f8e7d6" (`git.measureDistances`), then the two-commit actions (area 06 "Compare").
- **Working tree**: "3 changed files: 1 staged, 2 unstaged" + `btn btn-link btn-sm` "Open changes".
- **Nothing selected**: `text-sm text-base-content/60 p-4` "Select a commit to see its details."
- Loading: skeleton lines; error: `alert alert-error text-xs` with the sentence and "Retry".

## H10 Context menus

`cc-floating-menu` + `cc-context-menu-item` (Title Case items, hover hints in `title`).

**Commit menu**

| Item | Icon | Hint | When |
|---|---|---|---|
| (contributed `COMMIT_ACTIONS`, areas 05 and 06) | | | per `isOfferedFor` |
| divider | | | |
| Copy SHA | `fa-regular fa-copy` | "Copy the full commit hash" | always |
| Copy Subject | `fa-regular fa-copy` | "Copy the first line of the message" | always |
| divider | | | |
| Check Out 'main' | `fa-code-branch` | "Switch to this branch" | per local branch at the commit (≤ 3) |
| Check Out 'origin/x' as New Branch… | `fa-cloud` | "Create a local branch that tracks it" | per remote branch at the commit (≤ 3) |
| New Branch Here… | `fa-plus` | "Create a branch at this commit" | always (M8+) |

**Branch menu**

| Branch kind | Items |
|---|---|
| current local | Rename…, Push, Set Upstream…, Compare with… (06) |
| other local | Switch To, New Branch from Here…, Rename…, Delete…, Set Upstream…, Push, Force Push (with Lease)…, Compare with… (06) |
| remote | Check Out as New Local Branch…, New Branch from Here…, Delete from Remote…, Compare with… (06) |
| tag | New Branch from Here…, Compare with… (06) |

Items that cannot run now are shown disabled with the reason in `title` (for example Push: "Nothing to
push"). While an operation runs, all mutating items are disabled ("Waiting for the previous git
operation…").

---

## H11 Changes panel

Left pane of the Changes tab, 360 px (260–640). Header "CHANGES" + `btn btn-ghost btn-xs` "Stage all"
(`fa-plus`) and an overflow `fa-ellipsis` (H17 stash, stretch).

```
▾ CONFLICTED (1)                                   group header, badge-warning count
   U  invoice.ts      src/billing                 [+]
▾ STAGED (2)                                       [Unstage all]
   M  currency.ts     src/billing                 [−] 
   A  money.ts        src/billing                 [−]
▾ CHANGES (3)                                      [Stage all]
   M  app.ts          src                         [+] [↺]
   D  legacy.ts       src/old                     [+] [↺]
▾ UNTRACKED (1)
   ?  notes.md                                    [+] [↺]
──────────────────────────────────────────────
H12 commit box
```

- Rows 28 px: letter badge (as H9, `U` `badge-warning`, `?` `badge-ghost`), file name, folder
  `text-xs text-base-content/60 truncate`; renamed: "old.ts → money.ts". Row buttons appear on
  hover/focus: Stage `fa-plus` ("Stage <file>"), Unstage `fa-minus` ("Unstage <file>"), Discard
  `fa-rotate-left` ("Discard changes to <file>"); `btn btn-ghost btn-xs btn-square`.
- Click selects and shows the diff; Ctrl/Shift+click multi-select; then the group buttons act on the
  selection ("Stage 3 selected"). Conflicted rows have no Discard (title "Use Abort to undo a merge").
- Empty: `text-sm text-base-content/60 p-4` "No changes. The working tree matches the last commit."
- Truncated (> 5 000 entries): `alert alert-warning text-xs` "Showing the first 5 000 changes."
- Keyboard: `role="listbox"` with multi-select; Space stages/unstages the focused row; Delete opens
  Discard; Enter shows the diff.

## H12 Commit box

```
[ Summary                                          52/72 ]   input input-bordered input-sm
[ Description                                            ]   textarea textarea-bordered rows-3
[                                                        ]
☐ Amend last commit                       [ Commit (Ctrl+Enter) ]
```

- Counter `text-xs tabular-nums`, `text-warning` above 72 with title "Long summaries are cut off in
  many git tools". No hard limit.
- "Commit" `btn btn-primary btn-sm`; disabled with title: no staged files ("Stage files to commit"),
  no summary ("Write a summary"), operation running, conflicts present ("Resolve conflicts first").
  Amend enables it without staged files.
- Amend checked with an empty box fills the last message; unchecking restores the draft. Amending a
  commit already on the upstream asks first (H15).
- During a merge: `text-xs text-base-content/60` "This commit concludes the merge."
- After success: box cleared, toast (success) "Committed a1b2c3d". Hook output on failure in the
  operation banner.
- Draft kept per repository (message only).

## H13 Diff view

Right side of the Changes tab. Header `px-2 py-1 border-b border-base-300`: path `font-mono text-sm`,
kind badge ("staged", "unstaged", "untracked", "conflicted"). Body `font-mono text-xs` lines with the
plan's classes (`+` `bg-success/10 text-success`, `-` `bg-error/10 text-error`, `@@` `text-info`,
headers `text-base-content/60`), a line-number gutter as `.cc-source`. States: nothing selected
"Select a file to see its changes."; binary "Binary file — no text diff."; truncated: footer `alert
alert-info text-xs` "Diff cut at 2 MB."; loading skeleton; error alert with "Retry". Read-only: no
editing, no hunk staging.

---

## H14 Branch dialogs

Native dialogs, `modal-box max-w-md`, Title Case titles.

**New Branch** — "Name" input (`font-mono`), live rule messages `text-xs text-error`: "A branch name
cannot start with '-'.", "A branch name cannot contain spaces, '..', '~', '^', ':', '?', '*', '[', '\\' or
'@{'.", "A branch named '<name>' already exists."; read-only "Starts at `a1b2c3d` <subject>";
checkbox "Switch to the new branch" (off). Buttons Cancel / **Create branch** (disabled while invalid).

**Rename Branch** — input prefilled; sentence `text-xs text-base-content/60` "Renames the local branch
'a' to 'b'. Its upstream setting is kept; the remote branch is not renamed." Cancel / **Rename**.

**Set Upstream** — `select` of remote branches + "No upstream"; Cancel / **Set upstream**.

**Check Out as New Local Branch** — name prefilled with the remote branch name; Cancel / **Check out**.

## H15 Confirmations

Destructive ones use the `deleteConfirmDialog` layout (Cancel focused, verb in `btn-error`); the rest
use `ConfirmDialogComponent` (No / Yes) or a choice dialog.

| Action | Dialog | Title | Text | Buttons |
|---|---|---|---|---|
| Switch, working tree dirty | yes/no | "Switch Branch" | "Switch 'billing-api' from 'main' to 'feature/x'? Your 3 changed files stay as they are if git can carry them over; otherwise git refuses and nothing changes." | No / Yes |
| Switch, clean | none | — | switches at once | — |
| Delete local | destructive | "Delete Branch" | "Delete the local branch 'feature/x'? Its commits stay reachable from 'origin/feature/x'." / "…Its commits are not on any other branch and become unreachable." | Cancel / Delete |
| Delete unmerged (after `branchNotFullyMerged`) | destructive | "Delete Unmerged Branch" | "'feature/x' has 2 commits not merged into 'main'. Deleting it anyway makes them unreachable (recoverable only through git reflog)." | Cancel / Delete anyway |
| Delete remote | destructive | "Delete Remote Branch" | "Delete 'feature/x' on remote 'origin'? This removes it for everyone who uses that remote." | Cancel / Delete from remote |
| Discard | destructive | "Discard Changes" | "Discard changes to 'src/a.ts' and 'src/b.ts'? Tracked files return to the last commit; untracked files go to the recycle bin." (≤ 10 names, "and n more") | Cancel / Discard |
| Pull, diverged (`notFastForward`) | choice | "Branches Have Diverged" | "'main' and 'origin/main' have diverged (2 local, 3 remote commits). Choose how to combine them:" | Cancel / Merge / Rebase my commits — no default, focus on Cancel |
| Force push | destructive | "Force Push" | "Replace 'origin/feature/x' (at abc1234) with your 'feature/x' (at def5678)? 2 commits on the remote that are not in your branch are removed from it. The push fails if the remote moved since abc1234." | Cancel / Force push |
| Amend pushed commit | destructive | "Amend Pushed Commit" | "The last commit abc1234 'Subject' is already on origin/main. Amending it rewrites it; pushing afterwards needs a force push." | Cancel / Amend anyway |
| Abort merge / rebase | destructive | "Abort Merge" / "Abort Rebase" | "Abort the merge and return 'main' to the state before the pull? Changes made while resolving are lost." | Cancel / Abort merge |
| First mutating action per repository and session | yes/no | "Git Hooks" | "Git runs this repository's hooks and filters, as it would in a terminal. Continue?" | No / Yes |

Push (no confirmation) and Publish branch (no confirmation; result toast) per plan.

## H16 Credential prompt

**Where.** Mounted in `views/codeCharta.component.html` next to `<cc-error-dialog>`, outside the
router outlet, so it appears over any view. Native dialog, `modal-box max-w-md`,
`aria-labelledby` the title.

```
┌ Git Needs Your Input ─────────────────────────────┐
│ billing-api                                        │  repository label, text-sm text-base-content/60
│ ┌───────────────────────────────────────────────┐ │
│ │ Enter passphrase for /home/mia/.ssh/id_ed25519:│ │  <pre class="whitespace-pre-wrap font-mono text-xs bg-base-200 rounded-md p-2">
│ └───────────────────────────────────────────────┘ │
│ [••••••••••••                                   ] │  type=password (Secret) / text (Text)
│ CodeCharta passes this to git once and does not    │  text-xs text-base-content/60
│ keep it.                                           │
│                               [Cancel] [OK]        │
└────────────────────────────────────────────────────┘
```

- `Confirm` kind (host key): no input; the message (fingerprint) in the `<pre>`; buttons **No** /
  **Yes**; focus on No.
- Escape and the backdrop = Cancel (→ `prompt.cancel`; the operation fails with
  `authenticationCancelled`, banner H6). Enter = OK.
- Initial focus: the input. The input is cleared right after `prompt.answer`.
- `prompt.closed` for the open prompt closes the dialog without an answer (operation ended).
- Several prompts queue; the title adds "(1 of 2)" when more wait.
- Long messages wrap; the `<pre>` scrolls at `max-h-48`.

## H17 Stash (stretch, M12)

Changes header overflow (`fa-ellipsis`, "More actions") → floating menu: "Stash All Changes…"
(dialog: "Message" input, checkbox "Include untracked files", Cancel / **Stash**), "Stashes…" (list
dialog as `scenarioListDialog`: rows "stash@{0} WIP on main: …", row button "Pop", `btn-sm`). Pop
conflict → the merge notice of H6 with text "Popping the stash caused conflicts. Resolve them, stage
the files, then commit. The stash is kept."

---

## Deviations from the plan

1. **Tab availability.** Plan: History shown whenever a project is active. Design: only when the
   project has at least one git folder; a History tab that can only say "not a repository" is noise.
2. **No mode bar for History** is plan text; the design adds that the handle under the view switcher
   is not drawn while History is active (otherwise it opens an empty bar).
3. **Folder select = active folder.** The toolbar select calls `ProjectsService.setActiveFolder`
   (area 03 deviation 3) instead of a History-only `GitRepositoryService.selectFolder` state.
4. **Mutating failures go to a banner, not a toast.** Plan: "toast with the sentence and Details".
   `ToastService` has no actions and closes after 5 s, so "Details" and buttons like "Pull" cannot
   live there. Failures show as an error notice in H6 (dismissible, with Details); successes stay
   toasts.
5. **Switch confirmation only when dirty.** Plan quotes the switch sentence without a condition. A
   confirmation on a clean switch has nothing to warn about; the sentence is shown only when there are
   changed files.
6. **Lane colours** replace `text-neutral` by `text-base-content/60`: daisyUI `neutral` is close to
   the surface in dark themes and would hide a lane in the default theme.
7. **Two-pane collapse** below 1280 px and the narrow-toolbar Filters popover are additions; the plan
   gives fixed widths that leave the commit list under 400 px at 1024 px.
8. **Branch rows: click scopes, double-click switches.** The plan lists actions but not the click
   meaning; this follows Rider.

## Proposed changes to existing UI (not assumed approved)

1. `viewSwitcher.component.html`: skip the mode-bar handle when the active tab has no modes. Needed so
   History does not show an empty bar; no change for the three existing tabs.
2. `nodeContextMenu` jump targets exclude History (plan 4.7); no visible change.
