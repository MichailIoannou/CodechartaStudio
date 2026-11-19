---
name: 03-M5 projects UI
state: complete
version: 1
---

## Goal

The first new screens of the desktop app: the project menu in the nav bar, the project overview page,
creating and managing projects with their folders, booting into the last shown snapshot of the active
project — built to `design/03-projects.md` (plan 03, Milestones, M5).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M5, **adjusted to the design**, which overrides
the plan's UI wherever they differ (read its "Deviations from the plan"). Design elements in scope here:
P1 project menu (projects, folders, working folder — `cc-project-switcher`), P3 project overview page
(`cc-project-overview`, route `#/project`; replaces the plan's `cc-project-home`), P4 create project dialog,
P5 folder list editor, P6 manage project dialog, P7 delete confirmation. Out of scope (later milestones):
P8 open/import dialog and P11 drop target (03-M6), P9 move/bind (area 05), W1 workspace status (area 05).
Owner decision OD1: one working folder at a time — the plan's task 5 (`cc-project-folder-selector`, multi-folder
Apply) is removed; switching the working folder happens in P1. Follow `design/00-design-principles.md` for
nav-bar composition, icons, wording, toasts and z-layers, and `design/journeys.md` for the flows.

Renderer API from 03-M4 (`03-m4-renderer-load-path.md`): `LoadFilesUseCase.loadProjectSnapshots(...)`,
`bootFromProject(...)`, `showSampleFiles()`, `unloadAllFiles()`; `ProjectSnapshotToLoad { origin, displayName,
readBytes }`; send `{checksum, rootName}` to `snapshots.recordMapFacts`; toast each `identicalContent`.
Shell API from 03-M2/M3: `projects.pickFolder({ title })` → token, `snapshots.readMapChunk` (16 MiB chunks),
`projects.revealFolder`; fake bridge with in-memory projects/snapshots (`standInForTheDesktopBridge(page, seed)`).
Retire `readSnapshotMap` if nothing uses it.

1. Projects service, snapshot bytes, display names
2. Boot service, project overview page (P3), wiring
3. Folder list editor (P5), create project dialog (P4)
4. Project menu (P1) in the nav bar, with folders and working folder
5. ~~Folder selector~~ — removed by OD1 (folded into task 4)
6. Manage project dialog (P6) incl. delete confirmation (P7)
7. Reset dialog seam
8. E2E on the web suite with the fake bridge
9. Changelog

## Steps

- [x] 1. Projects service
- [x] 2. Boot and overview page
- [x] 3. Create project
- [x] 4. Project menu
- [x] 5. Folder selector — removed by OD1
- [x] 6. Manage project
- [x] 7. Reset seam
- [x] 8. E2E
- [x] 9. Changelog

## Notes

Environment (2026-11-19): Arch Linux, node 26.13, npm 12.2, rustc 1.95. Branch `feature/studio-03-m5` from
`feature/studio-stack` (`82fbc5c6f`).

### Verified before changing code
- 03-M4 API as described: `LoadFilesUseCase.loadProjectSnapshots/bootFromProject/showSampleFiles/unloadAllFiles`,
  `ProjectSnapshotToLoad`, `load.facade.ts` type exports; shell composed methods `projects.pickFolder|revealFolder`,
  `snapshots.readMapChunk` through `bridge.request`; fake seeds `projects`, `snapshots`, `activeProjectId`,
  `pickedFolders`, `snapshotMaps`, `now`. `git.status` and `git.log` are renderer methods (04-M1/M2 core).
- No renderer `GitRepositoryService`, `SnapshotViewService`, `AnalysisJobsService` or History view exists yet.

### Core change (design deviation 3)
- `ProjectSummary` gains `folders: ProjectSummaryFolder[]` (`id, label, role, kind, status`) and `updatedAt`
  (`Option`, null for a problem summary; P3 (b) sorts by last update, which the summary could not do). Test
  `should_list_the_folders_and_the_last_update_of_each_project`; contract regenerated; plan text corrected.
  Cargo gates with and without `--all-features` green, `npm run contract` leaves no diff.

### Files (`features/projects/`)
- `services/projects.service.ts` (`ProjectsService`: `projects`, `activeProject`, `workingFolder`, `snapshotsByFolder`,
  `shownSnapshot`, `storeProblem`, `busyFolderId`/`isBusy`; `initialise`, `openProject`, `chooseFolder`,
  `showWorkingFolder`, `snapshotsToShow`, `acceptLoadResult`, `reloadAfterReset`, project/folder methods,
  `addPickedFolder`, `revealFolder`, `revealStoreFolder`, `readStoreUsage`), `projectsBoot.service.ts`,
  `snapshotBytes.ts` (16 MiB chunks), `folderGit.service.ts` (`git.status` per folder, cached; `git.log` head, 10
  rows), `projectsFacade.ts` (what the nav bar reads). `util/`: `snapshotDisplayName.ts`, `folderWording.ts`
  (counts, branch, upstream, changes, remote host/path, relative time, sizes, dates, durations), `folderRole.ts`,
  `folderListRows.ts`. Components: `projectSwitcher` (P1), `projectOverview` + `workingFolderCard` +
  `analysesCard` (P3), `createProjectDialog` (P4), `folderListEditor` (P5), `manageProjectDialog` with
  `manageGeneral` (incl. P7), `manageFolders` (incl. remove confirmation), `manageProfile` (P6), `relinkFolder`
  (re-link + "Different History"). `projects.mocks.ts`, `projectsTestBed.mocks.ts`, `e2e/projects.e2e.ts|.po.ts`.
- Route `#/project`: `routing/projectRoute.ts` (`projectRoutePath`, `projectRouteLink`), lazy, `canMatch` desktop only.
- `readSnapshotMap` retired (preload, shell action, bridge type, fake; a shell test now checks it is refused).
- Fake bridge: new seeds `gitStatuses`, `gitLogs` (per folder id); `snapshots.usage` derived from `mapBytes`.

### Followed the design over the plan
- P3 overview page replaces `cc-project-home`; it is a route the boot flow redirects to, not an `@if` in
  `codeCharta.component.html`. Choosing a folder while the overview shows keeps the overview (it follows, J4);
  on a map view a folder without analyses switches to the overview.
- OD1: one working folder; no folder selector; `chooseFolder` = `setActive` (when the project changes) +
  `setView { workingFolderId }` + load the remembered or newest snapshot, falling back to the next one when a map
  cannot be read.
- P1 replaces the upload button in desktop; map slot per design §3 (delta selector in delta state, map selector
  only for sample maps without a project, nothing while a project is active: W1 is area 05). The view switcher
  is hidden while no map is loaded (plan test kept). Errors from P4/P6 show inside the dialog (design), not as
  toasts (plan test "should show the bridge error as a toast" became "...in the dialog").
- P6 has no Snapshots tab (deviation 2); Delete project sits at the bottom of General.
- Cards are islands (`rounded-[10px] bg-base-100`, no border) on a `bg-base-200` page, as the design text says;
  the mock-up still draws bordered cards on the window colour and the host line says `bg-base-100`.

### Deviations and gaps (not improvised beyond the minimum)
- `routePaths.project` is `projectRoutePath` in `routing/projectRoute.ts`: `routePaths` keys are `ViewId`s
  (view switcher, readiness, explorer scopes, context-menu jumps), and the overview is not a view.
- Picker titles "Add folder" and "Re-link '<label>'": the shell takes the caller's title, the design names none.
- IO store problem: `store.status` carries no message, so the sentence ends after "could not be read or written."
- Folder-refresh focus throttle `FOCUS_REFRESH_THROTTLE_MS = 10 s` (plan 04 G5 names no value).
- Branches (P1, P3 folder rows) and the working folder's git rows come from `FolderGitService` in this feature
  (cached `git.status`, one direct `git.log` call), since area 04's `GitRepositoryService` does not exist yet;
  04-M3 can absorb it. A git error shows the core's message in place of the git rows (area 04 sentences n/a).
- `navbar-start` gets `min-w-0` but not `overflow-hidden` (design §3): `overflow-hidden` would clip the
  dropdowns that hang from it. The trigger widths are on the button (`max-w-24 xl:max-w-28 2xl:max-w-52`), so
  at 1024–1279 px "billing-api" shows as "bill…" (full text in `title`), as the width budget implies.
- Recent-commit rows are not buttons yet (History does not exist); the HEAD row has a ring icon with title
  "Current checkout".
- "In the map" for an imported snapshot without commit uses P10's "commit unknown" plus the `imported` badge;
  "Latest" for one says "analysis time unknown (imported <date>)".
- "New project…" on the no-project overview is a plain `btn` (the design marks none as primary).

### Left for later milestones (design elements present but data or dialogs missing)
- 03-M6: "Open cc.json…" (P1 footer slot left empty, P3 (b)), `Ctrl+O`, P8, P11, "Import cc.json…" row overflow,
  "Choose another location…" for a store problem, "Snapshots…" (P3 analyses card, P6 Folders footer).
- Area 04: contextual sync button and "Open History" on the working-folder card, clickable recent commits,
  `GitRepositoryService` (move `FolderGitService` there).
- Area 05: W1 in the map slot, "Analyse current checkout" (also as the primary button when there is no
  analysis; the sentence shows already), "Running", the staleness sentence after "In the map".
- OD5: the projects UI does not yet reload when the core comes back after an outage.
- Proposed change 1 (desktop reset text) not applied: "not assumed approved".

### Screenshots (Playwright, stand-in bridge, 1600×900 and 1100×800, cc-dark and cc-light; scratch spec, not committed)
- Map with project: trigger "billing / billing-api" with the project name muted; at 1100 px folder only.
- P1: BILLING header with Overview, folder rows with radio dot, role badge, branch, path; working row tinted
  `bg-primary/20`; OTHER PROJECTS with caret, "2 folders", warning icon; expanded dotfiles shows "missing" in
  warning colour; footer New project…, Manage project…, Close project. Fixed after the first look: the working
  folder label was cut to "billin…" by the branch and path (label now keeps up to `max-w-40`), and the trigger
  text overlapped the caret at 1100 px (the project name now shrinks first and the folder truncates).
- P3: title, description, Manage project…; working-folder card (Branch, Upstream with arrow icons, Changes, Last
  commit, Remotes) and Analyses card side by side; recent commits with "in map"/"analysed" badges; folder rows
  with Work here / (working) and the plain-folder hint. Fixed: the upstream line wrapped mid-phrase; the HEAD
  ring was hard to tell from the other rows (others are now small dots).
- P3 (b): CodeCharta, sentence, New project… / Show sample maps, PROJECTS list by last update with "1 folder
  missing" in warning colour (pale on cc-light, as noted in 01-M4.2).
- P4 with three picked folders: Primary / Fork (with "shares history with billing-api") / Helper, remotes as
  host/path. P6 General/Folders/Profile and P7: as designed; the active segment of the `join` is subtle in cc-dark
  (same as the explorer's mode toggle).

### Gates (final)
format:check clean; npm test 681 suites, 5300 passed (2 todo), coverage gate met; lint (depcruise, styles, knip) clean; tsc clean; build ok; e2e:ci 169/169 (temporary chromium channel, reverted); test:electron 69/69; e2e:desktop 14/14; cargo fmt/clippy/test with and without --all-features green; contract no diff.

### How to try it in the desktop app
`cd visualization && npm run build && npm run start` (core from `core/target/debug`). First start: the overview
"no project" page; New project… → Add folder… → Create project; the project menu in the nav bar switches folder
and project; Manage project… edits folders and the profile. Analyses come with area 05; until then a project
shows a map only for snapshots that already exist in the store (e.g. imported with the core CLI
`codecharta-core snapshots import`).

