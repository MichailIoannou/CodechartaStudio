---
name: 02-M5 editor color schemes
state: progress
version: 1
---

## Goal

Add the editor colour schemes as data only (Nord, VS Light, One Dark, VS Dark, Darcula, and the JetBrains
light scheme), with palette builders and a smoke test over every theme (plan 02, Milestones, M5).

## Tasks

Copied from `02-themes.md`, Milestones, M5. Design: `design/02-themes.md`, `design/00-design-principles.md`,
`design/owner-decisions.md` (design wins over the plan, including theme names and labels). **OD10: no theme
control in the nav bar — task 4 (quick toggle) is dropped.** From `02-m3`/`02-m4` progress: the builders
must supply `radial.neutralFolder`, `tintTarget`, the word-cloud stops and `dependencyGraph` (shared dark
object for dark schemes, light constants for light ones); `themes.spec.ts` already checks contrast across
the whole registry and the registry order. Do not edit `02-themes.md` (it carries an uncommitted owner edit);
record plan corrections in this file's Notes instead.

1. Builders plus Nord and VS Light
2. Visual smoke e2e over every theme
3. The remaining four (data-only acceptance: the commit touches only `tailwind.css` and `themes.ts`)
4. ~~Quick toggle~~ — dropped (OD10)
5. Eyeball pass and final changelog wording (one entry)

## Steps

- [ ] 1. Builders, Nord, VS Light
- [ ] 2. Smoke e2e over every theme
- [ ] 3. Remaining four schemes (data only)
- [x] 4. Quick toggle — dropped by OD10
- [ ] 5. Eyeball pass and changelog

## Notes

