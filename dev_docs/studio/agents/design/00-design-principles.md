# 00 — Design principles

Binding for every area file in this folder. An area file may add detail, never contradict this one.
Where an area file and a plan disagree about the interface, the area file wins (see its "Deviations
from the plan").

Source read for this file: `visualization/app/codeCharta/views/`, `features/{navBar,sidebarExplorer,
sidebarInspector,metricsBar,bottomBar,globalSettings,legend,shared,scenarios,nodeContextMenu}`,
`app/tailwind.css`, `app/app.scss` (visualization 2.11.0, read 2026-11-18).

## 1. The rule

Enhance the existing interface; do not redesign it.

- The shell stays: nav bar (`features/navBar/components/navBar/navBar.component.html`), left explorer
  (`cc-sidebar-explorer`), right inspector (`cc-sidebar-inspector`), floating metrics bar
  (`cc-metrics-bar`, bottom), file extension bar, bottom bar (`cc-bottom-bar`), the view switcher with
  its hover mode bar, the Global Configuration dialog.
- One new top-level view: **History** (area 04). Everything else goes into an existing region.
- **Web build:** every new desktop element is wrapped in `@if (isDesktop())`
  (`DesktopEnvironment.isDesktop`, plan 01 §3.12) and is *absent*, never disabled. The only new
  element visible in the web build is the theme picker in Settings (plan 02 themes both builds; no
  theme control in the nav bar, OD10).
- Existing controls are not moved, renamed, restyled or removed unless a plan replaces them. Every
  such change is listed in the area file under "Proposed changes to existing UI".

## 2. Regions and the patterns they already use

| Region | Template | Existing pattern to copy |
|---|---|---|
| Nav bar, left (`navbar-start`) | `navBar.component.html` | `btn btn-ghost btn-sm` triggers; dropdown = `cc-map-selector` |
| Nav bar, centre | `viewSwitcher.component.html` | `btn btn-ghost btn-sm` links + `cc-current-underline` |
| Nav bar, right (`navbar-end`) | `navBar.component.html` | `cc-settings-button` (`btn btn-ghost btn-sm`); unchanged, Settings only (OD10) |
| Hover mode bar under the switcher | `viewModeBar.component.html` | `cc-mode-toggle` (Explore / Compare, `role="tablist"`) |
| Dropdown | `mapSelector.component.html` | `.dropdown` + `dropdown-open`, content `bg-base-100 rounded-box border border-base-300 shadow-md mt-1 z-[70] p-2`, list `max-h-72 overflow-y-auto`, row `rounded-md px-2 py-1 hover:bg-base-200`, footer `flex justify-end mt-2` with `btn btn-primary btn-sm` |
| Modal dialog | `globalConfigurationDialog`, `saveScenarioDialog`, `scenarioListDialog` | native `<dialog class="modal">`, `modal-box max-w-{sm,md,xl,2xl}`, `h2 text-xl font-bold mb-4`, `form-control` + `label-text`, `input input-bordered`, `modal-action`, `form method="dialog" class="modal-backdrop"` |
| Yes/no question | `ConfirmDialogComponent` (`features/shared`) | fixed **No** / **Yes** |
| Destructive confirmation | `scenarioListDialog/deleteConfirmDialog` | `modal-box max-w-sm`, `h3 text-lg font-bold`, sentence, **Cancel** (`btn`) + verb (`btn btn-error`) |
| Popover anchored to a control | `cc-settings-popover-shell` | `popover` + CSS anchor positioning, `rounded-box bg-base-100 shadow-lg` |
| Context menu | `cc-node-context-menu` | `cc-floating-menu` + `cc-context-menu-item` (icon `w-4`, `title` = hover hint), dividers `my-1 border-t border-base-300` |
| Grouped list in a dialog | `scenarioListDialog` | `collapse collapse-arrow` per group, `badge badge-sm` count, rows like `scenarioItem` |
| Panel header | `explorerHeader` | `text-xs font-semibold uppercase tracking-wide`, collapse button `btn btn-ghost btn-xs btn-square` |
| Segmented control | `explorerModeToggle` | `join` of `btn btn-sm join-item`, `btn-active` + `aria-pressed` |
| Inline banner inside a panel | `explorerFocusBanner`, `clusterExplorer` alert | `rounded-md bg-secondary/10 text-secondary text-xs`; `alert alert-warning px-2 py-1 text-xs` |
| Transient message | `ToastService.show(text, severity, options?)` | top right, just below the nav bar (OD8); success/info 5 s, errors stay with Details and one action; persistent toasts (OD9) above them |
| Explorer mode | `EXPLORER_CONDITIONAL_MODES` (`provideClustersExplorerMode`) | mode in the explorer's join toggle, body projected as `[modeBody]` |
| Resizable side pane | `ccColumnResizeHandle` | as the explorer and inspector |
| Settings row | `cc-setting-toggle` | label + daisyUI `toggle` |

## 3. Nav bar composition (all plans together)

The nav bar is shared by plans 02–06. This is the single, final order; area files refer to it.

```
desktop, project open, map shown
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] │ [▣ billing / billing-api ▾] [⎇ feature/x  @ 9f8e7d6  stale by 4 ▾]   Metric Domain Dependencies History            Settings │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  start: logo, divider, project menu (03 P1), map slot = workspace status (05 W1) or comparison chip (06)
  centre: view switcher (+ History tab, 04)
  end: Settings (unchanged; no theme control, OD10)
```

Owner decisions OD1/OD2 (`owner-decisions.md`): the project menu chooses project and working folder;
the workspace status element W1 carries branch, map status, analyses and git activity with a progress
fill, replacing the map selector, the branch chip and the analyses indicator. The daisyUI `navbar`
gives `navbar-start` and `navbar-end` half of the space beside the centred view switcher each (≈ 485
px per half at 1280 px, ≈ 90 px of it for logo and divider), which holds exactly these two triggers.

Map slot, first match wins:

| Situation | Map slot shows |
|---|---|
| web build, delta state | `cc-delta-selector` (today) |
| web build | `cc-map-selector` (today) |
| desktop, project comparison active | W1 icon-only form + `cc-comparison-chip` (06) |
| desktop, delta state without a project comparison (sample maps) | `cc-delta-selector` |
| desktop, project active | `cc-workspace-status` (05 W1), also while the project overview shows |
| desktop, sample maps shown, no project | `cc-map-selector` |
| desktop, no project | nothing |

Web build left side stays exactly: logo, divider, `cc-nav-bar-folder-button`, map/delta selector.

**Narrow window.** Supported down to 1024 px wide (the Electron window minimum is set by plan 01; if
none is set, this design assumes 1024). Budget of the left half (window minus about 310 px of view
tabs, halved, minus the logo), widths capped by breakpoint, each step a Tailwind class on the element,
never JavaScript measuring:

| Window | Left budget | Project menu trigger | Workspace status trigger (W1) |
|---|---|---|---|
| ≥ 1536 (`2xl`) | ≈ 520 px | "project / folder", `max-w-52` | fixed `w-[22rem]`: icon, branch with ↑↓ counts, `@ sha` or activity, badge |
| 1280–1535 (`xl`) | ≈ 395 px | folder only, `max-w-28` | fixed `w-[17.5rem]`: icon, branch, `@ sha` or activity, badge |
| 1024–1279 | ≈ 265 px | folder only, `max-w-24` | fixed `w-40`: icon, `@ sha` or activity, badge as icon (branch in `title`) |

- `navbar-start` and `navbar-end` keep their halves and get `min-w-0 overflow-hidden`; their children
  `min-w-0`, so a trigger shortens its text with "…" instead of running under `navbar-center`; the view
  switcher never shrinks.
- Text inside every trigger is `truncate`; the full text is always in `title`.

**Toasts (owner decision OD8).** All toasts stack at the top right of the window, directly below the
nav bar: `features/shared/components/toast/toast.component.html` keeps `toast toast-top toast-end
z-[2000]` and adds `top-[var(--cc-bars-height,49px)]`, so daisyUI's own 1 rem margin puts the first
toast 1 rem under the nav bar and 1 rem from the right edge. Today the same classes place it at the
very top, over the nav bar's right end (Settings).

Order in the stack, top to bottom: **persistent toasts first** (the core-offline toast, 01 D4, then
the stale notice, 05 S2, owner decisions OD5 and OD9), then ordinary toasts, newest first. Persistent toasts are projected into
`cc-toast` through an `<ng-content />` placed before the `@for` over `messages()`; they have the same
`alert shadow-lg` shape, a dismiss button where dismissing is allowed, and never close on a timer.
Ordinary toasts: success and info close after 5 s; **error toasts stay until dismissed** (owner
decision, open question 5) and may carry a "Details" button, which expands the full technical message
inside the toast (`font-mono text-xs whitespace-pre-wrap max-h-40 overflow-auto`), and at most one
follow-up action button (`btn btn-sm`). All keep the dismiss button and `aria-live="polite"`.
`ToastService.show(text, severity, options?: { details?: string; action?: { label; run } })`; errors
ignore the timer. Used for every failed git operation (area 04) and failed analysis started outside
the stale notice. All toasts are `w-96
max-w-[calc(100vw-2rem)]` with wrapping text. They sit above the inspector (`z-[60]`) and may cover
its header.

## 4. Z-index layers in use

| Layer | Used by | New elements placed here |
|---|---|---|
| `z-0` | 3D map, radial map, dependency graph | — |
| `z-10` | bottom bar, resize handles, sticky list headers | sticky group headers in History lists |
| `z-50` | inline colour picker panel | — |
| `z-[60]` | explorer, inspector, legend drawer and its button | — (History panes are in-flow, not fixed) |
| `z-[70]` | nav-bar dropdowns, view mode bar and its handle, file extension bar | project menu, workspace status, branch-chip menu, comparison-chip menu, jobs list |
| `z-[100]` | floating context menus, file-extension menu | commit, branch, snapshot context menus |
| `z-[1000]` | loading overlays, code map error | — |
| `z-[2000]` | toast | the stale notice (05 S2), as a persistent toast |
| top layer | native `<dialog>` and `popover` | every new dialog and popover |

Credential prompts are native dialogs, so they sit in the top layer above everything, including other
open dialogs (the browser stacks a later `showModal()` on top).

## 5. Spacing and sizing

- Nav bar: `btn-sm`, `gap-1`, height `min-h-12` (unchanged). Panels: `px-2`, `py-1`/`py-2`, `btn-xs`
  for row actions, `btn-sm` for panel toolbars.
- Dropdown widths: `min-w-[14rem] w-max max-w-[32rem]` (map selector). Wider content scrolls, never
  widens past `max-w-[32rem]`.
- Modal widths: confirmation `max-w-sm`; single form `max-w-md`; list dialogs `max-w-xl`; multi-tab
  dialogs `max-w-2xl` (Global Configuration); the snapshots and compare dialogs `max-w-3xl`.
- List rows: 28 px (`h-7`) in History lists (virtualised, fixed height); dropdown rows `py-1`.
- Secondary text: `text-xs text-base-content/60`; tertiary `text-base-content/40`. Never below
  `/40` for anything a user must read.
- **Icon buttons.** An icon next to text is a direct child of the `btn` with `fa-fw`; the button's
  `inline-flex items-center gap-2` centres it. No margins on icons, no Unicode glyphs as icons.
- **Badges never cut off.** A badge with variable text is `inline-flex max-w-<n>` with the text in an
  inner `<span class="truncate">`; the badge keeps both rounded ends and the text ends in "…".
  Full text in `title`.
- **One place animates.** Running work (analyses, git operations) is animated only in the workspace
  status element (`05-snapshots.md` W1): spinner or arrow icon and progress fill. Everywhere else
  (History, the project overview, the commit list) it is a static label such as "Pulling…" or "42 %".
- **Fixed-size status.** An element whose content changes while the user watches (W1) has a fixed
  width per window size and fixed-size icon slots; content truncates, the element never resizes.
- **Islands, no divider lines** (owner, open question 10, after Rider 2026.2): panels are
  `rounded-[10px] bg-base-100` islands separated by 6 px of backdrop (`bg-base-200` in tiled views, the
  3D map in map views); floating panels keep 6 px from the window edges and use `shadow-lg` instead of
  a border. Nav bar, bottom bar and file extension bar stay flush.
- **Words over codes.** Status is said in a word ("modified", "analysed"), not a letter or a bare
  icon; an icon may accompany the word.
- Monospace (`font-mono`) only for short SHAs, refs in sentences, paths and commands to copy.

## 6. Colour

Only daisyUI semantic tokens and their opacity steps: `base-100/200/300`, `base-content` (`/40 /50
/60 /70`), `primary`, `secondary`, `accent`, `neutral`, `info`, `success`, `warning`, `error` and their
`-content`. No hex, no `bg-white`, no `text-black`, no `shadow-[…rgba]` additions.

Status meaning is fixed across areas:

| Meaning | Token | Example |
|---|---|---|
| fine / analysed / found | `success` | analysed-commit cube, tool found |
| needs attention, not broken (stale, dirty, missing folder, other profile) | `warning` | `stale by 4`, dirty dot |
| failed / blocking | `error` | failed analysis, missing required tool |
| running / neutral information | `info` or `primary` spinner | analysing, fetching |
| not applicable / optional | `badge-ghost` | optional tool not installed, imported |
| current / active | `primary` underline, `font-bold` | current branch, active tab |

## 7. Icons (Font Awesome 6, `fa-solid` unless noted)

| Meaning | Icon |
|---|---|
| project | `fa-layer-group` |
| folder (repository) / plain folder | `fa-code-branch` on the row / `fa-folder` |
| open cc.json | `fa-folder-open` (as today's upload button) |
| new | `fa-plus` |
| manage / settings | `fa-gear` |
| close project | `fa-xmark` |
| missing | `fa-triangle-exclamation` |
| branch, workspace status idle | `fa-code-branch` |
| tag | `fa-tag` |
| remote | `fa-cloud` |
| commit | `fa-circle-dot` |
| uncommitted changes | `fa-pen` |
| analysed snapshot | `fa-cube` |
| imported snapshot | `fa-file-import` |
| analyse | `fa-play` |
| show in map | `fa-map` |
| stale / nearest | `fa-clock-rotate-left` |
| cancel running | `fa-stop` |
| log | `fa-file-lines` |
| compare | `fa-code-compare` |
| swap sides | `fa-arrows-left-right` (today's `fa fa-arrows-h` stays where it is) |
| fetch / pull / push | `fa-cloud-arrow-down` / `fa-arrow-down` / `fa-arrow-up` |
| refresh | `fa-rotate` |
| stage / unstage / discard | `fa-plus` / `fa-minus` / `fa-rotate-left` |
| copy / copied | `fa-regular fa-copy` / `fa-check` |
| reveal in file manager | `fa-regular fa-folder-open` |
| external link (PR) | `fa-arrow-up-right-from-square` |
| pull request | `fa-code-pull-request` |
| delete | `fa-trash` |

## 8. Wording

- Match the existing mix: **dialog titles and context-menu items in Title Case** ("Global
  Configuration", "Save Scenario", "Show Source"); **buttons, labels, tooltips and sentences in
  sentence case** ("Apply", "Reset global settings", "Collapse explorer").
- A control that opens another dialog or picker ends in a single-character ellipsis: "New project…".
- Name the effect, not the mechanism: "Moves the project and its 12 snapshots to the recycle bin."
- Names of branches, folders, files in sentences go in single straight quotes: 'main'. Short SHAs are
  7 characters, `font-mono`, never quoted.
- Counts are pluralised correctly ("1 commit", "4 commits"); a pure helper does it, unit-tested.
- No "please", no "successfully", no exclamation marks. Errors say what happened and what to do.
- Tooltips via `title`. Every icon-only button has the same text in `title` and `aria-label`.
- Times: relative ("3 min ago", "2 days ago") in lists, absolute local date-time in `title`; analysis
  times that are unknown are always written "analysis time unknown", never left blank.
- Destructive confirmations: Cancel + a verb button ("Delete", "Discard", "Force push"), `btn-error`.
  Yes/No (ConfirmDialogComponent) only for genuinely yes/no questions that destroy nothing.

## 9. Keyboard and focus

- Native `<dialog>` with `showModal()`: focus trap and Escape come for free. Initial focus: the first
  input; for destructive confirmations, **Cancel**. Escape = Cancel everywhere, including prompts.
- Dropdowns: the trigger is a `button` with `aria-expanded`; ArrowDown opens and moves into the list;
  Escape closes and returns focus to the trigger; clicking outside closes.
- Lists that own arrow keys (`role="listbox"`, `aria-activedescendant`) **must stop propagation of the
  keys they handle**: the 3D map's OrbitControls listen for arrow keys on `window`
  (`threeMapControls.service.ts` `listenToKeyEvents(window)`) and the dependency graph pans on Space
  (`panKey.ts`, window listener). Keep-alive routing keeps those views mounted while History is shown.
- Global shortcuts introduced by these designs (checked: no existing `keydown` handler uses them):
  `Ctrl/Cmd+O` "Open cc.json…" (03). History-local keys are listed in area 04 and only act while
  focus is inside the History view.

## 10. Data access

Components read signals of the services named in the plans (`ProjectsService`,
`GitRepositoryService`, `SnapshotViewService`, `CompareService`, …) through their feature facades and
never call `DesktopBridge` directly. Area files name the signal or method for every element.

## 11. Dark and light checks

Dark (`cc-dark`) is the default; every screen is designed for it and then checked in `cc-light`.
For each new screen the implementer checks, in both themes:

1. Text on `base-100`, `base-200` and on every `badge-*` reaches 4.5:1 (daisyUI `-content` pairs do;
   opacity steps `/60` and above pass on `base-100` in both CodeCharta themes, `/40` is for
   decoration only).
2. Status colours are never the only signal: every badge has text or an icon with `title`.
3. Graph lane colours (area 04) are distinguishable on `base-100` in both themes.
4. Hover (`hover:bg-base-200`) and list selection (`bg-primary/20 font-semibold`, the explorer's
   "revealed" row style; the explorer's red `bg-error/20` stays reserved for the selected building)
   are visible in both themes.
5. Overlays and loading veils use `bg-base-100/80`, not `bg-white/80` (the two existing loading
   overlays are fixed by plan 02).
