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
