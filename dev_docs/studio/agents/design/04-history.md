# 04 — History view and git workflow: interface design

Plan: `04-git-branches-and-history.md` (sections 3, 4.7, 4.8, milestones M3–M12).
Principles: `00-design-principles.md`. Desktop only. Mock-up: `mockups/studio-screens.html`
(section "History"; also published as the review page).

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| H1 | History tab | entry in `VIEW_TABS` | nav bar centre | the three existing tabs |
| H2 | (branch chip merged into `05-snapshots.md` W1) | — | — | — |
| H3 | History view frame | `cc-history-view` → `cc-git-history-panel` | new route `history` | metrics view (explorer left, inspector right) |
| H4 | Toolbar | `cc-history-toolbar` | top of H3 | explorer search bar, `cc-mode-toggle` |
| H5 | Contextual sync button | `cc-sync-button` | H4, W1, P3 | `join` split button, after Zed |
| H6 | Problem notices and lasting-state banners (failures are toasts) | `cc-git-problem-notice`, operation-state banner | under H4 | `explorerFocusBanner`, cluster explorer alert |
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

## H2 Branch chip (merged into W1)

The branch, ahead/behind, dirty state and running git operations show in the workspace status
element, `05-snapshots.md` W1 (owner decision OD2). Its dropdown's "Open History" and the History tab
lead here. No separate `cc-current-branch-chip`.

## H3 History view frame

Host `block h-[calc(100vh-var(--cc-bars-height))] overflow-hidden bg-base-100` (no bottom bar, no
metrics bar, no legend). Layout, all in-flow (not fixed panes):

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ H4: Repository billing-api  on ⎇ feature/invoice-rounding  [↓ Pull ↓1 ↑2 | ▾]                    Log | Changes 3   [⟳] │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ H6 banners (only when needed)                                                                       │
├──────────────────┬───────────────────────────────────────────────────────────┬─────────────────────┤
│ BRANCHES       « │ COMMITS  [All branches]                               (?) │ DETAILS           » │
│ [Filter branches]│ [🔍 Search messages and hashes ] [Author ] [Path       ]   │ Fix invoice rounding│
│ ◉ All branches   │ GRAPH  COMMIT                         ANALYSIS AUTHOR DATE │ a1b2c3d  ⧉          │
│ ▾ LOCAL          │ ┆○  Uncommitted changes (3)                              │ Mia Chen · 3 Nov    │
│   ✓ feature/x ↑2 │ ◉   Fix invoice rounding (feature/inv…) (origin/f…)  …     │ …message…           │
│     main         │ ●╮  Merge branch 'main' into feature/x                     │ 4 files  +120 −8    │
│ ▾ REMOTE         │ ● │ Add currency table                                     │ modified invoice.ts │
│   ▸ origin       │ │ ● Release 2.4.0 (main) (v2.4.0)              analysed  │ added    currency.ts│
│ ▸ TAGS (42)      │ ●─╯ Start the invoice module                    in map   │                     │
└──────────────────┴───────────────────────────────────────────────────────────┴─────────────────────┘
   260 px (180–480)                                                              380 px (280–640)
```

- Three panes, each with its own header in the explorer's header style. Each pane holds the controls
  that act on it: the branch filter sits in BRANCHES, the commit search and filters sit in COMMITS
  (H8), so nothing in the top toolbar filters a list.
- Panes are **islands** (`02-themes.md` proposed change 1): the view body is `bg-base-200 p-1.5 gap-1.5`,
  each pane `rounded-[10px] bg-base-100 overflow-hidden`, no border lines; widths via `ccColumnResizeHandle`
  (double-click resets, arrow keys move, as the explorer). Widths remembered in
  `codeChartaHistoryLayout`.
- Both side panes collapse like the explorer: header button `btn btn-ghost btn-xs btn-square`
  `fa-angle-double-left` "Collapse branches" / `fa-angle-double-right` "Collapse details"; collapsed
  = a 2.5 rem strip with the expand button (`fa-code-branch` "Expand branches", `fa-circle-info`
  "Expand details"). Below `xl` (1280 px) both start collapsed unless the user expanded them before.
- Tabs **Log** and **Changes** sit at the right of the toolbar (H4). The Changes tab replaces the three
  panes with H11 + H13.
- **Keep-alive.** The view keeps scroll, selection and filters across view switches (route reuse).
- **Window focus** refreshes (throttled, plan G5); no visual change unless something changed.

## H4 Toolbar

One row, `flex items-center gap-2 px-2 py-1 border-b border-base-300 min-h-10 whitespace-nowrap`.
Left to right, the toolbar answers "which repository, which branch, in sync?"; it holds no filters.

| Control | Look | Behaviour |
|---|---|---|
| Repository | caption `text-xs text-base-content/60` "Repository", then the working folder's label `font-medium` with `fa-code-branch`, as plain text (no select). | A **repository** is the working folder of the project when it is a git clone (project 'billing' has folders 'billing-api', 'billing-web'); it is *not* a branch or a commit. It is chosen in the project menu (`03-projects.md` P1), not here; `title` "Folder C:\work\billing-api of project 'billing' — change it in the project menu". |
| Current branch | `text-sm` "on" + `fa-code-branch` + branch name `font-medium truncate max-w-56` (+ `badge badge-warning badge-xs` "merging" / "rebasing"); detached: "at `a1b2c3d` (detached)" | read-only; click scopes the commit list to that branch (as clicking it in H7) |
| Sync | H5, one contextual split button directly after the branch | — |
| Tabs | `ml-auto`, `role="tablist"`, two `btn btn-ghost btn-sm` with `cc-current-underline` (as `cc-mode-toggle`): "Log", "Changes" + `badge badge-sm` count of changed files (hidden at 0; `badge-warning` when conflicts) | tab per project in `codeChartaHistoryTab.<projectId>` |
| Refresh | `btn btn-ghost btn-sm btn-square fa-rotate`, `title`/`aria-label` "Refresh (F5)" | spins (`fa-spin`) while refreshing |

Narrow (< 1280 px): the "Repository" caption and the word "on" hide; the branch name shrinks to
`max-w-32`; the sync button drops its label and keeps icon + counts (title unchanged).

## H5 Sync button (contextual, after Zed)

One split button `cc-sync-button` replaces three buttons (owner decision OD3). It is modelled on Zed's
git sync button: the main part does the one thing the branch needs now, the caret lists the rest.
The same component appears in the History toolbar (after the current branch), in W1's GIT section and
on the project overview's working-folder card. Commit is not part of it; it stays in the Changes tab
(H11, H12).

```
nothing to do:   [ ⟳ Fetch        | ▾ ]
behind:          [ ↓ Pull    ↓3   | ▾ ]
ahead:           [ ↑ Push    ↑2   | ▾ ]
diverged:        [ ↓ Pull  ↓1 ↑2  | ▾ ]     pull first; a push would be rejected
no upstream:     [ ☁ Publish      | ▾ ]
running:         [ ◌ Pulling 45 % | ■ ]     progress fill as W1; caret becomes Cancel
```

- `join`: main `btn btn-sm btn-outline border-base-300 join-item gap-1.5 font-normal` with `fa-fw`
  icon, label, counts (`text-xs tabular-nums`, arrows as `fa-arrow-down`/`fa-arrow-up`); caret
  `btn btn-sm btn-outline border-base-300 join-item btn-square` (`fa-caret-down`, `aria-label` "More
  sync actions").
- **Main action**, first match wins:

| Branch state (`GitStatus`) | Label | Icon | `title` |
|---|---|---|---|
| detached HEAD | Fetch | `fa-rotate` | "Fetch from all remotes" |
| no upstream | Publish | `fa-cloud-arrow-up` | "Publish 'feature/x' to origin and track it" |
| upstream gone | Fetch | `fa-rotate` | "origin/feature/x no longer exists — set another upstream in the menu" |
| behind > 0 (also when ahead) | Pull | `fa-arrow-down` | "Pull 3 commits from origin/feature/x (fast-forward only)"; diverged: "The branch has diverged: pull first, then push" |
| ahead > 0 | Push | `fa-arrow-up` | "Push 2 commits to origin/feature/x" |
| otherwise | Fetch | `fa-rotate` | "Fetch from all remotes (last fetched 12 min ago)" |

- **Caret menu** (floating menu, `cc-context-menu-item` rows; items that cannot run are disabled with
  the reason in `title`): Fetch · Fetch and Remove Deleted Branches · Pull · Push · Publish Branch (no
  upstream only) · Force Push (with Lease)… · Set Upstream…. Pull on diverged branches opens the pull
  choice (H15).
- **During a merge or rebase** (`operationInProgress`): Pull, Push, Publish and Force Push are disabled
  with title "Finish or abort the merge first." (rebase: "…the rebase…"); the main part shows Fetch,
  which stays allowed (O9.6). The same rule holds in every place that offers these actions, the
  branch context menu (H10) included (O11.1).
- **Other disabled reasons** (wording approved, O9.6): detached HEAD "HEAD is detached: switch to a
  branch first."; no remote "This repository has no remote."; Pull stays **enabled** at "nothing behind",
  because the counts come from the last fetch and the remote may have moved since: git then answers
  and the toast says "Already up to date" (O11.1, replaces the earlier "Nothing to pull" reason); Force Push when nothing on the remote would be
  replaced "Nothing on the remote would be replaced." Pushing a non-current branch without upstream
  is offered as **Publish 'x'** instead of a disabled Push.
- **Running** (any mutating operation of this repository): **no spinner and no progress fill here**
  (owner decision, 2026-11-18): the workspace status element at the top already shows the activity
  and its progress, so repeating it would be noise. The main part keeps the action's static icon,
  reads "Fetching…" / "Pulling…" / "Pushing…" and is disabled; the caret becomes **Cancel** (static
  `fa-stop`, `aria-label` "Cancel the pull", network operations only). Every other mutating control of
  the repository is disabled with title "Waiting for the previous git operation…". The same holds where
  the button appears in W1's dropdown and on the project overview.
- **Results**: toast (success) "Fetched 3 updated refs", "Already up to date", "Pulled 3 commits",
  "Pushed 2 commits to origin/feature/x", "Published 'feature/x' to origin"; the button relabels from the
  new status. **Failures are error toasts** (owner decision, open question 5): they stay until dismissed
  and carry "Details" (git's full message) plus, where the sentence table names one, a follow-up
  action ("Pull", "Fetch", "Publish branch"). See principles §3 "Toasts".
- Narrow (< 1280 px): the label hides, icon and counts stay; the title is unchanged.

**Data.** `GitRepositoryService.status()` (`head`, `upstream.ahead/behind/isGone`), `refs()`;
`GitOperationService` (running operation, last progress); `git.fetch|pull|push`, `core.cancel`.

## H6 Banners

Stacked under the toolbar, each `mx-2 mt-2`, newest first, at most three visible.

**Problem notice** (`cc-git-problem-notice`): replaces the panes entirely for repository-level
problems (centred block, `max-w-lg`, icon `fa-triangle-exclamation text-warning text-2xl`):

| Code | Text | Action |
|---|---|---|
| `gitNotFound` | "Git was not found. CodeCharta uses the git installed on this computer." | "Open desktop tools" (Global Configuration, area 01) |
| `gitTooOld` | "Git <version> is too old. CodeCharta needs git 2.31 or newer." | same |
| `notARepository` | "'<folder>' is not a git repository." | one other git folder in the project: "Work in '<label>'" (switches the working folder, as P1 does, but the History stays the active view — no jump to the overview, O9.2); several: "Choose working folder…" (opens P1) |
| `folderNotFound` | "'<folder>' was not found on disk." | "Re-link folder…" (area 03 P5) |
| `dubiousOwnership` | "Git does not trust '<path>' because another user owns it. If you trust it, run this in a terminal:" + copy block `git config --global --add safe.directory <path>` | "Copy command" |
| `bareRepository` | "Bare repositories are not supported." | — |

Copy blocks: `font-mono text-xs bg-base-200 rounded-md px-2 py-1` with a
`btn btn-ghost btn-xs btn-square fa-regular fa-copy` ("Copy command"); after copying the icon becomes
`fa-check` for 2 s. One shared component (`cc-copy-command`) for notices and toasts.

`notARepository` never offers a folder select of its own: the working folder is chosen only in the
project menu (OD1, deviation 3). The buttons above change the working folder through the same call
as P1, so History, W1 and the map follow it together.

**Inline notices** (panel stays usable): `alert px-2 py-1 text-xs` (cluster-explorer style):

| Situation | Tone | Text | Action |
|---|---|---|---|
| shallow clone | info | "Shallow clone: history is cut off, counts are lower bounds." | dismiss (session) |
| merge in progress | warning | "Merging into 'main'. Resolve the conflicts in your editor, stage the files, then commit. 2 files have conflicts." | "Abort merge…", "Refresh" (actions on their own line under the text, left-aligned, so nothing at the right end can be covered) |
| rebase in progress | warning | "Rebasing 'feature/x'. Resolve the conflicts in your editor, stage the files, then continue the rebase in a terminal." | "Abort rebase…", "Refresh" |
| other operation (cherry-pick, revert, bisect) | warning | "A <cherry-pick> is in progress. Finish or abort it in a terminal." | "Refresh" |
| first page timed out | warning | "The history took too long to load. Running `git commit-graph write --reachable` in the repository makes it faster." | "Retry", copy command |

Failed git operations are **not** shown here; they are error toasts (below and principles §3).

**Error sentences** (`util/gitErrorText.ts`, one per code; `<…>` filled from the error). Every failed
git operation shows its sentence as an **error toast** (owner decision, open question 5): it stays
until dismissed, has a "Details" button that expands git's verbatim `detail` inside the toast
(`font-mono text-xs whitespace-pre-wrap max-h-40 overflow-auto`), the follow-up button named in the
table (at most one), and the close button. Successes stay ordinary 5 s toasts. Commands the user
must run (`identityUnknown`) are copy blocks in the toast body, always visible, not hidden in Details:
`ToastService.show(text, "error", { commands: string[] })` renders each as `cc-copy-command`
(principles §3).

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
| `conflicts` (commit) | "Git did not commit: some files still have conflicts. Resolve them in your editor, stage them, then commit." (Commit is normally disabled first; this covers a race) |
| `conflicts` (pull, merge, stash pop), started in the History | no toast: the merge/rebase notice appears in the History and says everything (O9.6). Stash pop: success-style info toast "The stash was kept because of conflicts." |
| `conflicts`, started outside the History (W1, P3) | "Git stopped on conflicts in <n> files. Finish or abort the merge in the History." + "Open History" button (O9.7) |
| `operationInProgress` | "A <merge / rebase / cherry-pick / revert / bisect> is in progress. Finish or abort it first." |
| `outputTooLarge` | not a toast: the diff view's "too large" state (H13) |
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

**Pane header** (`px-2 py-2 border-b border-base-300 flex flex-col gap-2`):

```
COMMITS  [All branches]                                                    (?)
[🔍 Search messages and hashes          ] [Author        ] [Path, e.g. src/app ]  [Clear]
```

- "COMMITS" in the explorer header style, then the **scope chip**: `badge badge-ghost badge-sm`
  "All branches", or the scoped refs from H7 ("feature/invoice-rou…" with a `fa-xmark` button
  "Show all branches"). The chip shows what the list is limited to, next to the list.
- The three filters belong to this pane and filter **only the commit list** (`git.log` filter): the
  branches tree has its own filter, the Changes tab is not filtered. Inputs `input input-bordered
  input-sm`: Search `flex-1 min-w-40` (leading `fa-magnifying-glass`, placeholder "Search messages and
  hashes", `aria-label` the same), Author `w-36` ("Author"), Path `w-44 font-mono` ("Path, e.g.
  src/app"); each has `title` "Filters the commit list". Debounced 300 ms. "Clear" `btn btn-ghost
  btn-xs` while any filter is set.
- While a filter is set: line `text-xs text-base-content/60` "Filtered — the graph is hidden while
  searching." (plan G6).
- Narrow pane (< 640 px, container query): Author and Path collapse into `btn btn-ghost btn-sm`
  "Filters" (`fa-filter`, badge with the number set) opening a popover with the two inputs.
- **(?)** `btn btn-ghost btn-xs btn-square fa-circle-question` "How to read the commit list" opens the
  graph legend popover (below).

**Column header** (sticky, `z-10 bg-base-100 text-xs uppercase tracking-wide text-base-content/60`,
28 px): "Graph", "Commit", "Analysis", "Author", "Date". The Analysis column exists only when area
05's `ANALYSED_COMMITS` port is provided.

**Rows.** `role="listbox"`, `tabindex="0"`, `aria-label` "Commits", `aria-activedescendant`. Rows 28
px, virtualised (plan 4.7), CSS grid with the same columns as the header.

```
GRAPH  COMMIT                                                     ANALYSIS     AUTHOR      DATE
┆○     Uncommitted changes (3)
◉      Fix invoice rounding  (✓ feature/invoice-rou…) (☁ origin/fe…)  analysing 42 %  Mia Chen  2 hours ago
●╮     Merge branch 'main' into feature/invoice-rounding                           Mia Chen  2 days ago
● │    Add currency table                                                          Mia Chen  3 days ago
│ ●    Release 2.4.0  (main) (v2.4.0)                              analysed       Jo Park   5 days ago
●─╯    Start the invoice module                                    analysed·in map Jo Park  1 week ago
```

- **Uncommitted changes row** (when dirty): first row; in HEAD's lane a dashed hollow circle
  (`stroke-dasharray="2 2"`) joined to the HEAD commit below by a dashed line, so it reads as "changes
  on top of this commit". Text "Uncommitted changes (3)" `italic`, no author, no date. Selection item
  `workingTree`.
- **Graph cell**: inline SVG per row, lane pitch 14 px, row 28 px, dot r 4, `stroke-width 2`,
  `stroke="currentColor"`. Edges per plan 4.8: a lane line runs from the top edge to the dot when a
  child waits for this commit, and from the dot to the bottom edge toward the first parent; a merge
  opens a curve from its dot down into the second parent's lane; a fork point receives a curve from
  the other lane's top into its dot; every other open lane passes straight through. Lane colours
  are eight CSS variables `--cc-lane-1` … `--cc-lane-8`, set per theme next to the daisyUI tokens,
  ordered so neighbouring lanes never share a hue. Dark themes map them to tokens: primary, accent,
  success, secondary, warning, info, error, `base-content/60`. Light themes use darker fixed values,
  because cc-light's primary, secondary and info are three similar blues and its success and warning
  are pale on white: `#0374c9` (blue, the cc-light primary; VS Light and Rider Day use their own
  primary), `#c2410c` (orange), `#15803d` (green), `#7e22ce` (purple), `#b91c1c` (red), `#0f766e`
  (teal), `#b45309` (amber), `#6b7280` (grey); each is at least 3:1 against `base-100`. **HEAD** (the checked-out commit) is drawn as a
  ring (fill `base-100`, stroke 2) with a second outer ring, so it is recognisable without colour.
  More than 24 lanes: `+n` `text-xs`. The worked example in `mockups/studio-screens.html` draws these
  rows.
- **Subject** `truncate min-w-40`: it keeps at least 10 rem before labels take space.
- **Ref labels** after the subject, `shrink-0`, max 3 (max 1 while the pane is narrower than 640 px)
  then `badge badge-ghost badge-xs` "+2" (title lists all). A label never cuts off: it is an
  `inline-flex badge badge-xs max-w-40 gap-1` whose icon stays and whose name is an inner
  `<span class="truncate">`, so a long name ends in "…" inside the rounded badge
  ("feature/invoice-rou…") and the full ref is in `title`:
  - current branch: `badge-primary` with `fa-check`;
  - other local branch: `badge-outline badge-primary` with `fa-code-branch`;
  - remote branch: `badge-ghost` with `fa-cloud`;
  - tag: `badge-outline badge-accent` with `fa-tag`;
  - `HEAD` when detached: `badge-warning` "HEAD".
- **Analysis column** (6.5 rem): a worded `badge badge-soft badge-xs`, never a bare icon — the column
  says what the analysis state of that commit is:

  | State | Badge | `title` |
  |---|---|---|
  | analysed | `badge-success` "analysed" | "Analysed 3 Nov 14:10" (+ " — other profile" / " — imported map, analysis time unknown") |
  | analysed and shown in the map now | `badge-primary` "in map" | "This analysis is shown in the map" |
  | queued | `badge-ghost` "queued" | "Waiting for another analysis to finish" |
  | running | `badge-info` "42 %", static (no spinner: the workspace status animates) | "Analysis running" |
  | failed | `badge-error` "failed" | "Analysis failed: <message>" |
  | not analysed | empty cell | — |

- Author `truncate` (title: name and e-mail), date `text-right tabular-nums text-base-content/60`
  relative (title absolute).
- Hover `bg-base-200`; selected `bg-primary/20 font-semibold` plus a 1 px inset outline
  `outline outline-1 -outline-offset-1 outline-primary/60`, so the selection still reads on white where
  a 20 % tint is faint; second selection the same plus a left `border-l-2 border-primary`.
- **Filtered list**: no graph column; matches of the search text are not highlighted (plain).
- **Paging**: within 100 rows of the end the next page loads; a last row `loading loading-dots
  loading-sm` while loading; on failure the last row is "Could not load more commits." +
  `btn btn-link btn-xs` "Retry".
- **Empty**: no commits "No commits yet."; filter without hits "No commit matches the filter." +
  "Clear filters".
- **Loading first page**: 8 skeleton rows (`skeleton h-4`) instead of a spinner.

**Graph legend popover** (from "(?)", `cc-settings-popover-shell`, `w-80 p-3 text-sm`), drawn with the
same SVG pieces:

| Mark | Meaning |
|---|---|
| ● dot | a commit |
| ◉ ringed dot | HEAD — the commit your folder has checked out |
| ┆○ dashed circle | your uncommitted changes, on top of HEAD |
| coloured line | a line of development; a line that splits off is a branch, two lines joining at a dot is a merge |
| ( ✓ name ) filled badge | the branch you are on |
| ( name ) outlined badge | another local branch |
| ( ☁ name ) grey badge | a branch on a remote (origin) |
| ( 🏷 name ) | a tag |
| analysed / in map / failed | whether CodeCharta has an analysis of that commit, and whether the map shows it |

**Keyboard** (plan 4.7): ↑/↓ select; Shift+↑/↓ or Ctrl+click set the second selection; Home/End,
PageUp/PageDown; Enter / double-click run the primary commit action ("Show in map", area 05 S5);
Ctrl+C copies the full SHA (toast "Copied a1b2c3d"); Menu or Shift+F10 opens the context menu;
Ctrl+F or `/` focuses Search; F5 refreshes; Escape drops the second selection. Handled keys call
`stopPropagation()` (principles §9).

## H9 Commit details

Pane header as `cc-inspector-header` ("DETAILS" + collapse). Content scrolls.

**One commit**

```
Fix invoice rounding                                   (text-base font-semibold, whitespace-pre-wrap)
Rounds half-even as the tax office requires.           (message body, whitespace-pre-wrap, text-sm)

a1b2c3d4e5  ⧉                                          font-mono; copy button "Copy full SHA"
Author     Mia Chen <mia@example.com> · 3 Nov 2026, 14:03
Committer  Lin Wu <lin@example.com> · 4 Nov 2026, 09:12   only when name, email or date differ
Parents    9f8e7d6  (link buttons, select that commit)

↺ Not analysed — nearest is 9f8e7d6, 4 commits older   resolution line (area 05 S10)
[▦ Show in map] [▶ Analyse this commit] [⇄ Compare with…]   btn btn-sm gap-2, fa-fw icons

CHANGED FILES  4 files  +120 −8                          text-xs
 modified  invoice.ts      src/billing      +40 −8      worded change badge, file name, folder /60
 added     currency.ts     src/billing      +80
 renamed   old.ts → money.ts  src/billing
 …  and 812 more files (list truncated)
```

- Action buttons: `btn btn-sm gap-2`, the Font Awesome icon a direct child with `fa-fw` (fixed width,
  vertically centred by the button's `inline-flex items-center`), no margins on the icon. Same rule for
  every icon + text button in all areas (principles §5).
- **Change type** is a worded `badge badge-soft badge-xs w-16 justify-center` (fixed width so file
  names line up), never a bare letter: "added" (`badge-success`), "modified" (`badge-info`),
  "deleted" (`badge-error`), "renamed" / "copied" (`badge-accent`), "type" (`badge-ghost`, title "File
  type changed, e.g. file to symlink"). Binary: counts replaced by "binary".
- **Meta rows** (Author, Committer, Parents): `grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 text-sm`,
  the label `text-xs text-base-content/60`, the value `truncate` with the full text in `title`. Dates
  absolute with relative `title`. A rebased or cherry-picked commit is the usual case for a Committer
  row; it is left out when name, email and date all match the author.
- Merge commit: line `text-xs text-base-content/60` "Changes compared with the first parent".
- File with a node in the loaded map (`LOADED_MAP_LOCATOR`): the file name is a
  `btn btn-link btn-xs` that shows it in the map (hand over + navigate), `title` "Show
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
   conflict  invoice.ts   src/billing             [+]
▾ STAGED (2)                                       [Unstage all]
   modified  currency.ts  src/billing             [−]
   added     money.ts     src/billing             [−]
▾ CHANGES (3)                                      [Stage all]
   modified  app.ts       src                     [+] [↺]
   deleted   legacy.ts    src/old                 [+] [↺]
▾ UNTRACKED (1)
   untracked notes.md                             [+] [↺]
──────────────────────────────────────────────
H12 commit box
```

- Selection looks as in H8 (`bg-primary/20` plus the 1 px inset outline), for every list in the
  History, not only commit rows (O9.2).
- Rows 28 px: worded change badge (as H9, plus "conflict" as a solid `badge badge-warning badge-xs`,
  not soft, so it stands out in light themes, and "untracked" `badge-ghost`), file name, folder
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
- After success: box cleared, toast (success) "Committed a1b2c3d". A failing hook gives an error
  toast "A git hook stopped the commit." whose "Details" shows the hook's output.
- Draft kept per repository (message only).

## H13 Diff view

Right side of the Changes tab. Header `px-2 py-1 border-b border-base-300`: path `font-mono text-sm`,
kind badge ("staged", "unstaged", "untracked", "conflicted"). Body `font-mono text-xs` lines with the
plan's classes (`+` `bg-success/10 text-success`, `-` `bg-error/10 text-error`, `@@` `text-info`,
headers `text-base-content/60`), a line-number gutter as `.cc-source`. States: nothing selected
"Select a file to see its changes."; binary "Binary file — no text diff."; truncated: footer `alert
alert-info text-xs` "Diff cut at 2 MB."; too large (`outputTooLarge`, over 4 MB): centred
`text-sm text-base-content/60` "This diff is too large to show (over 4 MB). Run this in a terminal to
see it:" + copy block `git diff -- <path>` (staged: `git diff --cached -- <path>`; untracked: `git diff
--no-index -- /dev/null <path>`, on Windows `NUL` instead of `/dev/null`, O9.2); loading skeleton; error alert with "Retry". Read-only: no
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
3. **No folder select in History.** The working folder is chosen in the project menu (OD1); the
   toolbar names it, and `GitRepositoryService` follows `ProjectsService.workingFolder()` instead of
   keeping its own `selectFolder` state.
4. **Git failures are error toasts that stay until dismissed** (owner decision, open question 5), as
   the plan says ("toast with the sentence and Details"). Because today's `ToastService` closes every
   toast after 5 s and has no buttons, it gains error toasts that do not time out, a "Details"
   expansion and one optional action (principles §3 "Toasts"). The H6 banners keep only lasting states
   (merge or rebase in progress, shallow clone, slow first page).
5. **Switch confirmation only when dirty.** Plan quotes the switch sentence without a condition. A
   confirmation on a clean switch has nothing to warn about; the sentence is shown only when there are
   changed files.
6. **Lane colours** are their own per-theme variables instead of the plan's token list (which used
   `text-neutral`, close to the surface in dark themes). In cc-light three tokens are similar blues and
   two are pale on white (implementation finding, 04-M4).
7. **Two-pane collapse** below 1280 px and the narrow-toolbar Filters popover are additions; the plan
   gives fixed widths that leave the commit list under 400 px at 1024 px.
8. **Branch rows: click scopes, double-click switches.** The plan lists actions but not the click
   meaning; this follows Rider.

9. **Uncommitted changes join the graph.** Plan 4.7 gives the working-tree row no graph lane. The
   design draws a dashed circle in HEAD's lane linked to HEAD, so the row reads as changes on top of
   the checked-out commit (owner review, 2026-11-18).
10. **Filters live in the commit pane, sync next to the branch.** The plan puts search, author, path
    and the sync buttons in one toolbar; the owner review found it unclear what the filters act on.
    Filters now sit in the COMMITS pane header (they filter only that list), and Fetch / Pull / Push sit
    next to the repository and current branch they act on.
11. **Words instead of letters and icons.** Plan 4.7 shows change letters (`M A D R U ?`) and icon-only
    analysis markers; the owner review could not tell what they meant. Both are worded badges now
    ("modified", "analysed", "in map"), plus a graph legend behind "(?)".
12. **The repository select is always visible** (as plain text with one git folder), labelled
    "Repository", so it is never mistaken for a branch or commit picker.
13. **No branch chip; one sync button (owner decisions OD2, OD3).** Plan 4.7's `cc-current-branch-chip`
    is part of the workspace status element (`05-snapshots.md` W1); Fetch, Pull, Push and Publish are
    one contextual split button (H5) instead of three buttons.

## Proposed changes to existing UI (not assumed approved)

1. `viewSwitcher.component.html`: skip the mode-bar handle when the active tab has no modes. Needed so
   History does not show an empty bar; no change for the three existing tabs.
2. `nodeContextMenu` jump targets exclude History (plan 4.7); no visible change.
