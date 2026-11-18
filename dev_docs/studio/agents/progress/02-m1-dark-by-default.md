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

- [ ] 1. Types, registry, render palettes
- [ ] 2. Themes registered in CSS
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

