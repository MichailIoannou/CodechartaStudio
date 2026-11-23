---
name: Nav bar and metrics bar fit
state: complete
version: 1
---

## Goal

Implement the owner follow-ups of 2026-11-22 (design `00-design-principles.md` §3 "Narrow window", `03-projects.md` P1,
`05-snapshots.md` W1, `06-compare.md` C2, `02-themes.md` T4 "Layout", "Narrow map", "T4 compact bar"; mock-up
`mockups/nav-and-bar-fit.html`): the nav bar uses all of `navbar-start` and gives way step by step, and the metrics bar
keeps its labels whole, switches to the compact bar at its measured minimum and animates the switch.

## Tasks

### 1. Nav bar
- Project menu shows the folder only; W1 drops the `@ sha`; the logo keeps a fixed `h-8 w-11`
- `NavBarFit` service: watches `navbar-start`, picks the first step that fits (project label shortens to 6 characters,
  project icon-only, W1 / comparison chip narrows, W1 icon-only / chip labels-only)
- W1 fixed at 18rem, narrowed only by the fit; its badge as a dot in the icon-only form

### 2. Metrics bar
- Layout cell: glyph and caret only, tooltip "Layout · <layout>"
- Card minimums: label row, meta value, 12 characters of the name plus "…"
- Compact below the measured full-bar minimum, back at +32 px; both forms 74 px tall
- Switching animation (Web Animations API, 240 ms, instant with reduced motion)

### 3. Verification
- Unit tests, e2e (nav bar give-way order, compact threshold and height, reduced motion), changelog, progress note

## Steps

- [x] Complete Task 1: Nav bar
- [x] Complete Task 2: Metrics bar
- [x] Complete Task 3: Verification

## Notes

- Branch `feature/studio-nav-and-bar-fit` from `feature/studio-next`; progress note
  `dev_docs/studio/agents/progress/02-05-nav-and-bar-fit.md`.
