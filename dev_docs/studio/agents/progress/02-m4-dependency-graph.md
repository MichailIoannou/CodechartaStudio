---
name: 02-M4 dependency graph and color-range diagram
state: complete
version: 1
---

## Goal

Theme the dependency graph and the metric colour-range diagram, the last views still drawn in light colours
on the dark theme (plan 02, Milestones, M4).

## Tasks

Copied from `02-themes.md`, Milestones, M4. Design: `design/02-themes.md`, `design/00-design-principles.md`
(design wins over the plan). From `02-m3-radial-wordcloud.md`: spread `chartTooltipStyle()`
(`util/theme/chartTooltipStyle.ts`) into the dependency graph option; delete the
`DependencyGraphScreenshotService.exportBackground()` override (returns `null`) once the graph is themed;
rewrite the changelog's dark-theme entry (Dependencies now themed), do not append.

1. Tidy first: dependency graph constants → functions (structural commit)
2. Theme the dependency graph
3. Theme the colour-range diagram

## Steps

- [x] 1. Tidy first
- [x] 2. Dependency graph
- [x] 3. Colour-range diagram

## Notes


### 1. Tidy first

- Every colour constant of `dependencyGraphStyle.ts`, `declarationKinds.ts`, `boxMarks.ts` became a function
  (`textColor()`, `folderStroke()`, `kindIconColors()`, `cycleMarkColors()`, `declarationKindLegend()`, ...);
  callers, specs and `dependencyGraph.facade.ts` follow. Tests unchanged and green.

### 2. Dependency graph

- Functions read `activeRenderPalette().dependencyGraph`; `darkRenderPalette.dependencyGraph` holds the
  `cc-dark` values (the light-constants placeholder and its import are gone). `badgeContrastColor()` is new in
  `dependencyGraphStyle.ts` (the palette key `badgeContrast` existed, the constant was private to `boxMarks`).
- `declarationKinds.ts` keeps only label and letter; the tint comes from `kindTints`.
- `dependencyGraphOption.builder.ts` spreads `chartTooltipStyle()`.
- `DependencyGraphComponent` reads `activeTheme()` in its render effect so a theme change redraws the canvas
  (the colours are read lazily inside ECharts' `renderItem`, outside the effect's own tracking); the pointed-at
  outline colour is a `computed`. `declarationKindIcon` and `boxBadgeSample` wrap their lookups in `computed`.
- Deleted the `exportBackground()` override in `DependencyGraphScreenshotService`; as it was the only override,
  `ChartScreenshotService.exportBackground()` is inlined. The dark export lays the graph on `#1e2329`.
- Plan correction: there was no `dependencyGraphStyle.spec.ts`; it is new, as is
  `declarationKindIcon.component.spec.ts`. Tests: "should take box fills from the active theme", themes.spec
  "should keep dependency graph text readable on every fill" (box fills against `text`, kind tints against
  `kindIconLetter`), option builder "should style the tooltip ...", screenshot spec now expects the padded export.

### 3. Colour-range diagram

- Frame, axes, labels and the distribution line draw in `currentColor` with `text-base-content/60` on the
  `<svg>`; the crosshair and its tooltip use `var(--color-base-content)` as inline style.

### Verification and look

- Gates: format:check, `npm test` (661 suites, 5051 tests, gate met), lint, tsc, build + `e2e:ci` 157/157
  (temporary `BROWSER_CHANNEL = "chromium"`, reverted), `test:electron` 42/42, `e2e:desktop` 10/10.
- Playwright screenshots (1280x720, startup samples plus a scratch fixture with declarations of every kind and
  two declaration-level cycles, all edge types shown), dark and light:
  - Graph, dark: layered slate and violet-tinted fills with a clearly visible stroke; closed folders keep the
    blue tint; edges are readable grey lines with arrowheads; cycle badges are red. The hover tooltip is the
    dark raised card.
  - Declaration icons: eight kinds, each a muted dark tint with a light letter, distinguishable and readable;
    the legend shows the same discs.
  - Light: identical to before.
  - Screenshot export, dark: graph on `#1e2329` with 16 px padding, text and edges readable.
  - Colour-range diagram, dark: grey axes, ticks and labels readable on the popover, translucent green and red
    areas on the dark surface; light unchanged.
- Faint, not changed: the "level N" captions of the level bands are low-contrast grey in both themes (part of
  the graph's own look, not a palette colour).

### For M5

- Palette builders must give `dependencyGraph` (the shared dark object for dark editor themes, the light
  constants for light ones); `themes.spec.ts` already checks text on every fill and kind letters on every tint
  for the whole registry.
- A new graph colour goes into the palette and a function in `dependencyGraphStyle.ts`, never a constant.
