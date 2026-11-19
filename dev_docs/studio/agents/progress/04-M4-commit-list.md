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

- [ ] 1. Graph layout
- [ ] 2. Graph cell
- [ ] 3. Virtual window
- [ ] 4. Log service
- [ ] 5. Commit list
- [ ] 6. Toolbar filters
- [ ] 7. Commit details

## Notes

