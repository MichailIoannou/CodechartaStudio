# 02 — Themes: interface design

Plan: `02-themes.md` ("UI", "Error states and edge cases", M1, M5). Principles:
`00-design-principles.md`. **Web and desktop**: themes are the one new feature in both builds (the picker in Settings only).

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| T1 | Theme picker | `cc-theme-picker` | Global Configuration dialog, first row | `cc-setting-toggle` row |
| T2 | (removed by OD10: no theme control in the nav bar) | — | — | — |
| T3 | Dark chrome audit | checklist | every existing screen | — |
| T4 | Metrics bar, refreshed | `cc-metrics-bar`, `ccBarShell` | floating bar above the file extension bar | today's metrics bar |
| T5 | File extension bar, blended edges | `cc-file-extension-bar`, `cc-file-extension-bar-segment` | full-width bar above the bottom bar | today's file extension bar |

## T1 Theme picker

**Where.** `globalConfigurationDialog.component.html`, first child of the `flex flex-col gap-6` list,
above "Hide Flattened Buildings".

```
Theme   [ CodeCharta Dark            ▾ ]
          Currently: CodeCharta Light          ← only with "Follow system"
```

- Row `label justify-start gap-4` (same as `cc-setting-toggle`), text `label-text` "Theme", control
  `select select-bordered select-sm w-56` (`data-testid="theme-picker"`). The label is a `<label for>`
  so the name is announced.
- Options in this order, from `THEMES` grouped by `colorScheme`:

```
Dark
  CodeCharta Dark        (default)
  Nord
  One Dark
  VS Dark
  Darcula
Light
  CodeCharta Light
  VS Light
  Rider Day
──
  Follow system
```

  `<optgroup label="Dark">`, `<optgroup label="Light">`, then a plain `<option>` "Follow system".
- Hint under the select when the preference is `system`: `text-xs text-base-content/70` "Currently:
  CodeCharta Dark" (label of the resolved theme; updates live when the OS switches).
- The change applies at once (no Apply button), like the toggles beside it.
- "Reset global settings" includes the theme (plan M1 step 10): reset returns to CodeCharta Dark.
  Its tooltip stays "Reset global settings to their defaults".
- **States.** Unknown stored id → shows "CodeCharta Dark" (it is what is applied). Blocked
  `localStorage` → no visible difference (only the next start may flash). No `matchMedia` → "Follow
  system" resolves to CodeCharta Light and the hint says so.
- **Keyboard.** Native select: Tab to it, arrow keys change the theme immediately (each step applies;
  acceptable, the change is instant and reversible).

**Data.** `ThemeReadStore.preference()`, `.themes`, `.activeTheme()`; `ThemeWriteStore.setPreference`.

## T2 (removed)

There is no theme control in the nav bar (owner decision OD10). The theme is chosen only in the
Global Configuration dialog (T1).

## T3 Dark chrome audit

Dark is the default and is designed first. Plan 02 M1 replaces hard-coded chrome colours; this list
is what the design expects to look right in `cc-dark` and `cc-light` before M1 is released (found in
the templates on 2026-11-18):

| Place | Today | Expected in both themes |
|---|---|---|
| `bootLoadingIndicator`, `loadingFileProgressSpinner` | `bg-white/80` veil | `bg-base-100/80` (boot screen uses the plan's `--cc-boot-*` colours) |
| `globalConfigurationButton` | `group-hover:bg-[#0374c9]` | `group-hover:bg-secondary` |
| `viewCube/zoomSlider` | Tailwind `text-neutral-500`, `bg-neutral-500` | `text-base-content/60`, `bg-base-content/60` |
| explorer and inspector hosts | `shadow-[…rgba(0,0,0,0.15)]` only | shadow kept, plus `border-base-300` edge so the panel edge shows on dark (see Proposed changes) |
| `markFolderRow` swatch check mark | `text-white` on a user colour | unchanged (sits on the user's colour, not on chrome) |
| `.cc-current-underline`, `.cc-syntax`, `.cc-source` | tokens | unchanged |
| toasts, dialogs, dropdowns, popovers | tokens | unchanged; check the ngx-color popover by eye (plan M1 step 11) |

Every new element of areas 01 and 03–06 already uses tokens only (principles §6), so it follows the
theme without per-theme work. Graph lane colours (area 04) and status badges are checked in each of
the eight themes by the plan's smoke test (M5 step 2) plus an eyeball pass of the History view.

## T4 Metrics bar, refreshed (owner decision OD6)

The floating metrics bar keeps **every control it has today**, in the same order and with the same
popovers; it is recoloured by the theme and its shape is modernised: one rounded rectangle, and
nothing sticks out of it. Today three things protrude: the **Layout** tab above its left edge
(`layoutTab`, `rounded-t-md border-b-0`), the **view tools** tab above its right edge
(`barToolsTab`, `absolute bottom-full`), and the round **link** button between Height and Color
(`btn-circle` with a ring). The rotated **LEGEND** tab on the right screen edge
(`legendToggleButton`, `rotate-90`) also protrudes from the map.

**Where.** `features/metricsBar/components/metricsBar/metricsBar.component.html` and the components it
projects; `features/shared/components/barShell/barShell.directive.ts` (shared with the domain bar,
which gets the same shape); `features/legend/components/legendDrawer/legendToggleButton`.

```
today (light):
   ┌ LAYOUT ▦ Squarified TreeMap ▾ ┐                                          ┌ ⌖ 💡 📷 ┐
 ┌─┴───────────────────────────────┴──────────────────────────────────────────┴─────────┴──┐  ┃L┃
 │ AREA ⚙   │ HEIGHT ⚙          (⛓) │ COLOR ⚙          │ EDGES ⚙    │ LABELS ⚙          │  ┃E┃
 │ rloc     │ sonar_complexity      │ sonar_complexity │ avgCommits │ SCENARIOS ＋       │  ┃G┃
 │ Σ 1,420  │ Σ 393                 │ Σ 393            │ Σ 5 / 5    │ 7 scenarios avail. │  ┃E┃
 └──────────────────────────────────────────────────────────────────────────────────────────┘

Studio (dark, one rounded rectangle, nothing protrudes):
╭───────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ LAYOUT       │ AREA      ⚙ │ HEIGHT          ⚙ │⛓│ COLOR           ⚙ │ EDGES      ⚙ │ LABELS      ⚙ │ ⌖  💡 │
│ ▦ Squarified │ rloc         │ sonar_complexity  │  │ sonar_complexity  │ avgCommits   │ SCENARIOS   ＋ │ 📷  ☰ │
│   TreeMap  ▾ │ Σ 1,420      │ Σ 393             │  │ Σ 393             │ Σ 5 / 5      │ 7 scenarios ▸ │       │
╰───────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

- **Shell** (`ccBarShell`, unchanged z-index): `rounded-2xl border border-base-300
  bg-base-100 shadow-lg p-1.5 gap-1 items-stretch`. Sections are separated by `w-px bg-base-300 my-2`
  dividers, not by borders on the cards.
- **Position** (owner answer O7, option A): the bar is centred in the free map area between the open
  explorer and the open inspector, not on the window, so the wider bar is never covered by a panel.
  Collapsed panels give their width back. The legend drawer opens above the bar (O6).
- **Cells** (axis cards, labels/scenarios, layout): `rounded-xl px-3 py-2 hover:bg-base-200
  transition-colors`; open popover → `bg-base-200 ring-1 ring-primary/40`. Inside unchanged: the
  `text-[10px] uppercase tracking-wide text-base-content/60` label with the cog (`btn btn-ghost btn-xs
  btn-square rounded-lg`) on the same line, the metric name `text-sm font-semibold truncate`, the meta
  value (`Σ 1,420`, delta values with their colours) `text-xs text-base-content/70`.
- **Layout** becomes the first cell inside the bar: label "LAYOUT", glyph + layout name (two lines
  allowed, `leading-tight`) + `fa-caret-down`; same `title` "Change the map layout" and same popover
  (`cc-settings-popover-shell`, now anchored above the cell).
- **Link Height and Color**: a `btn btn-sm btn-square rounded-lg` centred vertically in its own
  narrow column between Height and Color, inside the bar's height. Linked: `btn-soft btn-primary`
  with `fa-link`; unlinked: `btn-ghost border border-dashed border-base-300 text-base-content/60` with
  `fa-unlink`. Titles unchanged.
- **View tools** become the last cell: a `grid grid-cols-2 gap-1` of `btn btn-ghost btn-sm btn-square
  rounded-lg` — Center map (`fa-compass`), Flashlight (`fa-lightbulb`), Screenshot (`fa-camera`),
  Legend (`fa-list`, see below); Unfocus (`fa-crosshairs`) is added as a fifth (`grid-cols-3`) while a
  folder is focused. The hover-expanding labels of `cc-bar-tool` become `title` tooltips (an expanding
  label would resize the bar). Right-click on Center map keeps its zoom menu. Radial layout: the tools
  of `cc-radial-map-tools` in the same cell.
- **Legend**: the rotated "LEGEND" tab on the screen edge is removed; the Legend tool in the bar
  toggles the same drawer (`aria-expanded`, `aria-controls="legend-panel"`), pressed state
  `btn-active`. The drawer still slides in from the right.
- **Variants keep their cells**: radial layout (Folders cell, no Height, no link button), delta mode
  (Color shows "Settings" with the delta colour popover), no edges (no Edges cell).
- **States**: disabled cell `opacity-50 cursor-default`; narrow window (the bar is
  `max-w-[min(95vw,1200px)]`): metric names truncate first, then the layout name shows only its glyph,
  then the tools grid becomes `grid-cols-1`; the bar never scrolls or wraps.
- **Keyboard**: unchanged order (layout, area, height, link, color, edges, labels, scenarios, tools);
  every icon-only button has `title` = `aria-label`.
- **Domain bar** (`features/domainBar`) and **dependency bar** use the same shell and get the same
  shape and tools cell; the dependency view's rotated LEGEND tab also becomes a Legend tool (O6).

## T5 File extension bar, blended edges (owner decision OD7)

The coloured bar under the metrics bar that shows each file type's share
(`features/fileExtensionBar`) keeps its segments, colours, labels ("kt 42.25%"), click (absolute
values), hover (highlights the buildings) and context menu. Only the edges between segments change:
instead of a hard edge with a 1 px white gap (`gap-px`), neighbouring colours blend over a short
distance, so the shares still read as exact proportions.

```
today:   [   kt 42.25%   |   scss 28.17%   |   ts 25.35%   |html]
Studio:  [   kt 42.25% ░░▒▒▓▓ scss 28.17% ░░▒▒▓▓ ts 25.35% ░░▒▒▓▓html]   ← 24 px blend centred on each boundary
```

- **Mechanism (per segment, so it stays correct whatever width flex gives each segment):** the
  container drops `gap-px`; each `cc-file-extension-bar-segment` paints
  `background: linear-gradient(in oklab to right, <mixPrev> 0, <own> 12px, <own> calc(100% - 12px), <mixNext> 100%)`
  where `<mixPrev>` = `color-mix(in oklab, <previous colour> 50%, <own colour>)` and `<mixNext>` the same
  with the next colour. Both sides of a boundary end on the same 50 % mix, so the blend is seamless and
  exactly centred on the true share boundary. The first segment has no left blend, the last none on
  the right. The segment component gets `previousColor` / `nextColor` inputs from the visible list
  (`fileExtensionBar.component.html` already iterates it in order).
- **Colour space:** OKLab (`in oklab` on both the gradient and the mix). It only blends the two
  neighbouring colours, so no third colour appears. OKLCH was tried in the mock-up and rejected: it
  goes round the hue circle and paints a pink band between blue and orange, which reads like another
  language. Complementary neighbours therefore pass through a short, slightly muted middle; at 24 px
  that reads as a soft edge, not a separate segment.
- **Width:** 12 px on each side (24 px per boundary; owner: "double the blend length"). Segments
  narrower than 48 px blend over a third of their width per side instead, so a tiny share never turns into pure mix colour.
- **Labels** unchanged (`text-[10px]`, centred); because a label keeps 10 px padding and the blend is half its own colour at the outer edge, the blend
  never lowers its contrast. Hovered segment: unchanged highlight, blend kept.
- **Themes:** segment colours are map data (not themed, plan 02 decision 5); the blend uses only those
  colours, so it looks the same in every theme. Screenshots include the blend.
- **Reduced motion / print:** nothing animates; no change needed.

---

## Deviations from the plan

1. **Theme label "Rider Day"** (owner, open question 9): an official JetBrains name, instead of plan
   02's "IntelliJ Light". Checked in the installed Rider 2026.2 (`rider-theme-pack.jar`): Rider ships
   **"Rider Day"** (new UI, parent `ExperimentalLight`) and **"Rider Light"** (classic UI, parent
   `IntelliJ`), plus "Rider Night" / "Rider Dark"; both light themes use the editor colour scheme
   "Rider Light". Studio follows the new UI, so the label is "Rider Day"; plan 02 takes its chrome tokens
   from `RiderDay.theme.json` and its map/editor-like colours from the "Rider Light" editor scheme.
2. **No quick toggle (owner decision OD10).** Plan 02 M5 task 4 (`cc-theme-quick-toggle`) is dropped;
   the theme is chosen only in Settings.
4. **Metrics bar refresh (T4) and file extension bar blend (T5)** are owner requests (OD6, OD7), not
   part of plan 02; it can ship with plan
   02 M1 (dark by default) or as its own milestone.

## Proposed changes to existing UI (not assumed approved)

Approved by the owner (OD6): the metrics bar shape, the Layout and view-tools tabs moving into the
bar, the link button becoming a square, and the LEGEND edge tab becoming a tool in the bar (T4).


1. **Panel edges: islands, after Rider** (owner, open question 10: "look at how Zed or Rider do it
   and copy that"). Checked on this machine on 2026-11-18:
   - **Rider 2026.2** (build RD-262.10968.170) defaults to the "Islands" themes. Their theme files
     (`intellij.platform.ide.impl.jar`, `themes/islands/ManyIslandsDark|Light.theme.json`) set
     `Island.arc: 20` (10 px corner radius), `Island.borderWidth: 6` (a 6 px gap between panels,
     painted in the window background), `ToolWindow.borderColor: transparent` and
     `StatusBar.borderColor: transparent`: rounded panels separated by gaps, **no border lines**.
   - **Zed**: its themes are compiled into the binary, so the panel styling could not be read from
     files here. From Zed's source conventions its docks are split by a 1 px border line with square
     corners (not visually confirmed on this machine).
   The design copies **Rider's islands**, which also matches the rounded metrics bar (T4):
   - Explorer and inspector float over the map as islands: `m-1.5` (6 px) from the window and nav-bar
     edges, `rounded-[10px]`, `bg-base-100`, `shadow-lg`, **no** border line; the 3D map is the
     backdrop between them.
   - Tiled views (History, the project overview cards) put their panes on a `bg-base-200` backdrop with
     `p-1.5 gap-1.5` (6 px) and `rounded-[10px] bg-base-100` panes, no border lines between panes.
   - The nav bar, the bottom bar and the file extension bar stay flush, edge to edge, as Rider's main
     toolbar and status bar do.
   This replaces the earlier proposal of a `base-300` border line.
2. **Hard-coded colours in T3** are replaced by tokens as plan 02 M1 step 3 already intends; listed so
   the implementer has the full set.
