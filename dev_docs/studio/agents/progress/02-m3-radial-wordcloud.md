---
name: 02-M3 radial map and word cloud
state: complete
version: 1
---

## Goal

Theme the radial map, the word cloud, chart tooltips and chart screenshots, so they read well in the dark
default and in the light theme (plan 02, Milestones, M3).

## Tasks

Copied from `02-themes.md`, Milestones, M3. Design: `design/02-themes.md`, `design/00-design-principles.md`
(design wins over the plan). From `02-m1-dark-by-default.md`: `radialMap.e2e.ts` still asserts light
colours and must pick CodeCharta Light through `themePicker.po.ts` in its `beforeEach`;
`lowestContrastAlongGradient` does not exist yet (add it here if task 2 needs it); the changelog's dark-theme
entry says the radial layouts follow later — rewrite that one entry, do not append.

1. Radial map
2. Word cloud
3. Chart tooltips and chart screenshots

## Steps

- [x] 1. Radial map
- [x] 2. Word cloud
- [x] 3. Tooltips and chart screenshots

## Notes

### 1. Radial map

- `WHITE` is gone: `radialPieceBorderColor()` (palette `radial.pieceBorder`) feeds both builders; the wedge
  outline reuses the piece border colour instead of a second constant. `readableTextColor` reads
  `darkText` / `lightText`; `neutralFolderColor()` and `tintColor` (towards `tintTarget`) live in
  `util/radialFolderValues.ts`.
- The folder swatches (Folders card, popover, legend row) used memoised store selectors, which would not
  redraw on a theme change. `radialFolderSwatchSelector` / `radialTintedFolderSwatchSelector` are replaced by
  `radialFolderSwatchInputsSelector`; the two components compute the swatch themselves, so the signal read in
  `neutralFolderColor()` tracks the theme.
- `radialMap.e2e.ts` picks CodeCharta Light in both `beforeEach`; the disk-backed reload case now runs in the
  dark default and asserts `#4a515c`; new case "should draw neutral folders in the grey of the dark theme".


### 2. Word cloud

- `lowestContrastAlongGradient` added to `util/theme/contrast.ts` (64 samples, channels mixed in sRGB like
  `interpolateColor`, whose midpoint of black and white is `#808080`). Both palettes clear 4.5 against their
  surface (checked by the new `themes.spec.ts` case for every registry entry).
- `getWordCloudColors()` reads the palette; the CSS variables and their comment are removed from
  `tailwind.css`. `interpolateColor` falls back to the active gradient (was the two hard-coded light defaults).
- The emphasis shadow comes from `wordCloud.emphasisShadow`; `WordCloudRenderInputs` carries `themeId`, so
  `isSameRender` no longer swallows a theme change.
- Changelog: the one dark-theme entry now says radial layouts and word cloud follow, Dependencies later.

### 3. Tooltips and chart screenshots

- New `util/theme/chartTooltipStyle.ts` (background, border and text colour from `chartTooltip`) spread into
  the radial and the word cloud tooltip option; M4 spreads it into the dependency graph option too.
- `ChartScreenshotService` lays the cropped image on `exportBackground()` (palette `exportBackground`, via
  `onExportBackground`) for both the radial map and the word cloud.
- **Deviation:** `DependencyGraphScreenshotService` overrides `exportBackground()` to `null`. The graph still
  draws today's light palette (dark ink on transparent), which would be unreadable on the dark export
  background. M4 must delete that override together with themed graph colours. The plan's
  `dependencyGraphHost.renderOffScreen` needs no change (it keeps a transparent background and the base
  service frames the result).

### Verification and look

- Gates: format:check, `npm test` (659 suites, 5040 tests, gate met), lint, tsc, build + `e2e:ci` 157/157
  (temporary `BROWSER_CHANNEL = "chromium"`, reverted), `test:electron` 42/42, `e2e:desktop` 10/10.
- Playwright screenshots (1280x720 view, sample data and `sample_with_many_domain_words`), dark and light:
  - Sunburst, dark: files keep the map colours with dark or white labels; tinted folders fade towards the dark
    surface into a muddy burgundy at 50 % tint, white labels stay readable; pieces are separated by a thin
    surface-coloured line. Neutral folders are a calm slate grey (`#4a515c`). Left as the plan specifies;
    a lighter `tintTarget` would be the lever if the owner finds it too dark.
  - Radial treemap and light theme: unchanged from before (white borders, `#d9dce1` neutral folders).
  - Word cloud, dark: pink to periwinkle words, clearly legible on the dark surface; the hover tooltip is a dark
    raised card with light text. Light: magenta to blue as before.
- Not changed: the "LEGEND" side tab is a light-blue tab in dark (M1 chrome).

### For M4 / M5

- `chartTooltipStyle()` is ready for the dependency graph option.
- Delete the `exportBackground()` override in `DependencyGraphScreenshotService` once the graph is themed.
- Palette builders (M5) must give `radial.neutralFolder`, `tintTarget`, `wordCloud` stops (readable per the new
  `themes.spec.ts` case, which already iterates the whole registry).
