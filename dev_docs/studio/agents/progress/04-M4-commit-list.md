---
name: 04-M4 commit list with graph, filters, details
state: progress
version: 1
---

## Goal

The heart of the History view: the commit list with its lane graph, paged and virtualised, filters by
text, author and path, and commit details with changed files (plan 04, section 5, M4).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M4. Branched from `feature/studio-stack` (04-M3
History view merged). Design overrides the plan's UI: `design/04-history.md` (H4 toolbar, H8 commit list
with graph, H9 commit details; "Deviations from the plan"), `design/00-design-principles.md`, mock-up
`design/mockups/studio-screens.html`. OD1: History follows the working folder — the plan's "folder picker
hidden for one repository" does not apply (no folder picker in History). The changelog sentence must not
claim a branch in the top bar (that is W1, area 05).

From `04-M3-history-view.md`: extend `GitLogService` (has `scope`, `scopeTo`) with pages, filters and graph
rows; `GitApiService.log` exists; list goes under the COMMITS header and scope chip in
`gitHistoryPanel.component.html`; restart at page one when `GitRepositoryService.refs()` changes; the fake
answers `git.log` from `git[folderId].commits` as one page (extend it for paging if tests need it — factory
body stays self-contained); builders in `services/gitApi.mocks.ts`, test bed in
`services/gitHistoryTestBed.mocks.ts`; anything from projects or globalSettings must come in through the view
as an output (no import cycles). Core methods from 04-M2: `git.log` (500 per page, opaque `nextCursor`,
`LOG_SESSION_EXPIRED`), `git.commitDetails`, `git.changedFiles`; `isGraphAvailable` false with a filter. The
Analysed column stays hidden without a provider (05-M4 adds the provider later).

Parallel work note: 05-M4 (snapshots/analyse UI) and 02-M7 (metrics bar) run at the same time.

1. Graph layout
2. Graph row geometry and cell
3. Virtual window helper
4. Log service, ref labels, dates
5. Commit list and rows
6. History toolbar filters
7. Commit details

## Steps

- [x] 1. Graph layout
- [x] 2. Graph cell
- [x] 3. Virtual window
- [x] 4. Log service
- [x] 5. Commit list
- [x] 6. Toolbar filters
- [x] 7. Commit details

## Notes

Environment (2026-11-19): Arch Linux, node 26.13, npm 12.2. Branch `feature/studio-04-m4` from `feature/studio-stack`
(`3e549a2e7`).

### 1. Graph layout
- `util/graphLayout.ts`: `layoutGraph(commits, state)`, `EMPTY_GRAPH_STATE`, `GraphLayoutState`, `GraphRow` as plan 4.8.
- **Design over plan (step 4).** Plan 4.8 step 4 joins a first parent into a lane that already waits for it at the
  child's row. Design H8 ("a fork point receives a curve from the other lane's top into its dot") and the mock-up
  (the "Start the invoice module" row receives the curve) join lanes at the fork point instead. So a commit always
  keeps its lane for its first parent; several lanes may wait for one SHA and step 2 merges them into the fork's dot.
  The plan's test "branch tip opens a second lane and joins at the fork" holds as written.
- **Uncommitted changes in the graph (design deviation 9).** `stateWaitingForHead(headSha)` starts the layout with
  lane 0 waiting for HEAD in the colour `WORKING_TREE_COLOR` (-1), so the dashed line from the uncommitted-changes
  row passes through any newer rows and ends in HEAD's dot; a commit reached by that lane takes a fresh colour.
- Tests: the plan's ten cases (every split point of a 12-commit fixture), plus a merge into an already waiting lane,
  colour cycling and the working-tree start.

### 2. Graph cell
- `util/graphRowGeometry.ts`: `rowGeometry(row)` → width, dot, lines (`path`, colour, dashed), `hiddenLaneCount`;
  `workingTreeGeometry()`; lane pitch 14, row 28, dot r 4, lane 0 at x 10 (the mock-up's coordinates); curves are the
  mock-up's cubic shapes (`M24 0 C24 10 10 4 10 14` into a dot, `M10 14 C10 24 24 18 24 28` out of it). Lines in or
  out of lanes beyond `MAX_DRAWN_LANES = 24` are left out and counted as `+n`.
- `components/commitGraphCell` (`cc-commit-graph-cell`): inline SVG, `stroke="currentColor"`, lane colour classes of
  design H8 (deviation 6: `text-base-content/60` instead of `text-neutral`). HEAD = ring (`fill-base-100`, stroke 2,
  r 3.6) inside an outer ring (r 6.5, stroke 1.2, also filled so lines stop at it — the mock-up's look). Uncommitted
  changes: dashed hollow circle (`stroke-dasharray="2 2"`) and a dashed line (`3 2`) in `text-warning`, the mock-up's
  colour for that row; the same dashed warning line runs through the rows down into HEAD's dot.
- `+n` has no `title`: the design names none.

### 3. Virtual window
- `util/virtualWindow.ts`: `windowOf({ scrollTop, viewportHeight, rowHeight, rowCount, overscan })` →
  `{ firstIndex, lastIndex (inclusive), offsetTop, totalHeight }`; scroll positions are clamped to the list, so an
  overscrolled or shrunken list still renders its last rows. Tests: the plan's four plus partly visible edge rows,
  overscan at the top and a list shorter than the viewport.

### 4. Log service, ref labels, dates
- `GitLogService` keeps scope (M3) and adds `filter` / `setFilter` / `clearFilter` / `isFiltered`, `commits`,
  `graphRows`, `isGraphAvailable`, `page` (`LoadState<void>` of the latest page request), `hasMore`,
  `isLoadingFirstPage`, `loadNextPage()` (also the retry: a failed first page starts over, a failed later page asks
  for the same cursor again), `reload()`, `refLabels`, `headSha`, `uncommittedChangeCount`.
- It restarts at page one when the query changes: repository, scope, filter (trimmed; empty = none) or the refs
  **fingerprint** (`GitRepositoryService.refs()` re-read with the same fingerprint does not restart). Nothing loads
  before the refs are ready. Late pages are dropped by a generation counter; one page request at a time.
  `LOG_SESSION_EXPIRED` on a later page restarts once silently (the loaded rows stay until page one replaces them);
  a second expiry before a page succeeds is shown as a failure.
- Graph rows are laid out per page with the carried `GraphLayoutState`. When the uncommitted-changes row appears or
  disappears (or HEAD moves) the loaded commits are laid out again from `stateWaitingForHead` / the empty state.
- **Uncommitted changes row (H8).** Shown when the status counts any changed file (staged + unstaged + untracked +
  conflicted), HEAD has a commit, no filter is set, and the scope reaches HEAD (All, or refs that include the
  current branch). Design gap: H8 does not say what happens under a filter or another branch's scope; leaving the row
  out there keeps the dashed line from running down a list HEAD is not in.
- Path filter: the core wants a repository-relative path with `/` (`RepoRelativePath`), so the service trims it,
  turns `\\` into `/` and drops a leading `./` or `/`. The path is relative to the repository root, not to the
  project folder (equal unless the folder is a subfolder of its repository).
- `util/refLabels.ts` (`refLabelsByCommit`: current branch, detached `HEAD`, other local, remote, tags) and
  `util/commitDate.ts` (`commitDateTime` "3 Nov 2026, 14:03", `shortCommitDateTime` "3 Nov 14:03"; en-GB as the
  projects feature, the viewer's zone unless one is given). Relative dates reuse `util/wording.ts relativeTime`.
- `GitApiService.commitDetails`. Fake bridge: `git.log` pages 500 at a time (cursor `page-<offset>`, anything else
  `LOG_SESSION_EXPIRED`), scope `refs` lists what the named refs reach, `filter` matches subject/SHA, author name or
  e-mail (case-insensitive) and paths of seeded `details[sha].files`, `isGraphAvailable` false with a filter;
  `git.commitDetails` answers `details[sha]` or the summary without files, `UNKNOWN_REVISION` otherwise. The body
  stays self-contained (rebuilt-from-source test added). Builder `aLogCommit` in `services/gitApi.mocks.ts`.

### 5. Commit list and rows
- `components/commitList` (`cc-commit-list`, under the COMMITS header and scope chip): column header (28 px, the H8
  classes; it sits above the scrolling viewport, so it needs no `sticky`), a `role="listbox"` viewport (`tabindex="0"`,
  `aria-label` "Commits"; `aria-activedescendant` and the keys come with M5), rows virtualised with `windowOf`
  (overscan 10; `scrollTop` written once per animation frame; one `ResizeObserver` gives height and width). The next
  page loads when the window reaches within 100 rows of the end; the last row is `loading loading-dots loading-sm`
  while a page loads, or "Could not load more commits." + `btn btn-link btn-xs` "Retry" (git's sentence in `title`).
  First page: 8 skeleton rows; other failures `alert alert-error` with the H6 sentence and "Retry". Empty: "No commits
  yet." / "No commit matches the filter." + "Clear filters".
- Columns (CSS grid shared by header and rows): Graph (width of the widest loaded row, `graphWidthFor`, +24 px room
  when `+n` shows), Commit `minmax(0,1fr)`, Analysis 6.5 rem (only with an `ANALYSED_COMMITS` provider), Author 8 rem,
  Date 7 rem. No graph column while filtered (H8 "Filtered list").
- `components/commitRow` (`cc-commit-row`, host is the grid row, `role="option"`): graph cell, subject `min-w-40
  truncate`, up to 3 ref labels (1 when the pane is narrower than 640 px, measured by the list's `ResizeObserver`
  rather than a CSS container query) then `badge-ghost` "+n" whose `title` lists every full ref; label classes and
  icons per H8; Analysis badge `badge badge-soft badge-xs` (`util/analysisBadge.ts`); author `truncate` with
  "name <e-mail>" title; date relative (`relativeTime`) with the absolute `commitDateTime` title (author date, as the
  details' author line). Selected `bg-primary/20 font-semibold`, hover `bg-base-200`.
- Uncommitted changes row: first row, graph cell without a row (dashed circle), "Uncommitted changes (n)" `italic`,
  no author, no date; selecting it gives the `workingTree` item.
- **Ports, as built.** `ports/analysedCommits.port.ts` exists now (the list's tests need a fake provider; plan 4.7
  lists ports under M5). `AnalysedCommitMarker` carries the design's states: `state: "analysed" | "queued" |
  "running" | "failed"`, `isLoadedInMap`, optional `progressPercent`, `analysedAt`, `note` ("other profile",
  "imported map, analysis time unknown") and `failureMessage`; the row words them per H8 ("Analysed 3 Nov 14:10 —
  note", "42 %"). Design gap: a running analysis without a known percentage reads "analysing" (H8's own example row
  says "analysing 42 %"). Not exported from the facade until 05 provides it (plan 4.2).
- **Selection, minimal.** `model/commitSelection.ts` (plan types `SelectionItem`, `CommitSelection`) and
  `services/commitSelection.service.ts` with one item: click selects a commit or the working tree; cleared when the
  repository changes. M5 adds the second selection, keeping it across refreshes, and the keyboard.
- Slow first page (H6 inline notice): `TIMEOUT` on page one shows under the toolbar in `cc-git-history-panel` as
  `alert alert-warning` "The history took too long to load. Running `git commit-graph write --reachable` in the
  repository makes it faster." with the copy button and "Retry".

### 6. Commit filters (design H8 over plan task 6)
- **Design over plan.** The plan puts search / author / path into `historyToolbar`; design deviation 10 moves them into
  the COMMITS pane header, so they are a new `components/commitFilters` (`cc-commit-filters`) below the header row
  "COMMITS [scope chip] (?)". The plan's other toolbar tests are already M3's: "folder picker hidden for one
  repository" does not apply (OD1, no folder picker at all) and "refresh on button and F5" exists since M3.
- Inputs per H8: Search `flex-1 min-w-40` with the leading `fa-magnifying-glass` (the explorer's `label.input`
  pattern), Author `w-36`, Path `w-44 font-mono`, each `title` "Filters the commit list"; `maxlength` 200 / 200 / 1024
  (the core's limits). Debounced 300 ms (`FILTER_DEBOUNCE_MS`); "Clear" `btn btn-ghost btn-xs` while any is set,
  clearing at once; the line "Filtered — the graph is hidden while searching." while a filter applies. The inputs
  follow a filter cleared elsewhere (the list's "Clear filters").
- Narrow pane (< 640 px): a Tailwind container query (`@container`, `@max-[40rem]:hidden` / `@min-[40rem]:hidden`) swaps
  Author and Path for `btn btn-ghost btn-sm` "Filters" (`fa-filter`, badge with the number set) that opens a
  `cc-settings-popover-shell` with the two inputs.
- `components/commitGraphLegend` (`cc-commit-graph-legend`): the (?) `btn btn-ghost btn-xs btn-square
  fa-circle-question` "How to read the commit list" opens a `cc-settings-popover-shell` (`w-80 p-3 text-sm`) with H8's
  legend table, drawn with `cc-commit-graph-cell` and the real badge classes. Wording: H8's table (it differs slightly
  from the mock-up's legend; the design document wins). The analysis row shows only when the Analysis column does.

### 7. Commit details
- `services/commitDetails.service.ts` (`CommitDetailsService`): `details: LoadState<GitCommitDetails>` of the one
  selected commit through `git.commitDetails`; a ticket per read so the latest selection wins; `retry()`;
  `selectCommit(sha)` for the parent links — from the loaded list, else `git.resolveCommit` (new
  `GitApiService.resolveCommit`; the fake answers it from its commits), because a filtered or partly loaded list often
  lacks the parent.
- `components/commitDetails` (`cc-commit-details`, in the DETAILS pane): subject `text-base font-semibold
  whitespace-pre-wrap`, body `text-sm whitespace-pre-wrap`, SHA `font-mono` (10 characters as H9's example, full SHA in
  `title`) with "Copy full SHA", "name <e-mail> · 3 Nov 2026, 14:03", committer line only when name or e-mail differ,
  "Parents" + short-SHA `btn btn-link btn-xs` per parent, "CHANGED FILES  n files  +i −d", "Changes compared with the
  first parent" for merges, file rows (worded `badge badge-soft badge-xs w-16 justify-center`, name, folder `/60`,
  `+n` / `−n` or "binary"; renamed "old.ts → money.ts"), "… and n more files (list truncated)". Working tree: "3 changed
  files: 1 staged, 2 unstaged" (kinds with a count only). Nothing selected: the H9 sentence. Loading: skeleton lines;
  error: `alert alert-error text-xs` + "Retry".
- `ports/loadedMapLocator.port.ts` (`LOADED_MAP_LOCATOR`): with a provider and a node path the file name is a
  `btn btn-link btn-xs` "Show <path> in the map" that hands the node to the metrics view (`ViewHandoffStore`) and
  navigates there; without a node, plain text titled "Not in the map shown now"; without a provider, plain text.
- **Design gaps, not improvised:** the committer line has no wording in H9, so it uses the author line's format
  without a label; the "Open changes" link of the working-tree details is left out (the Changes tab is not on this
  branch; unbuilt features are not shown); the resolution line and the action buttons (Show in map, Analyse, Compare)
  come from areas 05/06 through `COMMIT_ACTIONS` (M5); H9 lists no word for git's `unknown` change kind, so the badge
  says "unknown" (`badge-ghost`).
- Changelog: the **Git branches** entry is rewritten as **Git history** (plan sentence without "the top bar shows the
  current branch", which is W1 / area 05).

### Performance (100 000 commits)
- Measured with a scratch Playwright spec (not committed): the stand-in fake bridge seeded in the page with 100 000
  commits (a main line where every 20th commit merges a side commit, and a 400-commit-long lane every 997 commits),
  built app, bundled Chromium headless, 1600×900, this machine (Arch Linux, 2026-11-19).
- First measurement: page median 51 ms, scroll frame median 22.8 ms / p95 35.7 ms. Two fixes
  (`perf(visualization): keep commit rows while scrolling`): the list keeps each row's view object until the graph,
  labels, markers, HEAD or the selection change, so a scroll renders only the rows that enter the window; the date
  formats (`Intl.DateTimeFormat`) are built once instead of per row and render; scroll events coalesce to one
  `scrollTop` write per frame.
- After: History click → first rows 146 ms; 199 next pages, all 100 000 commits loaded by scrolling in 6.8 s; per page
  (scroll to the end → rows rendered) median 33 ms, p95 40 ms, max 62 ms, the last page (offset 99 500) 29 ms, of which
  the fake's own answer is ~10 ms (it filters the whole seed per page); scrolling 1400 px per frame through the loaded
  list: frame median 16.6 ms, p95 21.2 ms, max 61 ms (one frame); jumps to 25 / 50 / 75 / 100 % and back to the top
  render within two frames (21–33 ms); 35 row elements in the DOM at any time.

