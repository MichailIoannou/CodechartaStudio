---
name: 02-M4 dependency graph and color-range diagram
state: progress
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
- [ ] 2. Dependency graph
- [ ] 3. Colour-range diagram

## Notes

