# 03 — Projects: interface design

Plan: `03-projects-and-managed-store.md` (sections 5 and 6, milestones M5–M7).
Principles: `00-design-principles.md`. Desktop only unless a section says otherwise.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| P1 | Project switcher | `cc-project-switcher` | nav bar, `navbar-start` | `cc-map-selector` dropdown |
| P2 | Folder selector (active folder, shown folders, snapshot status) | `cc-project-folder-selector` | nav bar map slot | `cc-map-selector` dropdown |
| P3 | Project home | `cc-project-home` | `views/codeCharta.component.html` instead of `<router-outlet>` | `scenarioListDialog` lists, page layout new |
| P4 | Create project dialog | `cc-create-project-dialog` | hosted by P1 | `saveScenarioDialog` |
| P5 | Folder list editor | `cc-folder-list-editor` | inside P4 and P6 | `mapSelector` rows |
| P6 | Manage project dialog | `cc-manage-project-dialog` | hosted by P1 | `globalConfigurationDialog` + `explorerModeToggle` |
| P7 | Delete project confirmation | inside P6 | — | `deleteConfirmDialog` |
| P8 | Open / import cc.json dialog | `cc-open-file-dialog` | hosted by P1 and P3 | `saveScenarioDialog` |
| P9 | Move / bind snapshot dialog | `cc-move-snapshot-dialog` | hosted by the snapshots dialog (area 05) | `saveScenarioDialog` |
| P10 | Imported-snapshot label | text pattern | P2, P3, P8, area 05 lists, chip tooltips | — |
| P11 | Drop target (optional, M6.5) | host listeners on `views/codeCharta.component.ts` | full window overlay | loading overlay geometry |

Store location ("Change…", "Use default") is designed in area 01 (desktop tools panel), as plan 03 asks.

---

## P1 Project switcher

**Where.** `navBar.component.html`, `navbar-start`, after the divider, in place of
`<cc-nav-bar-folder-button>` when `isDesktop()`. The web build keeps the folder button (D1).

**Trigger.** `btn btn-ghost btn-sm justify-between min-w-0` (widths per principles §3) with
`fa-solid fa-layer-group`, the project name (`truncate`), `fa fa-caret-down ml-2`.
`title`: "Project: <name> — switch, create or manage projects". No project: label "No project"
(`text-base-content/60`).

```
[▣ billing                 ▾]
┌──────────────────────────────────────────────┐
│ PROJECTS                                     │   text-xs uppercase tracking-wide opacity-60
│ ✓ billing                     3 folders      │   current: fa-check, font-semibold
│   codecharta                  2 folders  ⚠   │   ⚠ = missingFolderCount > 0
│   dotfiles                    1 folder       │
│ ──────────────────────────────────────────── │
│ ＋ New project…                              │
│ 📂 Open cc.json…                     Ctrl+O  │   shortcut hint text-xs opacity-60
│ ⚙ Manage project…                           │   disabled without an active project
│ ✕ Close project                             │   disabled without an active project
└──────────────────────────────────────────────┘
```

- Dropdown content: map-selector classes (`z-[70]`, `min-w-[14rem] w-max max-w-[32rem] p-2`). Project
  list `max-h-72 overflow-y-auto`, rows `button` `rounded-md px-2 py-1 hover:bg-base-200 w-full`,
  name `truncate`, folder count `text-xs text-base-content/60 tabular-nums`.
- Warning icon `fa-triangle-exclamation text-warning`, `title` "1 folder of this project is missing".
  A project whose summary has `problem` shows `fa-triangle-exclamation text-error` and the problem
  text in `title`; it can still be chosen (the home then shows the problem).
- Action rows are `cc-context-menu-item`-styled buttons inside the dropdown (`text-sm`, icon `w-4`).

**States.**

| State | Look |
|---|---|
| no projects | list replaced by `text-xs text-base-content/60 px-2 py-1` "No projects yet." |
| loading (`isBusy()` during `openProject`) | trigger shows `loading loading-spinner loading-xs` before the name; rows disabled |
| many projects | list scrolls (`max-h-72`); projects sorted by name, case-insensitive |
| long name | `truncate` everywhere, full name in `title` |
| bridge error on open | dropdown closes; toast (error) "Could not open the project '<name>': <message>"; signals keep the last good value |
| narrow window | trigger widths per principles §3 |

**Keyboard.** Trigger `aria-haspopup="menu"`, `aria-expanded`. ArrowDown opens and focuses the first
row; ArrowUp/Down move; Enter activates; Escape closes and refocuses the trigger. `Ctrl+O`
(`Cmd+O` on macOS) runs "Open cc.json…" from anywhere in the desktop app, except while a modal dialog
is open or focus is in an `input`/`textarea`.

**Data.** `ProjectsService.projects()`, `activeProject()`, `isBusy()`; `openProject(id)`;
`openProject(null)` for Close; "Open cc.json…" → `snapshots.pickImportFile()` then P8.

---

## P2 Folder selector

**Where.** Nav bar map slot (principles §3) while a project is active and a project map is shown.
Merges plan 03's folder selector with plan 05's snapshot chip (see Deviations): one trigger, one
dropdown.

**Trigger.**

```
one folder shown:      [⎇ codecharta @ a1b2c3d                     ▾]
                       [⎇ codecharta @ a1b2c3d  stale by 4         ▾]   ← badge added by area 05
imported, unbound:     [📥 billing · imported                       ▾]
several folders:       [⎇ codecharta @ a1b2c3d  +1 folder           ▾]
```

`btn btn-ghost btn-sm justify-between min-w-0` (widths per principles §3); icon `fa-code-branch`
(git folder) / `fa-folder` (plain) / `fa-file-import` (imported unbound); text = display name of the
active folder's shown snapshot (`snapshotDisplayName`, D7) with the short SHA in `font-mono`; `+n
folder(s)` in `text-base-content/60` when more than one folder is shown. `title`:
"<folder label> — <path>\nShowing <short> <subject>\nAnalysed <date>" (imported: "Imported snapshot —
analysis time unknown\nFile date: <date>").

**Dropdown.**

```
┌────────────────────────────────────────────────────────────────────┐
│ All · None · Invert                                                │  cc-selection-shortcuts (as today)
│ ☑ ● codecharta   primary              a1b2c3d  Fix layout     ✓    │  ● = active folder
│ ☑   codecharta-fork  fork · fork of codecharta  9f8e7d6 …     ✓    │
│ ☐   devops       helper               no analysis yet           (disabled)
│ ☐   old-share    helper  ⚠ missing    3c4d5e6 …          Re-link…  │
│ ──────────────────────────────────────────────────────────────────  │
│ [Snapshots…]                                          [ Apply ]     │
└────────────────────────────────────────────────────────────────────┘
```

- Row: `checkbox checkbox-xs`, active marker, label (`font-medium truncate`), role
  `badge badge-ghost badge-xs` ("primary", "fork", "helper"), relationship hint
  `text-xs text-base-content/60` ("fork of codecharta", "shares history with codecharta", "same remote
  as codecharta"), shown snapshot `font-mono text-xs` + subject `truncate max-w-48`, status icon
  (`fa-check text-success` ok, `fa-triangle-exclamation text-warning` missing, title "Folder not found
  on disk — its analyses still open").
- **Active folder.** The filled dot `fa-circle text-primary text-[8px]` marks the folder History and
  "Analyse" act on. Every other git row shows, on hover/focus, a `btn btn-ghost btn-xs` "Make active"
  (`aria-label` "Make <label> the active folder"). Plain folders can be active too (analyses run on
  their working tree; History is unavailable for them). Changing it takes effect at once, no Apply.
- Folder without snapshots: checkbox disabled, text "no analysis yet" `italic text-base-content/50`;
  area 05 adds a row button "Analyse" there.
- Missing folder: row keeps its checkbox (snapshots still load) and offers "Re-link…" (opens P6 on
  the Folders tab with the row focused).
- Footer: left `btn btn-ghost btn-sm` "Snapshots…" (opens the snapshots dialog of area 05, which
  plan 03 already needs for move/bind — see Deviations); right `btn btn-primary btn-sm` "Apply",
  disabled when the checked set equals the shown set or is empty (tooltip, as the map selector:
  "Select at least one folder" / "Nothing changed").

**States.** Loading after Apply: trigger spinner as P1, list disabled; the file-loading overlay of the
views shows as today. Load error: toast "The analysis of '<label>' could not be read" and the next
newest snapshot is shown (plan 03); if none is left, P3 state (c). One folder in the project: no
selection shortcuts, no checkbox column, no Apply; the dropdown is only status + "Snapshots…". Many
folders: list scrolls at `max-h-72`.

**Keyboard.** As the map selector: Tab through checkboxes and buttons; Space toggles; Enter on Apply.
Escape closes.

**Data.** `ProjectsService.visibleFolders()`, `activeProject().folders`, `snapshotsByFolder()`,
`shownSnapshots()`, `activeFolder()`; `showFolders(ids)`; **new** `setActiveFolder(folderId)` (see
Deviations); `util/folderRelationshipLabel.ts`, `util/snapshotDisplayName.ts`.

---

## P3 Project home

**Where.** `views/codeCharta.component.html`: `@if (showsProjectHome()) { <cc-project-home /> } @else
{ <router-outlet /> }`, below the nav bar. Host `block min-h-[calc(100vh-var(--cc-bars-height))]
bg-base-100 overflow-y-auto`; content `max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6`. While it
shows, the nav bar has no view switcher (plan 03) and no map slot.

**(b) No project open**

```
                 CodeCharta
   Open a project to see its code as a city.

   [ ＋ New project… ]  [ 📂 Open cc.json… ]  [ Show sample maps ]
     btn-primary          btn                   btn btn-ghost

   RECENT PROJECTS                                              (panel header style)
   ┌──────────────────────────────────────────────────────────────┐
   │ ▣ billing          3 folders · 41 snapshots      ⚠ 1 missing │  row = button, hover:bg-base-200
   │ ▣ codecharta       2 folders · 12 snapshots                  │
   └──────────────────────────────────────────────────────────────┘
```

- Title `text-2xl font-bold`, sentence `text-base-content/70`.
- Projects list: `rounded-box border border-base-300 divide-y divide-base-300`; rows as
  `scenarioItem` (`px-4 py-2`, name `font-medium`, meta `text-xs text-base-content/60`). Sorted by
  `updatedAt` newest first (this is "recent", unlike P1's alphabetical list).
- Empty list: section hidden; instead `text-sm text-base-content/60` "No projects yet. A project
  groups the folders of one codebase — the repository, forks, helper folders."
- Enter/click opens the project.

**(c) Project open, nothing to show**

```
   billing                                                   [⚙ Manage project…]
   No analysis to show yet.

   FOLDERS
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ ⎇ billing-api   primary   C:\work\billing-api        git   ok    0 analyses │
   │                                     [Import cc.json…]  [▶ Analyse]  ← area 05│
   │ 📁 out          helper    C:\work\billing\out        plain ok    0 analyses │
   │   Imported maps only. Add the repository folder and move the snapshot to it. │
   │ ⎇ billing-web   fork      D:\old\billing-web         git ⚠ missing           │
   │                                                    [Re-link…]               │
   └──────────────────────────────────────────────────────────────────────────┘
   [＋ Add folder…]
```

- Columns: icon, label (`font-medium`), role badge, path (`font-mono text-xs truncate`, full path in
  `title`), kind badge (`badge badge-ghost badge-xs` "git" / "plain"), status (`badge-success`
  "ok" / `badge-warning` "missing"), snapshot count. Actions right-aligned, `btn btn-sm`.
- Plain-folder hint (plan 03 §6.3) `text-xs text-base-content/60` under the row, shown when the folder
  is `plain` and holds only imported snapshots.
- "Add folder…" runs the P5 add flow and saves at once (`projects.addFolder`).

**(a) Store problem** (`storeProblem() !== null`; replaces (b)/(c))

```
   ⚠  The analysis store cannot be used.
      <sentence per code>
      [Open store folder]  [Choose another location…]
```

`alert alert-error` inside the content column. Sentences:

| Code | Sentence |
|---|---|
| `STORE_LOCKED` | "Another CodeCharta window is using the store. Close it and try again." + button "Try again" |
| `STORE_NEWER_SCHEMA` | "The store was written by a newer version of CodeCharta. Update the app, or choose another location." |
| `IO_ERROR` | "The store folder could not be read or written: <message>" |

"Open store folder" → reveal (plan 01 `reveal({ kind: "storeRoot" })`); "Choose another location…" →
`store.chooseRoot` (area 01 row's behaviour, relaunch on success).

**States.** Loading during `initialise()`: the existing `cc-boot-loading-indicator` covers it (no
new spinner). Bridge error listing projects: (b) with an `alert alert-warning` "Projects could not be
listed: <message>" and a "Try again" button. Narrow window: content column is `max-w-3xl` with `px-4`,
folder rows wrap their actions onto a second line (`flex-wrap`).

**Keyboard.** Natural Tab order: primary buttons, then project rows (buttons), or folder row actions.
Initial focus: none (page, not dialog).

**Data.** `ProjectsService.projects()`, `activeProject()`, `snapshotsByFolder()`, `storeProblem()`;
`openProject`, `addFolder`, `relinkFolder`; `showSampleFiles()`; `snapshots.pickImportFile()`.

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
- A project with no folders is allowed (it opens on P3 (c) with "Add folder…").
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
and P3 (c). Sections switched by a segmented control (`explorerModeToggle` pattern, `join` of
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
project** (`btn-error`). Deleting the active project closes it (`setActive(null)`, home (b)).

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
modes from plan 03: **Open** (P1, P3 (b), Ctrl+O, drop) and **Import** (P3 (c) per folder, target
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
  - no hint: nothing.
- **Duplicate** (`duplicateOf`): `alert alert-info text-sm` "This file was already imported into
  'billing'." Primary button becomes "Show existing snapshot".
- Primary: "Open" / "Import" (`btn btn-primary`), `loading` while `openFile` runs. Error: `alert
  alert-error text-sm` above the footer, dialog stays. Success: closes; the snapshot is shown (P2's
  trigger then reads "out · imported" or "out @ a1b2c3d").

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
| P2 trigger (unbound) | "<folder> · imported" (badge-ghost "imported" when bound: "<folder> @ a1b2c3d  imported") |
| P2 `title` | "Imported snapshot — analysis time unknown\nFile date: <date>\nImported <date>" |
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

## Deviations from the plan

1. **Folder selector and snapshot chip are one control (P2).** Plan 03 puts `cc-project-folder-selector`
   in the map slot and plan 05 adds `cc-snapshot-chip` right after it; both name the shown snapshot.
   Two adjacent triggers for the same thing crowd `navbar-start` (which also gets the project
   switcher) and break at 1280 px. Resolution: P2's trigger carries the staleness
   badge of area 05, and its "Snapshots…" button is the chip's click. Area 05 designs the badge and the
   dialog; it does not add a second nav-bar element.
2. **Manage dialog has no "Snapshots" tab.** Plan 03 lists snapshots (delete, move, bind) in the
   manage dialog; plan 05 has `cc-snapshots-dialog` listing the same snapshots per folder. One list:
   the snapshots dialog (area 05) is built in plan 03 M6 with the columns plan 03 needs (commit,
   imported/created, size, flags; Open, Delete, Move to folder…, Bind to commit…) and extended by plan 05
   M4 (analysed at, profile, analyse actions, clean-up). It lives in `features/snapshots`, and the nav
   bar hosts it (nav bar → projects, nav bar → snapshots, snapshots → projects; no cycle). P6 links to
   it with "Snapshots…". "Delete project" moves from a tab to the bottom of "General".
3. **Active folder is chosen explicitly.** Plan 03 defines `activeFolder = visibleFolders()[0]`, and
   plan 04's History toolbar has its own folder select (`GitRepositoryService.selectFolder`). With two
   sources, History and the stale notice can disagree, and a folder without snapshots (not visible)
   could never be active, so History could not show it. Resolution: one source of truth,
   `ProjectsService.activeFolder()`, persisted in the project view (core: `ProjectView.activeFolderId`,
   set through `projects.setView`); new method `ProjectsService.setActiveFolder(folderId)`. Default when
   unset: the first visible folder, else the primary folder. P2's "Make active" and the History
   toolbar select both call it; `GitRepositoryService.selectFolder` delegates to it.
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
