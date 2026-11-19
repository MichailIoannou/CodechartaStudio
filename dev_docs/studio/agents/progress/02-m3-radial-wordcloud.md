---
name: 02-M3 radial map and word cloud
state: progress
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
- [ ] 2. Word cloud
- [ ] 3. Tooltips and chart screenshots

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

