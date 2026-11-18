# 01 — Desktop tools: interface design

Plan: `01-core-and-desktop-shell.md` (§3.7, §3.8, §3.12 "Desktop tools", M4.2) and the store-folder
rows of `03-projects-and-managed-store.md` (M6.3–6.4). Principles: `00-design-principles.md`.
Desktop only.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| D1 | Desktop tools section | `cc-desktop-tools-panel` | Global Configuration dialog | `cc-setting-toggle` rows, `rounded-box border` block |
| D2 | Tool row | inside D1 | — | map-selector row with badge |
| D3 | Folders rows (data folder, store folder) | inside D1 | — | — |
| D4 | Core state notice | inside D1 | — | cluster-explorer `alert` |
| D5 | "Open desktop tools" deep link | used by areas 04, 05, 06 | opens the dialog scrolled to D1 | — |

## D1 Desktop tools section

**Where.** `globalConfigurationDialog.component.html`, after the `@if (canOpenLocalFolders)` toggle,
before the reset buttons: `@if (isDesktop()) { <cc-desktop-tools-panel /> }`. Absent in the web build.

```
┌ Desktop tools ──────────────────────────────────────────────── [⟳ Check again] ┐
│ Analyses and git history are available.                                        │  summary
│                                                                                │
│ Git            found       2.47.1   C:\Program Files\Git\cmd\git.exe   [Choose…]│
│   history, branches, analyses of commits                                       │
│ ccsh           found       2.4.0    C:\Users\mia\AppData\Roaming\npm\ccsh.cmd   │
│   runs the analyses                                   [Choose…] [Use default]  │
│ Java           too old     21.0.2   C:\jdk-21\bin\java.exe             [Choose…]│
│   runs ccsh — version 21.0.2 is older than 22.                                 │
│ GitHub CLI     found       2.62.0   …\gh.exe                           [Choose…]│
│   lists pull requests (optional)                                               │
│ GitLab CLI     not installed                                           [Choose…]│
│   lists merge requests (optional)                                              │
│ ────────────────────────────────────────────────────────────────────────────── │
│ Data folder    C:\Users\mia\AppData\Roaming\codecharta-visualization  [Show]   │
│ Store folder   C:\Users\mia\AppData\Roaming\…\store   [Show] [Change…]          │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Block `rounded-box border border-base-300 p-3 flex flex-col gap-2`. Header `flex items-center
  justify-between`: "Desktop tools" `font-semibold`, `btn btn-ghost btn-sm` "Check again"
  (`fa-rotate`, spins while checking).
- **Summary** `text-sm`, from `ToolsReport.canUseGit` / `canAnalyse`:

| canUseGit | canAnalyse | Text | Tone |
|---|---|---|---|
| yes | yes | "Analyses and git history are available." | `text-success` + `fa-check` |
| yes | no | "Git history is available; analyses need <missing list>." | `text-warning` |
| no | no | "Git history and analyses need <missing list>." | `text-error` |

  `<missing list>` names the failing required tools in order ("Java", "ccsh and Java").

## D2 Tool row

`grid grid-cols-[7rem_6.5rem_5rem_minmax(0,1fr)_auto] items-center gap-x-2 text-sm`, second line
spanning columns 2–5 in `text-xs text-base-content/60`.

| Column | Content |
|---|---|
| name | "Git", "ccsh", "Java", "GitHub CLI", "GitLab CLI" (`font-medium`) |
| state badge | `badge badge-sm`: `badge-success` "found"; required → `badge-error` "missing" / "too old" / "not working"; optional → `badge-ghost` "not installed", `badge-warning` "not working" |
| version | `font-mono text-xs tabular-nums`, "—" when unknown |
| path | `font-mono text-xs truncate`, full path in `title`; a custom path gets `badge badge-ghost badge-xs` "custom" before it |
| actions | `btn btn-ghost btn-xs` "Choose…"; "Use default" only for a custom path |

Second line = purpose + problem:

| Tool | Purpose |
|---|---|
| Git | "history, branches, analyses of commits" |
| ccsh | "runs the analyses" |
| Java | "runs ccsh" |
| GitHub CLI | "lists pull requests (optional)" |
| GitLab CLI | "lists merge requests (optional)" |

| State | Problem text appended after " — " |
|---|---|
| missing | "not found on PATH or in the usual folders. Install it, or choose the executable." |
| too old | "version <v> is older than <minimum>." |
| failed | "found, but it did not report a version: <detail first line>" |

- "Choose…" → `DesktopToolsService.chooseExecutable(tool)` (native picker in the shell). Cancelled:
  nothing changes. The chosen file fails the check: toast (error) "<file name> is not a working
  <tool>: <message>" and the old row stays (plan: a failed choose keeps the old report).
- "Use default" → `useDefault(tool)`; no confirmation (reversible).
- The links in other areas' hints ("Open desktop tools") open this dialog and scroll D1 into view
  with the failing row focused (D5). Data need: the settings button component exposes an
  `openGlobalConfiguration({ section: "desktopTools", tool? })` entry through its facade, since today
  only `cc-settings-button` can open the dialog.

## D3 Folder rows

- **Data folder** `<dataDir>` + `btn btn-ghost btn-xs` "Show" (`fa-regular fa-folder-open`, title
  "Show in file manager") → `showDataFolder()`.
- **Store folder** (plan 03 M6): path + "Show" + "Change…"; "Use default" only when custom.
  - "Change…" goes straight to the native folder picker (`store.chooseRoot`), with no confirmation
    (owner decision OD5). Cancelled: nothing changes.
  - While the core copies and reopens the store: the button is `loading`, text beside it "Copying the
    store…". All other D1 controls disabled. The app does **not** restart: when the core answers, the
    rows show the new path, a toast (success) says "Analyses are now kept in '<path>'.", and the
    renderer reloads projects, working folder and the shown analysis from the new store (plan impact in
    `owner-decisions.md` OD5).
  - Refusals (`store.changeRoot` errors) as toast (error): non-empty folder without a store "'<path>'
    is not empty and holds no CodeCharta store. Choose an empty folder."; I/O error "The store could
    not be copied: <message>". Nothing changes.
  - "Use default": no confirmation; `paths.resetStoreRoot`, same loading, toast and reload as above,
    no restart.

## D4 Core state (app-wide, owner decision OD5)

The app never closes or restarts because the core stops; it shows that the core is away and recovers
by itself when the core is back (plan 01's shell respawns it with backoff).

**Everywhere — a persistent toast** (owner-confirmed, OD5): the same kind as the stale notice
(`05-snapshots.md` S2): projected into the persistent slot of `cc-toast`, first in the top-right stack
(above the stale notice, which needs the core anyway), `alert shadow-lg text-sm w-96`, `role="status"`,
never closed by a timer and without a dismiss button while the core is away.

| `coreState()` | Persistent toast | Then |
|---|---|---|
| `starting` (first start) | none; the boot screen covers it | — |
| `restarting` (after a crash) | `alert-info`, `fa-plug`: "Reconnecting to the CodeCharta core…" "What is on screen stays; projects, git and analyses are paused." | — |
| `unavailable` (gave up) | `alert-warning`, `fa-plug-circle-xmark`: "The CodeCharta core is offline. What is on screen stays; projects, git and analyses are paused." Buttons "Restart core" (`btn btn-sm btn-primary`), "Open desktop tools" | stays until the core is back |
| back to `ready` after an outage | the persistent toast disappears | ordinary success toast (5 s): "Back online. Data reloaded." |

No spinner or progress in the toast (only the workspace status animates, principles §5). The workspace
status element (W1) shows `fa-plug-circle-xmark` in its icon slot and "Core offline" while offline, so
the state is visible even after other toasts pile up.

**What other areas do meanwhile:** keep showing their last data (the map, History lists, the project
overview); every action that needs the core is disabled with `title` "The CodeCharta core is offline";
open dialogs stay open, their submit buttons disabled the same way. Requests that fail with
`CORE_UNAVAILABLE` are not shown as error toasts one by one. On reconnect, every core-backed service
reloads its data (projects, working folder, git status and refs, snapshots, jobs).

**In this section** (above the tool rows, replacing them while the core is not ready):

| State | Look |
|---|---|
| starting | `alert alert-info text-sm` with `loading-spinner loading-xs` "Starting the CodeCharta core…" |
| stopped / crashed / unavailable | `alert alert-error text-sm` "The CodeCharta core is not running. Projects, git and analyses are paused until it is back." + `btn btn-sm` "Restart core" |
| restarting | as starting, "Restarting the CodeCharta core…" |

## States of the whole section

| State | Look |
|---|---|
| first load (`tools.doctor { refresh: false }`) | five skeleton rows (`skeleton h-4`) |
| checking again | "Check again" disabled + spinning; summary replaced by "Checking 3 of 5…" (`core.progress`); rows keep their old values |
| check failed (`failure`) | `alert alert-error text-sm` "The tools could not be checked: <message>" + "Try again"; old report stays visible |
| cancelled | silent (plan) |
| long paths | truncate with `title`; the dialog does not widen (`max-w-2xl`) |
| narrow dialog (< 640 px) | grid becomes two lines per tool: name + badge + actions, then version + path |

**Keyboard.** Natural Tab order: Check again, then per row Choose…, Use default; then the folder
buttons. Icon-only buttons have `aria-label` = `title`.

**Data.** `DesktopToolsService.report()`, `paths()`, `isChecking()`, `progress()`, `failure()`;
`load()`, `recheck()`, `chooseExecutable(tool)`, `useDefault(tool)`, `showDataFolder()`;
`store.chooseRoot`, `paths.resetStoreRoot`; `DesktopEnvironment.coreState()`.

---

## Deviations from the plan

1. **Summary line** (D1) is an addition: five rows do not tell at a glance whether analyses can run.
2. **No restart and no confirmation when the store folder changes; app-wide offline state** (owner
   decision OD5): plan 03's `app.relaunch()` after `store.chooseRoot` / `paths.resetStoreRoot` is
   dropped, and the core-state display moves from this panel alone to the workspace status element.
3. **Worktree temp folder.** Plan 05's `worktree-failed` hint says "set a short worktree temp folder in
   Tools settings", but no such setting exists in plan 01's `CoreSettings` or here. Until a plan adds
   it, the hint keeps only the `core.longpaths` command (area 05 S6 already does).

## Proposed changes to existing UI (not assumed approved)

None. The section is new and absent in the web build.
