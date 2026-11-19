---
name: 04-M3 history view, branches pane
state: progress
version: 1
---

## Goal

Add the History view (new nav-bar tab, route `history`) with its panel shell, problem notices and the
branches tree, on top of git repository state held in signal services (plan 04, section 5, M3).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M3. Branched from `feature/studio-stack` (git
core 04-M1/M2 and projects UI 03-M5 present). Design overrides the plan's UI: `design/04-history.md` (H1 tab,
H3 frame, H4 toolbar shell, H6 problem notices, H7 branches tree; read "Deviations from the plan"),
`design/00-design-principles.md`, `design/journeys.md`, mock-up `design/mockups/studio-screens.html`.
**The plan's task 6 (`currentBranchChip`) is replaced by the design**: H2 is merged into W1 (workspace
status, area 05) — do not build a branch chip; leave the hook for W1 and say so.

From 03-M5: a small `FolderGitService` exists in `features/projects` (cached `git.status`, one `git.log`);
this milestone's `GitRepositoryService` should take over that role (move or delegate; record it). OD1: the
History view follows the working folder; it shows it, it does not choose it. Core methods: `git.repositoryInfo`,
`git.status`, `git.branches`, `git.refsFingerprint`, event `repository.changed` (04-M1); error codes
SCREAMING_SNAKE_CASE with git's text in `details.detail`. Extend the fake bridge's self-contained body with
a `git` seed (refs, status, commits, per-method failures) — this is 04-M1's deferred task 7 seed.

Parallel work note: other agents work on 03-M6 (projects menu entries, desktop tools store rows) and on the
metrics bar / file extension bar / toasts at the same time. Keep changes to shared files (nav bar template,
`VIEW_TABS`, `app.config.ts`, the fake bridge, `CHANGELOG.md`) small and localised.

1. Tidy first: jump targets / modes per view
2. Route and empty History view behind availability
3. API and repository state services (+ fake bridge git seed)
4. Panel shell and problem notices
5. Branches tree
6. ~~Branch chip~~ — replaced by W1 (area 05); not built

## Steps

- [x] 1. Tidy first
- [x] 2. Route
- [x] 3. Repository state
- [ ] 4. Panel shell
- [ ] 5. Branches tree
- [x] 6. Branch chip — replaced by the design (W1)

## Notes

Environment (2026-11-19): Arch Linux, node 26.13, npm 12.2. Branch `feature/studio-04-m3` from `feature/studio-stack`
(`974d2d0e7`).

### 1. Tidy first
- `JUMP_TARGETS` is `Partial<Record<ViewId, JumpTarget>>`; `jumpTargets` keeps the views that have one.
  `ViewTab.hasModes` (all `true` in this commit); `openModeBar` previews nothing for a tab without modes and
  `isModeBarHandleShown` hides the handle while such a view is active (design proposed change 1).

### 2. Route
- `routePaths.history = "history"`, lazy route without `showSpinnerBeforeBuildingView` (the history never calls
  `markReady`), `views/historyView` (`cc-history-view`, host classes per H3). Web build: the H1 sentence and "Show
  the map"; no tab (availability is false without a bridge).
- The four `ViewId` tables: `VIEW_TABS` (+ `hasModes: false`), `isViewAvailable.history`, `groupLabels.history`,
  `DRAWING_PHASE_OF_VIEW.history`; `JUMP_TARGETS` has no history entry.
- `GitHistoryAvailability.isAvailable` = desktop and the active project has a folder of kind `git` (design deviation
  1, not the plan's "a project is active"). It also leaves History for the metrics view (`replaceUrl`) when the
  history is lost while shown; in the web build the route stays (it explains the desktop app). The plan's test
  "leaves History when the project closes" moved here from task 3.
- **Dependency direction (deviation).** The plan has `features/gitHistory` read `ProjectsService`; but the projects
  feature shows git state (P1, P3, and later H5 on the overview card), and features may not form cycles. So
  `projects → gitHistory`, and git reads the projects through the port `ports/workingFolderSource.port.ts`
  (`WORKING_FOLDER_SOURCE { activeProject, workingFolder }`), provided in `app.config.ts` as
  `useExisting: ProjectsFacade` (which now exposes those two signals). Without a provider (web, specs) the source is
  empty.
- Shared files touched: `app.config.ts` (route + one provider), `viewSwitcher.component.ts|html`,
  `viewModeBar.component.ts`, `loadingFileProgressSpinner.service.ts`, `nodeContextMenu.component.ts`, `routePaths.ts`,
  `projectsFacade.ts`.

### 3. Repository state
- `services/gitApi.service.ts` (the only `git.*` caller; `GitResult<T>`; RPC errors → `GitError { code, message,
  detail, repositoryPath }` from `details.detail` / `details.repositoryPath`; a rejected request or a missing bridge
  → `COMMAND_FAILED` with its text). `model/loadState.ts`, `model/gitError.ts`, `services/gitApi.mocks.ts`.
- `services/gitRepository.service.ts` (`GitRepositoryService`): `activeRepository` follows the working folder (OD1,
  design deviation 3; no `selectFolder`, no `activeFolder.repo.ts` — the plan's tests "opens the first repository
  folder" / "remembers the folder per project" became "opens the working folder" / "follows the working folder").
  `repository`, `status`, `refs` (`LoadState`), `isRefreshing`, `refresh("manual" | "focus" | "afterWrite")`;
  `repository.changed` reloads the named parts (`workingTree` counts as status). Late answers are dropped per part
  (a ticket per repository / status / refs read) rather than by one generation counter, so a refs-only change does
  not orphan a status read in flight. A re-linked folder (same id, new path or status) is read again.
  Focus: window `focus`, at most every `FOCUS_REFRESH_THROTTLE_MS = 5 s` (plan 4.7), `git.status` +
  `git.refsFingerprint`, refs re-read only on a new fingerprint; while the repository has a problem a focus re-reads
  everything (git may have been installed meanwhile).
- **`FolderGitService` taken over (moved, not delegated).** Its cache and calls now live in `GitRepositoryService`
  (`statusOf`, `refreshFolders` (was `refresh`), `recentCommits`, `RECENT_COMMIT_COUNT`), built on `GitApiService`;
  the status read for the working folder also fills that cache. `features/projects/services/folderGit.service.ts`
  and its spec are gone; P1, P3 and the working-folder card inject `GitRepositoryService` from the git facade.
  The projects overview keeps its own 10 s focus refresh of the folder rows.
- Fake bridge: the 04-M1 seed `git?: Record<folderId, FakeGitRepository { info, status, refs, commits, failures }>`
  answers `git.repositoryInfo`, `git.status`, `git.branches`, `git.refsFingerprint`, `git.log`; a missing value is
  `NOT_A_REPOSITORY`, `failures[method]` fails one method. 03-M5's `gitStatuses` / `gitLogs` stay as shorthands folded
  into `git` (no projects spec had to change).

