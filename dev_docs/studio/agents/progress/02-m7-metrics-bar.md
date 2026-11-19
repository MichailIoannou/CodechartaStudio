---
name: 02-M7 metrics bar, file extension bar, toasts
state: complete
version: 1
---

## Goal

Ship the owner-approved visual refreshes that no plan milestone covers yet: the modernised metrics bar
(OD6, design T4), blended edges in the file extension bar (OD7, design T5), and toasts at the top right
below the nav bar (OD8).

## Tasks

New milestone created by orchestration for owner decisions OD6, OD7, OD8 (`design/owner-decisions.md`;
their "Plan impact" paragraphs name the files). Design: `design/02-themes.md` T4 and T5,
`design/00-design-principles.md` §3 "Toasts", mock-up `design/mockups/studio-screens.html`. Branched from
`feature/studio-stack`.

Parallel work note: other agents work on 03-M6 (projects) and 04-M3 (History view) at the same time. Keep
changes to shared files (nav bar, `CHANGELOG.md`) small; the toast change is one container class.

1. Metrics bar refresh (OD6, T4): one rounded bar, Layout and view-tools tabs inside it, link button as a
   square, the LEGEND edge tab becomes a Legend tool; specs and e2e page objects updated
2. File extension bar blended edges (OD7, T5): 24 px blend per boundary, no white gap, exact percentages
3. Toasts top right below the nav bar (OD8)
4. Changelog (one entry each, or fold into existing ones per root `CLAUDE.md`)

## Steps

- [x] 1. Metrics bar
- [x] 2. File extension bar
- [x] 3. Toasts
- [x] 4. Changelog

## Notes

Branch `feature/studio-02-m7` from `feature/studio-stack`. `npm ci` was needed in the root and `visualization/`.

### Verified paths and deviations
- All named paths exist (`metricsBar`, `shared/components/barShell`, `barToolsTab`, `barTool`, `legend/components/legendDrawer`,
  `domainBar`, `fileExtensionBar`, `shared/components/toast`). Not named but affected: the **dependency bar**
  (`dependencyMap/components/dependencyBar`) uses the same shell and tools tab, and the **Dependencies view** uses the same
  legend drawer (with the rotated tab).
- Structural commit first: `barToolsTab` -> `barToolsCell` (`cc-bar-tools-cell`), `layoutTab` -> `layoutCell`
  (`cc-layout-cell`, test id `metrics-bar-layout-cell`, page object `layoutCell()`), `barToolsDivider` -> `barDivider`
  (now the `w-px bg-base-300 my-2` section divider of every bar).

### 1. Metrics bar (T4)
- Shell `rounded-2xl p-1.5 gap-1`; cells (axis cards, layout, labels/scenarios) `rounded-xl px-3 py-2 hover:bg-base-200`
  (`shared/components/barShell/barCell.ts`). Open popover -> `bg-base-200 ring-1 ring-primary/40`: popovers are native, so
  `shared/util/injectIsAnyPopoverOpen` listens to `toggle` events (capture phase, they do not bubble) for the cell's popover ids.
- Dividers after Layout, before Labels and before the tools, as in the mock-up. Link button: `btn-square rounded-lg`,
  `btn-soft btn-primary` / dashed ghost; the two `app.scss` rules for the old round button and the dead `divide-x` rule are gone.
- Tools cell: `grid grid-cols-2`, `grid-cols-3` while Unfocus is revealed (`has-[cc-unfocus-tool[data-revealed]]`). The
  tool sets (`cc-map-tools`, `cc-radial-map-tools`, `cc-domain-toolbox`, `cc-graph-view-tools`) are `contents` so each tool is a
  grid item; their in-tab dividers are removed. `cc-bar-tool` is an icon-only `btn btn-ghost btn-sm btn-square rounded-lg`,
  `title` = tooltip or label, `aria-label` = label; pressed/expanded -> `btn-soft btn-primary btn-active`; not revealed ->
  `hidden` + `inert`. New `expanded` / `controls` inputs.
- Legend: `LegendDrawerStore` (signal service, provided per view) shared by the new `cc-legend-tool` (`fa fa-list`,
  `aria-expanded`, `aria-controls="legend-panel"`, test id `legend-panel-button` kept) and the drawer. The rotated tab
  component is deleted; the drawer ignores pointer-downs on its controls so the tool can close it.
- **Deviation 1 (needs owner check):** the Dependencies view also loses the rotated tab; its Legend tool sits in the
  dependency bar's tools cell, the same way as in the metrics bar. The design names only the metrics and domain bars; the
  alternative (keep the rotated tab only there) would need the removed component back.
- **Deviation 2:** the open legend panel used to cover the bar's right end (and so the Legend tool). It now opens above the
  floating bar (`var(--cc-metrics-bar-height, 0px)` added to its bottom; 0 in Dependencies, 12 px higher than before there).
- **Deviation 3:** narrow window: metric names truncate (the cells' minimum widths apply from `xl` up), the layout name
  shows only its glyph below `lg`. The third step, tools `grid-cols-1`, is **not** applied: four stacked 32 px tools would
  make the bar taller than its cells, contradicting "never wraps"; left for the designer.
- **Deviation 4:** design asks for "`title` = `aria-label`"; tools with an explanatory tooltip (Flashlight, Center map's
  right-click hint, Unfocus) keep it as `title`, the label stays the accessible name.
- **Open question (owner/designer):** the bar keeps its centred position (T4: "unchanged position, width and z-index") but
  is now wider, so at 1920 px the open explorer covers the Layout cell as it already covered Area (the existing e2e comment
  calls that intended). The pointer cannot reach the layout picker until the explorer is collapsed; the keyboard can. The
  page object now opens the picker by focus + Enter; 18 e2e tests had failed on the covered click.
- Screenshot service: the ignore-by-id for the old tab is gone (the tool lives in `cc-metrics-bar`, which is ignored).

### 2. File extension bar (T5)
- `gap-px` removed; segments get `previousColor` / `nextColor` from the visible list and paint
  `linear-gradient(in oklab to right, mix 0, own W, own calc(100% - W), mix 100%)` with `W = min(12px, 100% / 3)` and the
  mix `color-mix(in oklab, left 50%, right)`. **Deviation:** the design's "segments narrower than 48 px blend over a third"
  conflicts with 12 px at exactly 48 px (a third is 16 px); `min()` keeps "never more than a third" and is continuous
  (the switch happens at 36 px).

### 3. Toasts (OD8)
- `top-[var(--cc-bars-height,49px)]` on the `cc-toast` output; first toast sits 1 rem below the nav bar, 1 rem from the right.

### Look (Playwright, built app on a private port, sample files)
- Dark (`cc-dark`) and light (`cc-light`, `rider-day`) at 1440, 1150 and 900 px: one rounded panel, nothing protruding,
  matches the mock-up's cell order, dividers, square link button and 2 x 2 tools; Legend tool pressed (soft primary) while the
  drawer is open above the bar; the Height cell shows the ring while its popover is open. At 900 px the layout shows only
  its glyph and `sonar_comple…`, `avgComm…`, `7 scenarios availa…` truncate; nothing overlaps. Domain bar: same shell, the
  two tools in one row. Dependency bar: same shell, three tools (whole graph, screenshot, legend). File extension bar:
  4x zoom shows a soft 24 px blend, no gap, labels unchanged. Toast under Settings, not over it.


### Verification
- Before the last commit: format:check clean; `npm test` 682 suites, 5317 passed (coverage 96.9 / 90.2 / 95.6 / 96.9);
  lint and tsc clean.
- With temporary, reverted `BROWSER_CHANNEL = "chromium"` and `E2E_PORT = 9033`: `npm run build && npm run e2e:ci`
  170/170 (the first run had the 18 covered-click failures above, fixed in the page object); `test:electron` 69/69;
  `e2e:desktop` 14/14 with the core built in `core/target/studio-02-m7`.
