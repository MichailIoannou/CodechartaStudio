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
- [ ] 5. Commit list
- [ ] 6. Toolbar filters
- [ ] 7. Commit details

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

