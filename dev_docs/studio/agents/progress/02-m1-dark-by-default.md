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
- [ ] 3. DOM stragglers
- [ ] 4. Scene background
- [ ] 5. Floors and floor labels
- [ ] 6. Labels, connectors, view cube
- [ ] 7. Map screenshot
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

