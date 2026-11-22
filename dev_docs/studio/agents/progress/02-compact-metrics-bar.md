---
name: 02 follow-up — compact metrics bar and cell icons
state: complete
version: 1
---

## Goal

`design/02-themes.md` T4 "Cell icon instead of the cog" and "T4 compact bar" (owner answer to question 12, question 15
default): cell icons on the metrics bar's settings buttons, a two-row icon bar when the map between the side panels is
too narrow, and the side panels no longer give way (`02-panels-give-way.md`, task 1, undone).

## Steps

- [x] 1. Remove the side panels giving way
- [x] 2. `cc-metric-glyph`, cell icons on the settings buttons, Scenarios bookmark menu, scenarios dialog icons
- [x] 3. Compact bar (free-width measurement with hysteresis, compact cells, tooltips, chooser shortcut)
- [x] 4. e2e, changelog, gates

## Notes

Branch `feature/studio-compact-metrics-bar` from `feature/studio-next`. Plan: `plans/studio-compact-metrics-bar.md`.

### 1. Give-way removed
- Reverted the four give-way commits: `SidePanelRoom`/`registerSidePanel`, the collapsed inspector strip with its
  "selection changed" dot (`CollapsedInspectorStripComponent`), `InspectorVisibilityService.collapse/expand`,
  `DependencyInspectorCollapseStore`, `ExplorerCollapseService.collapse()`, the `sidePanelsGiveWay` e2e and its
  `sample_with_declarations.cc.json` fixture. The legend drawer again moves aside for any open inspector.
- The explorer keeps its own collapse button; the bars stay centred between the panels (O7). *Superseded (2026-11-22): centred on the window, room around its centre — see `02-bar-window-centre.md`.*

### 2. Cell icons
- `cc-metric-glyph` (`kind: "area" | "height"`) lives in `features/shared/components/metricGlyph`, not in
  `features/metricsBar` as the design says: the scenarios dialog needs it too, and scenarios → metricsBar would close
  a cycle (metricsBar already uses the scenarios facade), which dependency-cruiser forbids.
- `cc-axis-card(-header)` take an optional `cogIcon` template and `cogTitle`; without an icon the cog and "Settings"
  stay, so the domain and dependency bars are unchanged.
- `cc-cell-icon` (metricsBar) holds the icon table; `CELL_SETTINGS_TITLES` the "Area settings", … names.
- Scenarios: the bookmark opens `cc-scenarios-menu` ("Open saved scenarios (N)", "Save current state as scenario");
  the count still opens the list. The compact Scenarios button opens the same menu.
- Scenarios dialog: `SCENARIO_GROUP_ICONS` is now `{ glyph } | { fontAwesome }`, drawn by `cc-scenario-group-icon`.

### 3. Compact bar
- `CompactBarDirective` (`ccCompactBar`, shared, host directive of `cc-metrics-bar` only): a hidden fixed probe with the
  bar shell's left/right insets and the 6 px margins spans exactly `FREE_WIDTH`; a `ResizeObserver` on it follows panel
  open/close/resize and window resizes without a transition delay. Compact below 30rem, full again from 32rem; a probe
  of width 0 (view kept alive in the background) changes nothing. The bar carries `data-compact="true"`.
- Cells read it through `injectIsCompactBar()` and render a `cc-compact-bar-button` instead of their card; the popovers
  stay where they are (one instance each), the button carries both anchor names (`anchor-name: --search, --settings`),
  and the fallback positioning of `cc-settings-popover-shell` now matches one name of a list (`~=`).
- Groups: layout (tall) | metric cells (`grid-rows-2 grid-flow-col`, explicit `col-start`/`row-start`, link
  `row-span-2` in column 3) | labels/scenarios | tools (`[&_.btn]:size-7`). DOM and tab order are unchanged.
- Tooltips: daisyUI `tooltip tooltip-top` with `data-tip` = `aria-label`, removed while the button's popover is open;
  meta text from `injectMetricMetaText` (attribute type for folders, value, delta with its sign).
- Choosers in the compact bar end with `cc-settings-shortcut` ("Area settings", …): it hides the chooser and opens the
  settings popover with `showPopover({ source: button })`, so Esc returns focus to the button.

**Deviation 1 (needs the designer):** while Color is linked to Height the full bar's Color card has its metric chooser
disabled but its settings button enabled. A disabled compact Color button would leave the colour settings unreachable
in the compact bar, so the button opens the Color settings popover directly instead.

**Deviation 2:** the view tools (shared `cc-bar-tool`, projected from the view) keep their native `title` tooltips in the
compact bar; a daisyUI tooltip would change them in the domain and dependency bars too, which the design keeps as
they are. The link button gets the daisyUI tooltip.

Known: the full bar is about 96 px tall in the app (the mock-up's cards are shorter), the compact bar 72 px as specified
(`size-7` rows), so switching changes the bar height by about 24 px.

### 4. Verification
- e2e `app/codeCharta/e2e/compactMetricsBar.e2e.ts` (900 px with explorer and inspector open → compact; 1150 px stays
  compact; 1250 px full; Area → chooser → "Area settings" → Esc returns focus; Scenarios menu).
- Gate results: see the milestone report.
