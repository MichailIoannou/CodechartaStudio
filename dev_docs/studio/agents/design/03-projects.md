# 03 — Projects: interface design

Plan: `03-projects-and-managed-store.md` (sections 5 and 6, milestones M5–M7).
Principles: `00-design-principles.md`. Desktop only unless a section says otherwise.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| P1 | Project menu (projects, folders, working folder) | `cc-project-switcher` | nav bar, `navbar-start` | `cc-map-selector` dropdown |
| P2 | (removed by OD1; its place holds `05-snapshots.md` W1) | — | — | — |
| P3 | Project overview page | `cc-project-overview` | route `#/project` | `cc-sidebar-inspector` label/value rows, `scenarioListDialog` lists |
| P4 | Create project dialog | `cc-create-project-dialog` | hosted by P1 | `saveScenarioDialog` |
| P5 | Folder list editor | `cc-folder-list-editor` | inside P4 and P6 | `mapSelector` rows |
| P6 | Manage project dialog | `cc-manage-project-dialog` | hosted by P1 | `globalConfigurationDialog` + `explorerModeToggle` |
| P7 | Delete project confirmation | inside P6 | — | `deleteConfirmDialog` |
| P8 | Open / import cc.json dialog | `cc-open-file-dialog` | hosted by P1 and P3 | `saveScenarioDialog` |
| P9 | Move / bind snapshot dialog | `cc-move-snapshot-dialog` | hosted by the snapshots dialog (area 05) | `saveScenarioDialog` |
| P10 | Imported-snapshot label | text pattern | W1, P3, P8, area 05 lists | — |
| P11 | Drop target (optional, M6.5) | host listeners on `views/codeCharta.component.ts` | full window overlay | loading overlay geometry |
| P12 | Source files of a project map (03-M7) | existing source view | source view header | `alert` |

Store location ("Change…", "Use default") is designed in area 01 (desktop tools panel), as plan 03 asks.

---

## P1 Project menu

**Where.** `navBar.component.html`, `navbar-start`, after the divider, in place of
`<cc-nav-bar-folder-button>` when `isDesktop()`. The web build keeps the folder button (D1).
Owner decision OD1: a project groups folders, and the user works in one of them at a time, the
**working folder**. This menu is where both are chosen.

**Trigger.** `btn btn-ghost btn-sm justify-between min-w-0` (widths per principles §3):
`fa-solid fa-layer-group`, project name `text-base-content/60`, a `/` separator, working-folder label
`font-medium`, `fa fa-caret-down`. Both names `truncate`, the folder name keeps priority (the project
name shrinks first: `shrink` on it, `shrink-0` up to `max-w-32` on the folder). Below 1280 px only the
folder label shows. `title`: "Project 'billing', working folder 'billing-api' (C:\work\billing-api) —
switch folder or project". No project: "No project" in `text-base-content/60`.

```
[▣ billing / billing-api ▾]
┌──────────────────────────────────────────────────────────┐
│ BILLING                                [ⓘ Overview]     │  current project header + overview link
│ ● billing-api     primary  ⎇ main          C:\work\…     │  working folder: filled dot, bg-primary/20
│ ○ billing-web     fork     ⎇ feature/x                   │
│ ○ out             helper   plain folder                  │
│ ──────────────────────────────────────────────────────── │
│ OTHER PROJECTS                                           │
│ ▸ codecharta              2 folders                      │  collapsed project row
│ ▾ dotfiles                1 folder                       │  expanded: its folders below
│     ○ dotfiles   primary  ⎇ main                         │
│ ──────────────────────────────────────────────────────── │
│ ＋ New project…   📂 Open cc.json…  Ctrl+O              │
│ ⚙ Manage project…   ✕ Close project                    │
└──────────────────────────────────────────────────────────┘
```

- Dropdown content: map-selector classes (`z-[70]`, `w-[26rem] max-w-[32rem] p-2`), body
  `max-h-[70vh] overflow-y-auto`; headers in the explorer header style.
- **Current project section.** Header: project name (`text-xs font-semibold uppercase tracking-wide`)
  and `btn btn-ghost btn-xs` "Overview" (`fa-circle-info`) opening the project overview (P3). One row per
  folder, `role="menuitemradio"`, `aria-checked` on the working folder: radio dot (`fa-circle
  text-primary` filled / `fa-regular fa-circle`), label `font-medium truncate`, role `badge badge-ghost
  badge-xs` (primary / fork / helper), current branch `text-xs text-base-content/60` with
  `fa-code-branch` ("plain folder" for non-git, "missing" `text-warning` + `fa-triangle-exclamation`
  for missing folders), path `font-mono text-xs truncate max-w-40` (full in `title`). The working-folder
  row has `bg-primary/20`.
- **Other projects.** One row per project (`collapse`-like disclosure: `fa-caret-right/down`, name,
  "n folders" `text-xs text-base-content/60`, `fa-triangle-exclamation text-warning` when a folder is
  missing). Expanding shows its folders as rows like above, indented `pl-6`. Sorted by name;
  expansion state is not remembered.
- **Choosing a folder** (in any project) switches to it: `ProjectsService.openProject(projectId)` when
  the project changes, then `setWorkingFolder(folderId)`, which loads that folder's last shown analysis
  (or the project overview when it has none). The menu closes. Choosing the current working folder only
  closes the menu.
- Footer actions as `cc-context-menu-item`-styled buttons in two rows: "New project…", "Open cc.json…"
  (with `kbd`-less hint "Ctrl+O" `text-xs opacity-60`), "Manage project…", "Close project" (the last two
  disabled without an active project).

**States.**

| State | Look |
|---|---|
| no project open | current-project section replaced by `text-xs text-base-content/60 px-2` "No project open."; "OTHER PROJECTS" becomes "PROJECTS" |
| no projects at all | "No projects yet." and the footer only |
| loading after a choice | the chosen row shows `loading loading-spinner loading-xs`; other rows disabled; the views' loading overlay shows as today |
| many projects / folders | body scrolls at `max-h-[70vh]` |
| long names | `truncate`, full text in `title` |
| error | menu closes; toast (error) "Could not open 'billing-web': <message>"; the previous folder stays |

**Keyboard.** Trigger `aria-haspopup="menu"`, `aria-expanded`. ArrowDown opens and focuses the working
folder; ↑/↓ move over folder rows, project rows and actions; → expands a project row, ← collapses
it (or moves to its project row from a folder); Enter chooses; Escape closes and refocuses the trigger.
`Ctrl+O` (`Cmd+O` on macOS) runs "Open cc.json…" from anywhere in the desktop app, except while a modal
dialog is open or focus is in an `input`/`textarea`.

**Data.** `ProjectsService.projects()` (with each summary's folders: label, role, kind, status; see
Deviations 3), `activeProject()`, `workingFolder()`, `isBusy()`; `openProject(id)`, `openProject(null)`
for Close, `setWorkingFolder(folderId)`; branch per folder from `GitRepositoryService.branchOf(folderRef)`
(cached `git.status` heads, fetched when the menu opens, shown as "…" until known).

## P2 (removed)

The multi-folder selector of plan 03 is gone (owner decision OD1). Its nav-bar place holds the
**workspace status** element, `05-snapshots.md` W1, which shows what the map shows for the working
folder, its branch and git state, and any running analysis or git operation.

## P3 Project overview

**Where.** A page under the nav bar, route `#/project` (`routePaths.project = "project"`), lazy
component `cc-project-overview`; no view-switcher tab is active while it shows. It is also what the app
shows when no map can be shown (no project, or a working folder without analyses), replacing plan 03's
`@if (showsProjectHome())` switch with a redirect to this route. Opened from the project menu's
"Overview", from the workspace status menu ("Project overview"), and by the boot flow. Host
`block min-h-[calc(100vh-var(--cc-bars-height))] bg-base-100 overflow-y-auto`; content `max-w-5xl
mx-auto px-4 py-6 flex flex-col gap-6`. Leaving it: any view tab, or "Show map".

**(a) Project open — overview**

```
billing                                                    [⚙ Manage project…]
Invoicing services and their deployment scripts.            (description, text-base-content/70)

┌ WORKING FOLDER ──────────────────────────────┐ ┌ ANALYSES ────────────────────────────────┐
│ ⎇ billing-api   primary                       │ │ In the map   9f8e7d6 Release 2.4.0        │
│ C:\work\billing-api            [Show in files]│ │              stale by 4 (current checkout │
│                                                │ │              a1b2c3d)                     │
│ Branch     feature/invoice-rounding           │ │ Latest       9f8e7d6 · 28 Oct, 1 min 12 s │
│ Upstream   origin/feature/invoice-rounding    │ │ Analyses     12 · 61.2 MB                 │
│            ↑2 to push · ↓1 to pull  [↓ Pull 1 ▾]│ │ Running      a1b2c3d 42 % [██████░░]     │
│ Changes    3 uncommitted (1 staged)            │ │                                           │
│ Last commit a1b2c3d Fix invoice rounding       │ │ [▦ Show map] [▶ Analyse current checkout] │
│            Mia Chen · 2 hours ago              │ │ [Snapshots…]                              │
│ Remotes    origin github.com/acme/billing-api │ └───────────────────────────────────────────┘
│ [Open History]                                 │
└────────────────────────────────────────────────┘
RECENT COMMITS                                            [Open History]
 ◉ a1b2c3d  Fix invoice rounding                 Mia Chen  2 hours ago   42 %
 ● 7c8d9e0  Merge branch 'main' into feature/x   Mia Chen  2 days ago
 ● 4f5a6b7  Add currency table                   Mia Chen  3 days ago
 ● 9f8e7d6  Release 2.4.0                        Jo Park   5 days ago    in map
 ● 2b3c4d5  Start the invoice module             Jo Park   1 week ago    analysed

FOLDERS OF THIS PROJECT                                   [＋ Add folder…]
 ● billing-api   primary  ⎇ feature/invoice-rounding  12 analyses   (working)
 ○ billing-web   fork     ⎇ main                       3 analyses    [Work here]
 ○ out           helper   plain folder                 1 imported    [Work here]
   Imported maps only. Add the repository folder and move the snapshot to it.
```

- Title `text-2xl font-bold`, description `text-base-content/70`, "Manage project…" `btn btn-sm`.
- Two cards side by side (`grid md:grid-cols-2 gap-1.5`; stacked below 768 px) on the page's
  `bg-base-200` backdrop, each an island `rounded-[10px] bg-base-100 p-4` without border lines, header in the explorer header style. Label/value rows
  `grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm`, labels `text-base-content/60`.
- **Working folder card**: label + role badge; path `font-mono text-xs` + "Show in files"
  (`fa-regular fa-folder-open`, reveal); Branch (detached: "detached at a1b2c3d"); Upstream with
  ahead/behind sentence ("in sync" / "no upstream" / "upstream gone") and the contextual sync button
  (`04-history.md` H5, same component); Changes ("clean" / "3 uncommitted (1 staged)" / "merge in
  progress — 2 conflicts" `text-warning`); Last commit (short SHA, subject, author, relative date);
  Remotes (name + host/path, never credentials); "Open History" `btn btn-sm`. Plain folder: rows Branch,
  Upstream, Changes, Last commit, Remotes are replaced by "Plain folder — no git history." Missing folder:
  `alert alert-warning text-sm` "This folder was not found on disk. Its analyses still open." +
  "Re-link…".
- **Analyses card**: In the map (display name + the staleness sentence of `noticeText`, or "nothing
  shown"); Latest (short SHA, date, duration); Analyses (count, store size); Running (job and percentage as
  static text, only while one runs; the animated progress is in W1 at the top); buttons "Show map" (→ metrics view, disabled with title "No analysis yet"
  when there is none), "Analyse current checkout", "Snapshots…". No analyses: "No analysis yet. Analyse
  the current checkout to see its map." with "Analyse current checkout" as `btn-primary`.
- **Recent commits**: the 10 newest commits of the current branch, as History rows without the graph
  (`04-history.md` H8 badges and analysis column), HEAD marked with the ring; clicking a row opens
  History with that commit selected; "Open History" in the header. Absent for plain folders.
- **Folders of this project**: one row per folder with radio dot, label, role, branch / kind, analysis
  count, "Work here" `btn btn-xs` (= choosing it in P1; the working folder shows "(working)"
  `text-base-content/60`), "Import cc.json…" in the row's overflow, "Re-link…" for missing ones, the
  plain-folder hint (plan 03 §6.3). "Add folder…" in the header (`projects.addFolder`).
- Refresh: data re-reads on opening the page and on window focus (throttled as History, plan 04 G5).

**(b) No project open** (boot without an active project, or after "Close project")

```
                 CodeCharta
   Open a project to see its code as a city.
   [ ＋ New project… ]  [ 📂 Open cc.json… ]  [ Show sample maps ]

   PROJECTS
   ▣ billing        3 folders · 41 analyses        ⚠ 1 folder missing   ▸
   ▣ codecharta     2 folders · 12 analyses                              ▸
```

- Project rows (`rounded-box border border-base-300 divide-y divide-base-300`, rows `px-4 py-2
  hover:bg-base-200`, sorted by last update) open the project with its stored working folder. Empty:
  "No projects yet. A project groups the folders of one codebase — the repository, forks, helper
  folders."

**(c) Store problem** (`storeProblem() !== null`; replaces (a)/(b))

`alert alert-error` in the content column, "The analysis store cannot be used." and one sentence:

| Code | Sentence |
|---|---|
| `STORE_LOCKED` | "Another CodeCharta window is using the store. Close it and try again." + "Try again" |
| `STORE_NEWER_SCHEMA` | "The store was written by a newer version of CodeCharta. Update the app, or choose another location." |
| `IO_ERROR` | "The store folder could not be read or written: <message>" |

Buttons "Open store folder" (reveal `storeRoot`) and "Choose another location…" (`store.chooseRoot`,
area 01 D3 flow).

**States.** Loading: skeleton rows inside each card (cards keep their size). Git data failing: the
working-folder card shows the area 04 problem sentence for the code in place of the git rows. Long
values truncate with `title`. Narrow: cards stack; folder rows wrap their buttons.

**Keyboard.** Page, not dialog: natural Tab order header → working-folder card → analyses card →
recent commits (rows are buttons) → folders.

**Data.** `ProjectsService.activeProject()`, `workingFolder()`, `snapshotsByFolder()`,
`storeProblem()`; `GitRepositoryService.status()`, `refs()` (upstream, remotes), `git.log` first page
of `Head` scope (10 rows) through `GitLogService` or one direct call; `SnapshotViewService.state()`,
`noticeText`; `AnalysisJobsService.jobs()`; `snapshots.usage`; `projects.folderPath` (reveal).

---

## P4 Create project dialog

**Where.** Native `<dialog class="modal">`, hosted by P1; also opened from P3 (b). `modal-box
max-w-2xl`.

```
┌ New Project ─────────────────────────────────────────────────────────────┐
│ Name                                                                     │
│ [billing                                                              ]  │
│ Description (optional)                                                   │
│ [                                                                     ]  │
│                                                                          │
│ Folders                                                    [＋ Add folder…] │
│ ┌ P5 folder list editor ───────────────────────────────────────────────┐ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                   [Cancel] [Create project] │
└──────────────────────────────────────────────────────────────────────────┘
```

- Title "New Project". Name `input input-bordered w-full`, `maxlength` from plan 03's `ProjectName`
  limit; description `textarea textarea-bordered rows-2`.
- Name is prefilled from the first added folder's suggested label while the user has not typed one.
- Validation: name empty → "Create project" disabled, `label-text-alt text-error` "A name is
  required." shown after the field was touched (as `saveScenarioDialog`).
- A project with no folders is allowed (it opens on the project overview, P3 (a), with "Add folder…").
- Create: button `loading` while `projects.create` runs; error → `alert alert-error text-sm` above the
  footer with the message, dialog stays open. Success → closes, `openProject(id)`.

**Keyboard.** Initial focus: Name. Enter in Name does not submit (folders may follow); Ctrl+Enter
submits when valid. Escape cancels; picked folders are discarded (their pick tokens expire).

**Data.** `projects.create { name, description?, folders: NewFolder[] }`.

## P5 Folder list editor

Shared by P4 and P6 "Folders".

```
│ ⎇  billing-api                                   [primary ▾]  git   ✕ │
│    C:\work\billing-api · origin github.com/acme/billing-api            │
│ ⎇  billing-api-fork                              [fork    ▾]  git   ✕ │
│    D:\forks\billing-api · fork of billing-api                         │
│ 📁 out                                           [helper  ▾]  plain ✕ │
│    C:\work\billing\out                                                │
```

- Row: kind icon, label `input input-ghost input-sm` (edit in place, `aria-label` "Folder label"),
  role `select select-bordered select-xs` (Primary / Fork / Helper), kind badge, remove
  `btn btn-ghost btn-xs btn-square fa-xmark` (`aria-label` "Remove folder <label>").
- Second line `text-xs text-base-content/60`: path (`font-mono`, truncated, `title` full), first remote
  host/path (never credentials; plan 03 strips them), relationship hint.
- "Add folder…" → `projects.pickFolder()`; `null` (cancelled) does nothing. Defaults per plan 03:
  first folder primary; later folder sharing history with the primary → fork; else helper. A folder
  already in the list → toast (info) "'<path>' is already part of this project."
- Labels must be unique and contain no `/` (display names, plan 03): inline `text-error text-xs`
  "Another folder already uses this label." / "A label cannot contain '/'."
- Exactly one primary: choosing primary on a row demotes the former primary to helper.
- Empty: `text-sm text-base-content/60 py-4 text-center` "No folders yet. Add the repository folder
  first; forks and helper folders can follow."
- In P6, a `missing` row adds `badge badge-warning badge-xs` "missing" and `btn btn-xs` "Re-link…",
  and removing a folder that has snapshots asks P5-confirm (below).

**Remove-folder confirmation (P6 only, deleteConfirmDialog pattern).** Title "Remove Folder".
"Remove 'billing-api-fork' from the project? Its 7 analyses go to the recycle bin. The folder on disk is
not touched." Cancel / **Remove** (`btn-error`). Without snapshots no confirmation.

**Re-link.** "Re-link…" → `projects.pickFolder()` → `projects.relinkFolder`; when the core answers that
the history differs: yes/no `ConfirmDialogComponent` title "Different History" message "'<path>' does
not share history with the analyses of '<label>'. Link it anyway?" → retries with
`acceptDifferentHistory: true`.

**Data.** `PickedFolder { path, suggestedLabel, kind, git }`; `projects.updateFolder`,
`removeFolder { permanently: false }`, `relinkFolder`, `refreshFolder`.

---

## P6 Manage project dialog

**Where.** Native `<dialog class="modal">`, `modal-box max-w-2xl`, hosted by P1 ("Manage project…")
and P3 (a). Sections switched by a segmented control (`explorerModeToggle` pattern, `join` of
`btn btn-sm join-item`, `aria-pressed`): **General · Folders · Analysis profile**.

```
┌ Manage Project ───────────────────────────────────────────────────────┐
│ [ General | Folders | Analysis profile ]                              │
│                                                                       │
│  (section body)                                                       │
│                                                                       │
│                                                             [Close]   │
└───────────────────────────────────────────────────────────────────────┘
```

- **General.** Name, Description (as P4), saved with "Save" (`btn btn-primary btn-sm`, enabled when
  changed). Below, separated by `divider`: "Delete project…" `btn btn-outline btn-error btn-sm` with
  `text-xs text-base-content/60` "Moves the project and its analyses to the recycle bin. Your folders
  are not touched."
- **Folders.** P5 editor; changes save per action (add, label blur/Enter, role change, remove);
  "Refresh" per row (`fa-rotate`, `aria-label` "Refresh git facts of <label>") → `refreshFolder`.
  Footer line: "Snapshots…" link button that closes this dialog and opens the snapshots dialog.
- **Analysis profile.** Exclude patterns `textarea textarea-bordered font-mono rows-4`, label "Exclude
  (one pattern per line)", placeholder `**/generated/**`; limit hint "Up to 50 patterns of 200
  characters." Analysers: one `checkbox checkbox-sm` per `AnalyserName`, label "Skip <name>" with
  plain names: "Raw text", "Unified (source code)", "Dependencies", "Domain language", "Git history",
  "SVN history". `cc-setting-toggle` "Run analysers in parallel". "Save" enabled when changed. Note
  `text-xs text-base-content/60`: "Changing the profile does not touch existing analyses; new analyses
  are stored next to them."
- Close with unsaved General/Profile changes: yes/no `ConfirmDialogComponent` "Discard Changes" /
  "Your changes to this project are not saved. Close anyway?"

**P7 Delete project** (deleteConfirmDialog pattern): title "Delete Project"; "Move the project
'billing' and its 41 analyses to the recycle bin? Your folders are not touched." Cancel / **Delete
project** (`btn-error`). Deleting the active project closes it (`setActive(null)`, overview (b)).

**States.** Saving: the section's Save button `loading`; errors: `alert alert-error text-sm` at the
top of the section. Long names/paths truncate with `title`. Many folders: section scrolls inside the
modal-box (`max-h-[60vh] overflow-y-auto`).

**Keyboard.** Initial focus: the segmented control. Left/Right arrow keys move between segments
(`join` buttons are a toolbar; `role="tablist"` with `aria-selected` on each).

**Data.** `projects.get`, `update`, `delete { permanently: false }`, folder methods as P5;
`AnalysisProfile { exclude, without, parallel }`; snapshot count from `ProjectSummary.snapshotCount`.

---

## P8 Open / import cc.json dialog

**Where.** Native `<dialog class="modal">`, `modal-box max-w-xl`, opened after
`snapshots.pickImportFile()` returns a `PickedImportFile` (`null` = cancelled, nothing shown). Two
modes from plan 03: **Open** (P1, P3 (b), Ctrl+O, drop) and **Import** (P3 (a) folder row overflow, target
fixed).

```
┌ Open cc.json ───────────────────────────────────────────────────────────┐
│ 📄 a1b2c3d.billing.cc.json.gz                              4.2 MB        │
│    Imported snapshot — analysis time unknown                             │
│    File date: 12 Nov 2026, 14:03                         (text-base-content/60)
│                                                                          │
│ Goes to   New project 'out' with folder C:\work\billing\out   [Change…]  │
│                                                                          │
│ ☑ Bind to commit a1b2c3d — Fix the invoice rounding                      │
│   The file name points to this commit of 'out'.                          │
│                                                                          │
│                                                   [Cancel] [Open]        │
└──────────────────────────────────────────────────────────────────────────┘
```

- Title "Open cc.json" / "Import cc.json".
- File line: `fa-file-import`, file name `font-medium break-all`, size right `tabular-nums`.
- The label "Imported snapshot — analysis time unknown" is shown verbatim (P10).
- **Target line** (Open mode): one sentence, names bold:
  - new project: "New project **out** with folder `C:\work\billing\out`"
  - existing: "Project **billing**, folder **out**"
  "Change…" (`btn btn-link btn-sm`) reveals two selects (`select select-bordered select-sm`):
  Project (existing projects + "New project '<suggested>'") and Folder (folders of that project).
  Import mode: target line is static "Folder **out** of project **billing**", no "Change…".
- **Commit binding.**
  - `hintCommit` set: `checkbox` checked by default, "Bind to commit `<short>` — <subject>", helper
    "The file name points to this commit of '<folder>'."
  - hint present, not resolved: `btn btn-link btn-sm` "Look for commit `<hash>` in another folder…" →
    folder picker → added to the project → `projects.resolveCommit`; success turns it into the checked
    option above; failure: `text-xs text-warning` "Commit `<hash>` is not in '<folder>' either."
    If picking the folder created a new project and the user then cancels the dialog, that project is
    removed again (owner answer O5 addendum); nothing the user did not confirm is kept.
  - no hint: nothing.
- **Duplicate** (`duplicateOf`): `alert alert-info text-sm` "This file was already imported into
  'billing'." Primary button becomes "Show existing snapshot".
- Primary: "Open" / "Import" (`btn btn-primary`), `loading` while `openFile` runs. Error: `alert
  alert-error text-sm` above the footer, dialog stays. Success: closes; the target folder becomes the working
  folder and the snapshot is shown (W1 then reads "imported · analysis time unknown" or "@ a1b2c3d").

**States.** Very large file: size shown as is; the loading overlay of the views shows while bytes
stream. Long paths: `break-all` in the target sentence. Picked file vanished before confirm: error
alert "The file is no longer available. Pick it again." with "Pick again…" button.

**Keyboard.** Initial focus: the primary button. Escape cancels. "Change…" moves focus to the
Project select.

**Data.** `PickedImportFile { fileName, sizeBytes, fileModifiedAt, commitHint, containingFolder,
hintCommit, existingTarget, duplicateOf }`; `ProjectsService.openFile(request)` /
`importSnapshot(...)`; `projects.resolveCommit`.

## P9 Move / bind snapshot dialog

**Where.** Native `<dialog class="modal">`, `modal-box max-w-md`, opened from an imported row of the
snapshots dialog ("Move to folder…", "Bind to commit…"; area 05).

```
┌ Move Snapshot ─────────────────────────────────────┐
│ a1b2c3d.billing.cc.json.gz · imported 12 Nov 2026  │
│ Folder   [billing-api           ▾]                 │
│ Commit   [a1b2c3d            ] [Check]             │
│          ✓ Fix the invoice rounding (Mia, 3 Nov)   │
│                              [Cancel] [Move]       │
└────────────────────────────────────────────────────┘
```

- Title "Move Snapshot" (from "Move to folder…") or "Bind to Commit" (same dialog, folder preset to
  the current one). Commit input `input input-bordered input-sm font-mono`, prefilled from the
  file-name hint, optional ("Leave empty to keep it unbound").
- "Check" → `projects.resolveCommit`: success `text-success` with `fa-check` and the subject line;
  failure `text-warning` "Not a commit of '<folder>'." The primary button is disabled while an entered
  hash is unchecked or unresolved.
- Primary "Move" / "Bind" → `snapshots.move`; error inline as P8.

---

## P10 Imported-snapshot label

Everywhere an imported snapshot appears, the analysis time is unknown and says so:

| Place | Text |
|---|---|
| P8 file line | "Imported snapshot — analysis time unknown" |
| W1 trigger (unbound) | "imported · analysis time unknown" (bound: "@ a1b2c3d" + badge-ghost "imported") |
| W1 `title` | "Imported snapshot — analysis time unknown\nFile date: <date>\nImported <date>" |
| snapshot lists (area 05) | analysed-at column "unknown (imported <date>)" |
| sort tooltip of lists | "Imported snapshots are sorted by the time they were imported." |
| commit unknown | "commit unknown" (`italic text-base-content/50`) |

Never show the file date as the analysis date.

## P11 Drop target (optional, only if spike M0.4 passed)

While a file is dragged over the desktop window: overlay `fixed inset-0 z-[1000] flex items-center
justify-center bg-base-100/80 border-4 border-dashed border-primary` with `fa-file-import text-4xl
text-primary` and "Drop a cc.json file to open it". Drop → the shell's native message box ("Open
'<file name>' from '<folder>'?", Open / Cancel; wording owned by plan 03) → P8. Dropping anything else:
toast (warning) "Only .cc.json and .cc.json.gz files can be opened." Absent in the web build.

---

## P12 Source files of a project map (03-M7)

Opening a file's source from a project map (node context menu "Open source", existing source view)
reads the file from the working folder on disk.

- **Folder missing**: the source view shows `alert alert-warning text-sm` "The folder '<label>' is not
  available, so its files cannot be opened." + `btn btn-sm` "Re-link folder…" (P5), instead of prose
  that tells the user where to go (O9.4).
- **Map shows another state than the disk**: when W1 is not "current" (the map shows a commit other
  than the checkout, or an imported snapshot), the source view header gets a `text-xs text-warning`
  line "This is the file as it is in the folder now, not at a1b2c3d." (imported: "…not as it was
  analysed."). No line when the map follows the current checkout, even with uncommitted changes.

## Deviations from the plan

1. **One working folder at a time (owner decision OD1).** Plan 03's folder selector, `showFolders`,
   `visibleFolderIds` and side-by-side display of several folders are dropped; the project menu (P1)
   chooses the working folder. Plan impact is listed in `owner-decisions.md`.
2. **Manage dialog has no "Snapshots" tab.** Plan 03 lists snapshots (delete, move, bind) in the
   manage dialog; plan 05 has `cc-snapshots-dialog` listing the same snapshots per folder. One list:
   the snapshots dialog (area 05) is built in plan 03 M6 with the columns plan 03 needs (commit,
   imported/created, size, flags; Open, Delete, Move to folder…, Bind to commit…) and extended by plan 05
   M4 (analysed at, profile, analyse actions, clean-up). It lives in `features/snapshots`, and the nav
   bar hosts it (nav bar → projects, nav bar → snapshots, snapshots → projects; no cycle). P6 links to
   it with "Snapshots…". "Delete project" moves from a tab to the bottom of "General".
3. **Project summaries carry their folders.** The project menu lists every project's folders, so
   `projects.list` returns, per `ProjectSummary`, the folders' `id`, `label`, `role`, `kind` and
   `status` (no git facts; branches are read lazily when the menu opens). Without it the menu would
   call `projects.get` once per project.
5. **Project home becomes the project overview page (owner decision OD4)**, a route that can be opened
   at any time, instead of a placeholder shown only when nothing is loaded.
4. **Project list order.** Plan 03 does not say; P1 sorts by name (finding), P3 by last update
   (resuming).
5. **Name prefill** from the first folder in P4 is an addition (saves typing; never overwrites a typed
   name).

## Proposed changes to existing UI (not assumed approved)

1. **Reset-map confirmation text, desktop only.** `confirmResetMapDialog` says "Uploaded maps, selected
   metrics and settings are reset to default". In desktop the store is not touched (plan 03), so the
   sentence is wrong there. Proposed desktop text: "Selected metrics and settings are reset to default.
   Your projects and analyses are kept." Web text unchanged.
2. **Map selector in desktop** is shown only for the sample maps (plan 03). No visual change.
