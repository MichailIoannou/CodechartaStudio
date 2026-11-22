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
| D6 | Title bar setting (O10) | `cc-window-title-bar-setting` | Global Configuration dialog, after D1 | `cc-setting-toggle` |
| D7 | Window controls (O10) | `cc-window-controls` | nav bar, end (Linux) / reserved space (Windows, macOS) | KDE Breeze, Windows 11, macOS |

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
| custom path missing | "Custom path not found: <path>" |
| too old | "version <v> is older than <minimum>." |
| failed | "found, but it did not report a version: <detail first line>" |

- "Choose…" → `DesktopToolsService.chooseExecutable(tool)` (native picker titled "Choose <tool>",
  e.g. "Choose git"; Windows filter "Programs" `exe, cmd, bat`). Cancelled: nothing changes. The
  chosen file fails the check: toast (error) "The chosen file is not a working <tool>: <message>" and
  the old row stays (plan: a failed choose keeps the old report).
- "Use default" → `useDefault(tool)`; no confirmation (reversible).
- The links in other areas' hints ("Open desktop tools") open this dialog and scroll D1 into view
  with the failing row focused (D5). Data need: the settings button component exposes an
  `openGlobalConfiguration({ section: "desktopTools", tool? })` entry through its facade, since today
  only `cc-settings-button` can open the dialog. **Kept as designed** (implementation finding: the
  link opens the dialog but cannot reach the section yet). Until that entry exists the link opens the
  dialog at its top; it is never removed or relabelled. Target behaviour, once built: the dialog opens,
  D1 scrolls into view (`scrollIntoView({ block: "start" })` on the section, no animation), and the
  failing tool's "Choose…" button gets focus; with no `tool`, focus goes to "Check again". When that
  button is disabled (core offline), focus goes to the section heading (`tabindex="-1"`) instead (O9.1).

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

## D6 Title bar setting (owner request O10)

**Where.** Global Configuration dialog, desktop only, directly after D1, a section "Window" with one
`cc-setting-toggle` row:

```
Window
[ ] Use CodeCharta's title bar
    One bar at the top: the window buttons move into CodeCharta's top bar.
    Takes effect when CodeCharta restarts.                         [Restart now]
```

- Default **off** (the system title bar, as today): it is the safe choice on every Linux desktop and
  window manager, and the owner asked for a setting, not a new default.
- Stored in the shell's settings file (`readShellSettings`, next to `colorScheme`), because the window
  is created with it: a live window cannot switch between framed and frameless.
- After a change the helper line turns `text-warning` and "Restart now" (`btn btn-sm`) appears. It
  closes and reopens the window; the core keeps running and the projects, map and view state come back
  from the store and IndexedDB (no core restart, OD5). Without it the change applies at the next start.
- The dialog shows the row on every desktop platform. Nothing in the web build.

## D7 Window controls (owner request O10)

With D6 on, the native title bar and frame are gone and the nav bar is the only bar. The default menu
bar is already removed (macOS keeps its app and Edit menus in the system menu bar).

**Per platform.** The system draws the buttons wherever it can, because only the system's own
buttons behave exactly like the system's (snap layouts, accessibility, button order):

| Platform | Window setup (shell) | Who draws the buttons | Where |
|---|---|---|---|
| macOS | `titleBarStyle: "hiddenInset"`, `trafficLightPosition: { x: 16, y: 16 }` (centred in the 48 px bar) | macOS (real traffic lights) | left; the nav bar starts with an 80 px empty drag area before the logo |
| Windows | `titleBarStyle: "hidden"`, `titleBarOverlay: { color, symbolColor, height: 48 }` | Windows (real Windows 11 caption buttons, including the snap-layout flyout and the red close) | right; the nav bar ends `env(titlebar-area-width)` early |
| Linux | `frame: false` | CodeCharta (`cc-window-controls`, Breeze look) | right end of the nav bar, after Settings |

On Windows the overlay colours follow the theme: `color` = `base-100`, `symbolColor` =
`base-content`, sent again through `setTitleBarOverlay` whenever the theme changes.

**Linux buttons (KDE Breeze look).** Breeze is KDE Plasma's default decoration; the buttons are plain
glyphs, no frames, with a round highlight under the pointer:

```
… Settings   ⌄   ⌃   ✕        restored
… Settings   ⌄   ◇   ✕        maximized (restore glyph is Breeze's diamond)
```

- Order minimize, maximize/restore, close. Each `size-7` (28 px hit area), `gap-1`, `pr-1.5`; a
  `w-3` drag gap separates them from Settings. Glyphs are inline SVG, 12 px, `stroke-width 1.5`,
  `stroke="currentColor"`, round caps: chevron down, chevron up, diamond (a square rotated 45°),
  cross.
- Colours from the theme, so dark and light come for free: glyph `text-base-content/80`; hover a
  22 px circle `bg-base-content/15`; pressed `bg-base-content/25`. Close: hover circle `#da4453`
  (Breeze's red) with a white glyph, pressed `#b8323f`. Window not focused: glyphs
  `text-base-content/45`, still clickable.
- `aria-label` "Minimize", "Maximize" / "Restore", "Close"; `title` the same. Not in the Tab order
  (`tabindex="-1"`), like native buttons; the system shortcuts keep working. A keyboard focus ring
  still exists for screen-reader activation: `focus-visible:outline-2 outline-primary rounded-full`.
- The window cannot be maximized (`isMaximizable()` false): the middle button is disabled,
  `opacity-40`. Full screen (F11): the buttons hide; the nav bar stays.

**Drag region (all platforms).** The nav bar's background moves the window
(`-webkit-app-region: drag` on `<nav>`); every interactive element is `no-drag` (buttons, triggers,
tabs, dropdown panels, inputs, the Linux buttons). The empty space between the groups is the drag
area; at least the `w-3` gap before the window buttons and the macOS 80 px inset always stay free.
Double-click on a drag area maximizes or restores (macOS: as the system's "double-click a window's
title bar" setting says). Right-click: Windows shows its system menu (native); Linux shows a
`cc-floating-menu` with Minimize, Maximize / Restore, Close; macOS nothing.

**Space.** The right half of the nav bar holds only Settings, so on Windows (≈ 138 px of caption
buttons) and Linux (≈ 100 px) nothing else moves, down to 1024 px. On macOS the 80 px inset comes out
of the left half, which is already full: below 1280 px the logo and its divider hide while D6 is on
(the traffic lights already mark the window), which gives back about 90 px. During full screen on
macOS the traffic lights and the inset go away and the logo returns.

**Out of scope.** Other KDE decoration themes (Oxygen, Aurorae themes) and GNOME's Adwaita buttons
are not imitated: the Linux buttons always use the Breeze shape with the app's theme colours (owner
question 13). The button order follows the system where it can be read — KDE `kwinrc`
`[org.kde.kdecoration2] ButtonsOnRight` / `ButtonsOnLeft`, GNOME `org.gnome.desktop.wm.preferences
button-layout` — and is minimize, maximize, close on the right otherwise.

**For the implementer to verify** (not designable from here): frameless windows still resize from
their edges and keep their shadow on KDE (X11 and Wayland) and GNOME Wayland; double-click on a drag
region maximizes under Linux with `frame: false` (otherwise the shell handles the double-click).

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
