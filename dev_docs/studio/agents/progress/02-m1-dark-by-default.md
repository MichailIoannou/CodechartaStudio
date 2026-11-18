---
name: 02-M1 dark by default
state: progress
version: 1
---

## Goal

Make CodeCharta start in a complete dark theme: dark chrome and a dark 3D map, a persisted theme
preference migrated into saved sessions, and a theme picker in the settings (plan 02, Milestones, M1).

## Tasks

Copied from `02-themes.md`, Milestones, M1 (tests to write first are listed there). The interface is
specified by `design/02-themes.md` and `design/00-design-principles.md`; where they disagree with the
plan about the interface, the design files win (see their "Deviations from the plan"). Owner decisions in
`design/owner-decisions.md` apply (OD10: no quick toggle).

From `02-m0-spike.md`: daisyUI 5.7.42; `themes: false` works as the plan spells it; delete `@theme`
lines 19-38; `themeBoot.js` passes the CSP; `color-mix()` survives screenshots, but task 7 must also set
label `color` and `border` from the `buildingLabel` palette.

1. Types, registry, render palettes
2. Register both themes in CSS
3. DOM stragglers
4. Scene background
5. Floors and floor labels
6. Building labels, connectors, view cube
7. Map screenshot
8. Preference slice and migration (v37)
9. Applying, and the flip to dark
10. Picker
11. Visual check and changelog

## Steps

- [x] 1. Types, registry, render palettes
- [x] 2. Themes registered in CSS
- [x] 3. DOM stragglers
- [x] 4. Scene background
- [x] 5. Floors and floor labels
- [x] 6. Labels, connectors, view cube
- [x] 7. Map screenshot
- [ ] 8. Preference and migration
- [ ] 9. Apply and flip to dark
- [ ] 10. Picker
- [ ] 11. Visual check and changelog

## Notes

Environment: Linux, node 26.13, npm 12. Branch `feature/studio-02-m1` from `feature/studio-integration` (8a0a66571).

### 1. Types, registry, render palettes

- Files as planned. Differences: `ThemePreference` and `MapPaletteSeed` are not in this commit (knip:
  no consumer yet; `ThemePreference` arrives with the preference slice in task 8, the seed with the
  builders in M5). The sub-palette interfaces (`MapRenderPalette` …) are not exported, only
  `RenderPalette`, `ChromeTokens`, `ThemeDefinition`, `ColorScheme`, `ThemeId`, `SYSTEM_THEME`.
- `lowestContrastAlongGradient` is not added yet (first consumer: the word-cloud spec in M3).
- Added `defaultThemeDefinition()` to `themes.ts` so `resolveTheme` and the signal's start value share
  one fallback.
- `map.floorLabel.outline` is `rgba(0, 0, 0, 0.5)` as the plan's table says, which is not six-digit
  hex; "should keep every render palette color a six digit hex" therefore exempts exactly that path
  (it is a canvas stroke style, never parsed as hex).
- `darkRenderPalette.dependencyGraph` holds the light constants as the plan's M4 placeholder.

### 2. Themes registered in CSS

- `themes: false` plus one `@plugin "daisyui/theme"` block each for `cc-dark` (`default: false` for now)
  and `cc-light` (`default: true` for now), all 20 color tokens and the eight non-color tokens from M0.
  The daisyUI token lines of `@theme` and their comment are deleted (M0 showed utilities still compile).
  The `--color-cc-50…950` brand scale stays.
- `index.html`: `data-theme="cc-light"`. Build OK, `app.e2e.ts` green (chromium channel, temporary).
- The CSS-sync spec lives in `themes.spec.ts` as planned; a second case checks that the stylesheet
  registers exactly the registry's themes in registry order.

### 3. DOM stragglers

- All plan items replaced as listed (veils `bg-base-100/80`, zoom slider `base-content/60`, action icon
  `text-primary-content`, settings button `group-hover:bg-secondary`, explorer icon inherits / fades
  with `color-mix`, changelog chore `base-content`, explorer row bar `bg-base-content/10`).
- Added `hover:text-secondary-content` (action icon) and `group-hover:text-secondary-content` (settings
  button): with `cc-light` the hover fill `secondary` (#1b9cfc) gets only 2.9:1 with white, its content
  token is dark.
- **Panel edges follow the design, not the plan**: `design/02-themes.md` T3 and proposed change 1
  (owner, open question 10) replace the plan's `border-base-300` edge with Rider's islands. Explorer,
  metrics inspector and dependency inspector float 6 px from the edges (`m-1.5` / `inset-y-1.5 right-1.5`),
  `rounded-[10px]`, `shadow-lg`, no border line; the old black shadow is gone. Heights subtract the two
  margins (`- 0.75rem`). The inspectors keep the `translate-x-full` class (specs and page objects find it)
  and slide out by `calc(100% + 0.75rem)` through `[&.translate-x-full]:` so the margin does not leave a
  6 px strip on screen. Two specs now test the class token with `classList.contains` instead of a
  substring of `className` (the variant contains the text `translate-x-full`).
- New `explorerTreeItemIcon.component.spec.ts` (the component had none).
- Full e2e (`e2e:ci`, 149 tests) green after this task.

### 4. Scene background

- As designed: `BACKGROUND_COLOR` deleted, the subscription stores only the flag, `syncClearColor()` runs
  at the end of `initGL` and at the top of every animation frame and calls `setClearColor` only when
  the wanted color differs. `clearColor` is now the hex string (or `null` before the first sync); nothing
  outside the service read it.

### 5. Floors and floor labels

- As designed (`floorGradientFor`, palette `floorLabel`, `floorLabels` invalidation flag, `redrawFloorLabels`,
  `activeThemeChanged` in `actionsRequiringRerender`). `CodeMapRenderService.render` delegates the
  non-geometry branch to a new private `refreshBuildings` (recolor, then floor labels).
- **Order change:** `activeThemeChanged` is needed here already, so `stores/preferences/store/theme/theme.actions.ts`
  is created in this task with that one action (exported from `preferences.write.facade.ts`); task 8
  adds `setThemePreference` to the same file.
- `FolderLabelMaterials` was not touched (still looks inert; nothing in M1 depends on it).
- Extra tests beyond the plan: `geometryGenerator.spec.ts` (floors from the theme's gradient, recolor
  takes the theme active at the time), `threeSceneService.spec.ts` (`redrawFloorLabels`).

### 6. Labels, connectors, view cube

- Labels: background `color-mix(base-100 85%)`, text `base-content`, border `base-300`, metric and badge
  text `color-mix(base-content 60%)` (one named constant). The metric span was `#666`, not mentioned in
  the plan; it gets the same faded token as the badge. New `labelElement.spec.ts` (none existed).
- Connectors: `new Color(activeRenderPalette().map.connector)` in `initConnectors`.
- View cube: the three material getters share one themed factory; the component keeps the `BoxHelper`,
  and an `effect` in the constructor recolors meshes and outline and renders when `activeTheme` changes
  (no-op before `ngOnInit` built the cube). Hover emissive from the palette; the unhover reset stays black
  (no emission). The spec now constructs the component inside `TestBed.runInInjectionContext`.

### 7. Map screenshot

- `prepareLabelsForScreenshot` sets background, **text color** (M0 finding) and border from
  `map.buildingLabel`; `onExportBackground` (16 px padding on the theme surface, `null` keeps the
  transparent PNG) runs after `cropTransparentMargins` in `ScreenshotService` only. The chart screenshot
  services are M3 as planned.
- Spec note: JSDOM drops `backdrop-filter`, so the label spec defines `style.backdropFilter` on the
  element to make it look like a live label.

