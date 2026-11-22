---
name: Compact metrics bar and cell icons
state: progress
version: 1
---

## Goal

Implement design 02-themes T4 "Cell icon instead of the cog" and "T4 compact bar" (owner answer to question 12):
each metrics bar card's settings button shows its cell icon, and below 30rem of free map (back at 32rem) the bar
becomes a two-row icon bar. The side panels no longer give way (plan `studio-panels-give-way.md` is undone).

## Tasks

### 1. Remove the side panels giving way
- Drop `SidePanelRoom`, the collapsed inspector strip with its dot, the dependency inspector's collapse store
- Keep the explorer's own collapse button, the bars centred between the panels (O7)

### 2. Cell icons
- New `cc-metric-glyph` (`kind: "area" | "height"`) next to `cc-layout-glyph`
- Optional icon on `cc-axis-card-header` (cog without one); titles "Area settings", …
- Scenarios: bookmark button opening a shared menu (open saved scenarios, save current state)
- Scenarios dialog group icons use the same icons

### 3. Compact bar
- `ccBarShell` exposes compact mode from its free width with hysteresis (30rem / 32rem)
- Compact template: groups Layout | Area, Height, link / Edges, Color | Labels / Scenarios | tools
- Tooltips "<Cell> · <metric> · <meta>" as `data-tip` and `aria-label`; choosers end with "<Cell> settings"
- Variants: radial (Folders, no link, no edges), delta, no edges (empty slot)

### 4. Tests, docs
- Unit tests, e2e for the compact switch, changelog rewrite, progress notes

## Steps

- [x] Complete Task 1: Remove the side panels giving way
- [ ] Complete Task 2: Cell icons
- [ ] Complete Task 3: Compact bar
- [ ] Complete Task 4: Tests, docs, all checks

## Notes

- Progress: `dev_docs/studio/agents/progress/02-compact-metrics-bar.md`
