# 02 — Themes: interface design

Plan: `02-themes.md` ("UI", "Error states and edge cases", M1, M5). Principles:
`00-design-principles.md`. **Web and desktop**: themes are the one new feature in both builds (the picker in Settings only).

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| T1 | Theme picker | `cc-theme-picker` | Global Configuration dialog, first row | `cc-setting-toggle` row |
| T2 | (removed by OD10: no theme control in the nav bar) | — | — | — |
| T3 | Dark chrome audit | checklist | every existing screen | — |
| T4 | Metrics bar, refreshed; cell icons on the settings buttons; compact icon form when the map is narrow | `cc-metrics-bar`, `ccBarShell`, new `cc-metric-glyph` | floating bar above the file extension bar | today's metrics bar |
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
- **Too little room: compact bar** (owner answer to question 12, replacing the side panels that gave
  way). Both side panels stay open; when the full bar does not fit, it becomes a **compact bar** of icon
  buttons in two rows, about as tall as the full bar, so the map does not jump. Section "T4 compact bar"
  below has the detail. The automatic collapsing of side panels is removed, with the collapsed
  inspector strip and its "selection changed" dot (O9.1); the explorer's own collapse button stays.
- **Cells** (axis cards, labels/scenarios, layout): `rounded-xl px-3 py-2 hover:bg-base-200
  transition-colors`; open popover → `bg-base-200 ring-1 ring-primary/40`. Inside unchanged: the
  `text-[10px] uppercase tracking-wide text-base-content/60` label with the settings button (`btn
  btn-ghost btn-xs btn-square rounded-lg`) on the same line, the metric name `text-sm font-semibold
  truncate`, the meta value (`Σ 1,420`, delta values with their colours) `text-xs
  text-base-content/70`.
- **Cell icon instead of the cog** (owner, 2026-11-22): the settings button shows the cell's own
  icon (section "T4 compact bar", Icons) instead of `fa-cog`, at 14 px (`size-3.5` for the SVG
  glyphs, `text-[13px]` for Font Awesome) in `text-base-content/70`, hover `text-base-content`. It
  opens the same settings popover. Its `title` and `aria-label` name the cell: "Area settings",
  "Height settings", "Color settings", "Edge settings", "Folder settings", "Label settings"; the delta
  Color card uses the palette too. `cc-axis-card-header` gets an optional icon input; a card without
  one keeps the cog, so the domain and dependency bars stay as they are. Scenarios gets its bookmark
  in place of its ＋ (title "Scenarios"): it opens the same menu as in the compact bar ("Open saved
  scenarios (7)", "Save current state as scenario"), so saving stays one click away and the icon
  matches the compact bar. Clicking the count still opens the saved scenarios. Layout keeps its glyph
  and caret.
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
  then the tools grid becomes `grid-cols-1`; the bar never scrolls or wraps. Below 30rem of free map
  the compact bar takes over (T4 compact bar).
- **Keyboard**: unchanged order (layout, area, height, link, color, edges, labels, scenarios, tools);
  every icon-only button has `title` = `aria-label`.
- **Domain bar** (`features/domainBar`) and **dependency bar** use the same shell and get the same
  shape and tools cell; the dependency view's rotated LEGEND tab also becomes a Legend tool (O6).

## T4 compact bar (owner answer to question 12)

When the map between the open side panels is too narrow for the full bar, the bar shows one icon
button per cell instead of its cards. The buttons open the same popovers as the cards. Mock-up:
`mockups/compact-metrics-bar.html`.

```
full bar, 1400 px window (unchanged):
╭─────────────────────────────────────────────────────────────────────────────────────────────╮
│ LAYOUT     │ AREA    ⚙ │ HEIGHT        ⚙ │⛓│ COLOR         ⚙ │ EDGES    ⚙ │ LABELS    ⚙ │ ⌖ 💡 │
│ ▦ Squarif… │ rloc       │ sonar_complexity│  │ sonar_complexity│ avgCommits │ SCENARIOS ＋ │ 📷 ☰ │
╰─────────────────────────────────────────────────────────────────────────────────────────────╯

compact bar, 900 px window, both panels open (236 px free, bar 231 px):
╭──────────────────────────────╮
│ ▦ │ ⬖  ⬆▢ ┐│ 🏷 │ ⌖  💡 │
│ ▾ │ ⊛  🎨 ┘│ 🔖 │ 📷 ☰ │
╰──────────────────────────────╯
  Layout | Area Height ⛓ / Edges Color | Labels / Scenarios | view tools
```

- **When:** the compact bar takes over when the free map width (the width the bar shell already
  computes from the panel insets, `FREE_WIDTH`) is below **30rem**, the narrowest the full bar can
  get (it already shrinks names, the layout name and the tools grid down to that width). It returns
  to the full bar at **32rem** or more, so dragging a panel edge near the limit doesn't make it
  flicker. No animation; the bar stays centred between the panels (O7). Measured on every panel
  open/close/resize and window resize, like the insets today.
- **Shell:** the same `ccBarShell` (`rounded-2xl`, `p-1.5`, same z-index), with cell groups
  separated by the same `cc-bar-divider`. Inside, each group is a `grid grid-rows-2 grid-flow-col
  gap-0.5`; the buttons are placed with explicit `col-start`/`row-start`, so DOM and tab order stay
  as today: layout, area, height, link, color, edges, labels, scenarios, tools.
- **Buttons:** `btn btn-ghost btn-square size-7 min-h-0 rounded-lg` (28 px), icon 16 px
  (`size-4` for the SVG glyphs, `text-[15px]` for Font Awesome), `text-base-content/80`, hover
  `bg-base-200`. Open popover → `btn-active ring-1 ring-primary/40` (like an open card). Disabled
  cell → `btn-disabled opacity-50`. Dimmed card (hidden edges, neutral folders) → icon
  `text-base-content/40`.
- **Groups and slots** (row 1 / row 2):

  | Group | Slots | Notes |
  |---|---|---|
  | Layout | one button `row-span-2`, `h-full w-7`: layout glyph with `fa-caret-down text-[8px]` under it | |
  | Metrics | col 1: Area / Edges · col 2: Height / Color · col 3: link `row-span-2` | link sits beside Height and Color, which it joins |
  | Labels, Scenarios | Labels / Scenarios | same stacking as the full bar's cell |
  | View tools | today's `grid-cols-2` of tools, buttons `size-7` | Unfocus adds a third column, as in the full bar |

  - **Link** (`row-span-2`): `btn btn-square w-4 h-full min-h-0 p-0 rounded-md`, `fa-link` or
    `fa-unlink` `text-[10px]`; linked `btn-soft btn-primary`, unlinked `btn-ghost
    text-base-content/50`. Titles unchanged ("Link Height and Color Metric" / "Unlink Height and
    Color Metric").
  - **Radial layout:** Area / –, Folders / Color; no link, no edges.
  - **No edge metric:** the Edges slot stays empty, so the other icons don't move between files.
  - **Delta mode:** the Color button opens the delta colour popover directly.
- **Width:** 28 (layout) + 76 (metrics) + 28 (labels/scenarios) + 58 (tools) + 3 dividers × 9 +
  padding and border 14 = **231 px**, which fits the 236 px left at 900 px with both panels at their
  default 320 px. If the map is narrower still (panels widened, or Unfocus showing), the compact bar
  keeps its own width as the smallest the bar gets and reaches under a panel's edge, as the full bar
  does at its 30rem floor today.

### Icons

One icon per cell, the same in both themes (`currentColor`). New glyphs are drawn like
`cc-layout-glyph`: `viewBox="0 0 20 20"`, `fill="none" stroke="currentColor" stroke-width="1.4"
stroke-linejoin="round" stroke-linecap="round"`. They go into a new `cc-metric-glyph` component
(`features/metricsBar/components/metricGlyph`, input `kind: "area" | "height"`), next to
`cc-layout-glyph`. The same icons appear in the full bar, on each card's settings button (T4, "Cell
icon instead of the cog").

| Cell | Icon | Source |
|---|---|---|
| Layout | the current layout's glyph | `cc-layout-glyph` (existing) |
| Area | footprint tile | new glyph `area` |
| Height | building with an up arrow | new glyph `height` |
| Color | palette | `fa-solid fa-palette` |
| Edges | circle nodes | `fa-solid fa-circle-nodes` |
| Labels | tags | `fa-solid fa-tags` (owner, 2026-11-22) |
| Scenarios | bookmark, outline | `fa-regular fa-bookmark` |
| Folders (radial) | folder | `fa-regular fa-folder` (existing) |
| Link, view tools | unchanged | existing |

```html
<!-- area -->
<path d="M10 4.5l8.5 4.5-8.5 4.5-8.5-4.5z" fill="currentColor" fill-opacity=".4"/>
<path d="M1.5 9v3l8.5 4.5 8.5-4.5V9M10 13.5v3"/>
<!-- height -->
<path d="M7.5 5.5l5-2.6 5 2.6-5 2.6z"/>
<path d="M7.5 5.5v9.4l5 2.6 5-2.6V5.5M12.5 8.1v9.4"/>
<path d="M3.5 17.5V3M1.3 5.2L3.5 3l2.2 2.2"/>
```

**One concept, one icon:** the Scenarios dialog's group icons (`SCENARIO_GROUP_ICONS`) switch to the
same icons: area and height the new glyphs, color `fa-palette`, edge `fa-circle-nodes`; labels already
use `fa-tags`. Camera and filters keep theirs.

### Hover texts

Every button gets a daisyUI tooltip above it (`tooltip tooltip-top`, `data-tip`), shown on hover
and on keyboard focus. Its text is also the button's `aria-label`. The tooltip hides while that
button's popover is open. The text is the cell's label, then what the card would show, joined by
" · ". The meta part is left out when the card shows none.

| Button | Tooltip (example) |
|---|---|
| Layout | "Layout · Squarified TreeMap" |
| Area | "Area · rloc · Σ 1,420" |
| Height | "Height · sonar_complexity · Σ 393" |
| Color | "Color · sonar_complexity · Σ 393"; delta mode "Color · delta colours" |
| Edges | "Edges · avgCommits"; hidden edges "Edges · avgCommits · hidden" |
| Folders | "Folders · <value label> · <style label>" |
| Labels | "Labels · label settings" |
| Scenarios | "Scenarios · 7 available" (the count text the card shows) |
| Link, tools | their titles today, as tooltips |

Delta values in the tooltip keep their sign (`+12`, `−3`) but not their colour.

### Clicks

- **Layout:** the layout popover, anchored above the button.
- **Area, Height, Color, Edges, Folders:** the metric chooser the card's metric name opens (for
  Folders the value popover). In the compact bar the chooser ends with a row `border-t
  border-base-300` holding `btn btn-ghost btn-sm justify-start w-full`: `fa-cog` "Area settings"
  (Height settings, Color settings, …), which closes the chooser and opens the cell's settings
  popover anchored to the same button. The full bar's choosers don't get this row.
- **Labels:** the label settings popover.
- **Scenarios:** a small menu above the button (`menu menu-sm`, in `cc-settings-popover-shell`
  `w-60`): `fa-regular fa-bookmark` "Open saved scenarios (7)" and `fa-plus` "Save current state as
  scenario". The full bar's bookmark button opens the same menu.
- **Link, view tools:** unchanged; right-click on Center map keeps its zoom menu.
- **Keyboard:** each button is a normal button (Enter/Space); popovers close with Esc and return
  focus to the button.

### Other bars

The domain bar and the dependency bar keep their behaviour; they have no compact form. Owner
question 15 in `open-questions.md` (default applied).

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
