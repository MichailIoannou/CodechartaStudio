# Owner decisions taken during the design review

Decisions the owner made while reviewing the interface design. They change plan scope, not only the
interface, so the orchestrator and the planner act on them; the design files already follow them.

## OD1 — A project is a group of folders; one working folder at a time (2026-11-18)

**Decision.** Folders exist to keep related folders (the repository, a fork, helper folders) under
one parent, the project. The user works in **one folder at a time**, the *working folder*. There is
**no** showing of several folders side by side and no combined or aggregated map of several folders.

**Interface consequence** (`03-projects.md`, `journeys.md`):
- The project menu lists the current project's folders first (one marked as the working folder), then
  every other project as an expandable row with its folders. Choosing a folder switches project and
  working folder in one step.
- The multi-folder selector (checkboxes, Apply) is gone. Its place in the nav bar becomes the
  **workspace status** element (branch, analysis, git progress; `05-snapshots.md` W1), which also
  absorbs the branch chip and the analyses indicator.
- The project home becomes the **project overview** page, reachable at any time from the project menu.

**Plan impact (for the orchestrator and planner).**

| Plan | Part | Change |
|---|---|---|
| 03 | store layout `project.json.view` | `visibleFolderIds: FolderId[]` → `workingFolderId: FolderId \| null`; `shownSnapshotIdByFolder` stays (each folder remembers what it last showed). **03-M1 is in progress: apply before the format is written.** |
| 03 | core `projects.setView` / `ProjectView` | takes `{ workingFolderId }`; new or renamed `projects.setWorkingFolder` is acceptable |
| 03 | renderer `ProjectsService` | drop `visibleFolders`, `showFolders(ids)`; `activeFolder` becomes `workingFolder` (the stored id; default: the primary folder); add `setWorkingFolder(folderId)`, which loads that folder's shown snapshot |
| 03 | load path | at most one project map, or two during a comparison; the multi-map aggregation path for project maps is not needed (uploads in the web build keep it) |
| 03 | M5 step 5 `cc-project-folder-selector` | removed; replaced by the folder section of the project menu (M5 step 4) |
| 03 | open question 2 (how many folders side by side) | moot |
| 03 | manual verification "check both in the folder selector" | becomes "switch between the two folders in the project menu" |
| 04 | `GitRepositoryService.selectFolder` | follows the working folder; the History toolbar shows it, it does not choose it |
| 04 | `cc-current-branch-chip`, `cc-sync-buttons` | replaced by the workspace status element and one contextual sync button (`04-history.md` H5) |
| 05 | `cc-snapshot-chip`, `cc-analysis-jobs-indicator` | replaced by the workspace status element |
| 05 | `ProjectsFacade.activeFolder()` | read as the working folder |
| 06 | cross-folder comparison (`Explicit` with two folders) | unchanged: comparing a commit of the working folder with one of another folder of the project is still offered in the compare dialog |

## OD2 — Workspace status element with progress fill (2026-11-18)

The branch chip and the analyses indicator are one element that looks like the map selector. Its icon
turns into the activity (analysing, pulling, pushing, fetching) and its background fills as a progress
bar when the core reports progress (`analysis.progress` `Determinate { percent }`,
`git.operationProgress` `done/total`), with an indeterminate animation otherwise. Design:
`05-snapshots.md` W1. No core change is needed: both notifications exist in plans 04 and 05.

## OD3 — One contextual sync button, after Zed (2026-11-18)

Fetch, Pull, Push and Publish are one split button whose main action follows the branch state
(Publish without upstream, Pull when behind, Push when ahead, Fetch otherwise); the caret lists all of
them. Commit stays in the Changes tab and is not part of this button. Design: `04-history.md` H5.

## OD4 — Project overview page (2026-11-18)

The project home becomes a page the user can open at any time from the project menu ("Project
overview"), showing the working folder, its git state and its analyses. Design: `03-projects.md` P3.

## OD5 — The UI never restarts for core-owned state; it survives the core going offline (2026-11-18)

**Decision.** The core owns the store and its folder. The app is only the UI: it asks the core for
the data and redraws the affected elements from the answer, so changing the store folder (or any other
core-owned state) does **not** restart the app. The app also keeps running when the core goes offline
and comes back: it never closes itself, shows an offline state while the core is away, and recovers
without a restart when the core is reachable again. Owner's words: "Why would the app restart, the
core is the one that should be managing this information not the app itself, the app itself is simply
the ui, it should ask for the data from the core and re-draw the various ui elements based off of that
without restart, also it should be able to handle the core going offline/online without closing itself".

**Confirmation (owner, follow-up).** Changing the store folder asks for **no** yes/no confirmation:
"Change…" goes straight to the folder picker; the core switches and the UI redraws.

**What exists today (found in the files).** Plan 01 §shell already respawns the core with backoff
0.5/1/2/4/8 s, state `restarting`, `unavailable` after five failures in 60 s, `restartCore()`, and
publishes `shell.coreState` to the renderer (`DesktopEnvironment.coreState()`). The only renderer
reaction is the core-state block (D4) inside the desktop tools panel; nothing says the rest of the UI
(project menu, history, analyses, map) reacts, or reloads its data when the core is back after
`restarting`. The store-folder flow is the one place that restarts the *app* (`app.relaunch()`).

**Plan impact (for the orchestrator and planner).** Touches 01-M2 (in progress: runner, tools,
settings, doctor; the shell lifecycle and the D4 panel) and 03-M1 (next: store core) and 03-M2/M6.

| Plan | Part | Change |
|---|---|---|
| 01 | shell, core supervision (spawn/respawn/backoff paragraph; `coreClient.js` "restart with backoff") | keep respawn, but after every successful `core.hello` of a respawned core publish a "core back" event (guess: `shell.coreState` `ready` again suffices) so the renderer can reload; renderer services must refetch, not assume state survived. The `unavailable` state must not quit the app |
| 01 | renderer `DesktopEnvironment.coreState()` and manual check 6 ("restarting", "unavailable" with "Restart core") | the state becomes app-wide, not only a panel in the tools dialog; add a check: kill the core, the map and open dialogs stay, an offline state shows, the app recovers when the core is back |
| 01 | pending requests resolve `CORE_UNAVAILABLE` | renderer callers must handle it (disable core-backed actions, keep what is on screen, retry on reconnect); guess: a shared helper instead of per-service handling |
| 01 | `main.js` lifecycle ("core start/stop", `before-quit`) | confirm no path closes the window or the app on core exit; `app.relaunch()` is no longer used for settings |
| 03 | store layout/core, `store/state.rs` (`StoreState::{Open, Unavailable}`), `Core::open_store`, `store.status` | the core must switch its open store to the new root at runtime (close, open, update settings) without a process restart; `StoreState` is already the right shape. **03-M1 is next: shape `Core::open_store` to be re-entrant now** (guess) |
| 03 | `store.changeRoot` (RPC table, M3 step 3 "copy the managed store to a new folder") | the core copies, reopens at the target and returns `StoreRootChange`; it also sends a store-changed notification (new, name open) so the renderer refetches projects, snapshots and analyses |
| 03 | `store.chooseRoot` row and M6 step 4 ("dialog → `store.changeRoot` → `app.relaunch()`") | the shell only shows the native picker and calls `store.changeRoot`; drop `app.relaunch()` |
| 03 | `paths.resetStoreRoot` ("then relaunch", Required-from-plan-01 bullet on store location) | same reopen at the default root, no relaunch |
| 03 | renderer `ProjectsService` / `projectsBoot` | on the store-changed notification and on core reconnect: reload projects, working folder, shown snapshot and redraw the map; guess: the previous selection is kept only if it exists in the new store |
| 03 | M6 manual verification ("Change… to an empty folder copies the store and restarts into the same project") and M1 acceptance wording "restart, land in the same project" (that one is a real app restart and stays) | the first becomes "copies the store and the UI shows the same project without restarting" |
| 03 | M6 step 6 changelog "Store folder" | no restart wording (none present today; keep it so) |
| design 01 | D3 "Store folder" — drop the confirmation step too: no "Change Store Folder" yes/no before the picker, and no yes/no before "Use default" (guess for the latter: same reasoning); remove ("…and restarts; …Continue?", "Copying the store — CodeCharta restarts when it is done.", "Use the default store folder '<path>'? CodeCharta restarts.") | remove every "restarts" sentence; while copying keep the button `loading` with "Copying the store…"; after success a success toast and the rows show the new path |
| design 01 | Deviations item 2 ("Confirm before changing the store folder") | delete: decided, no confirmation (open question 11) |
| design 01 | D4 core state table | add an app-wide offline presentation (guess: a slim banner or status element, not only the tools panel) with wording for offline, reconnecting and back online; keep "Restart core" button; define what each core-backed area shows meanwhile (guess: last known data, actions disabled) |
| design 00 / other design files | (not read in full) | any screen that assumes core data is always present needs an offline state; flag for the designer |

## OD2a — The workspace status has a fixed width (2026-11-18)

Its width is fixed per window size; activity, percentages and badges change how many characters of the
text fit, never the element's size. Icons sit in a fixed-size slot so a spinner or arrow never moves
the text. Running work is animated only there: History, the project overview and the commit list show
it as static text. Design: `05-snapshots.md` W1, `04-history.md` H5, `00-design-principles.md` §5.

## OD6 — Modernised metrics bar (2026-11-18)

The metrics bar keeps all its controls, recoloured by the theme, as one rounded rectangle with nothing
protruding: the Layout tab and the view-tools tab move inside the bar, the link button becomes a
square inside it, and the rotated LEGEND edge tab becomes a Legend tool in the bar. Design:
`02-themes.md` T4. Plan impact: a new milestone (or part of plan 02 M1) touching `metricsBar`,
`shared/barShell`, `shared/barToolsTab`, `shared/barTool`, `legend/legendDrawer` and `domainBar`; their
specs and e2e page objects that locate the tabs and the legend button change.

## OD7 — Blended edges in the file extension bar (2026-11-18)

The bar showing each language's share blends neighbouring colours over a short distance (24 px per
boundary, centred on it; doubled from 12 px at the owner's request) instead of a hard edge with a white gap; shares stay readable as exact
percentages. Design: `02-themes.md` T5. Plan impact: small change in `features/fileExtensionBar`
(segment inputs for the neighbouring colours, container `gap-px` removed); can ship with OD6.

## OD8 — Toasts at the top right (2026-11-18)

Every toast appears at the top right of the window, just below the nav bar (today it sits at the very
top, covering the nav bar's right end). Design: `00-design-principles.md` §3 "Toasts". Plan impact: one
class on `features/shared/components/toast/toast.component.html`; shared by every plan.

## OD9 — The stale notice is a persistent toast (2026-11-18)

The "stale by N commits" notice (`05-snapshots.md` S2) is no longer a banner centred under the nav bar:
it is a persistent toast, always first in the top-right toast stack above every ordinary toast, closed
only by its dismiss button or when the situation resolves. While an analysis runs it shows static text
and Cancel; the progress itself stays in the workspace status. Plan impact: plan 05's
`cc-snapshot-notice` placement (`fixed … z-[70]` under the nav bar) is replaced by projection into
`cc-toast` (`<ng-content />` added to `features/shared/components/toast/toast.component.html`).
