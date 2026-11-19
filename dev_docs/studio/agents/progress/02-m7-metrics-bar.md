---
name: 02-M7 metrics bar, file extension bar, toasts
state: progress
version: 1
---

## Goal

Ship the owner-approved visual refreshes that no plan milestone covers yet: the modernised metrics bar
(OD6, design T4), blended edges in the file extension bar (OD7, design T5), and toasts at the top right
below the nav bar (OD8).

## Tasks

New milestone created by orchestration for owner decisions OD6, OD7, OD8 (`design/owner-decisions.md`;
their "Plan impact" paragraphs name the files). Design: `design/02-themes.md` T4 and T5,
`design/00-design-principles.md` §3 "Toasts", mock-up `design/mockups/studio-screens.html`. Branched from
`feature/studio-stack`.

Parallel work note: other agents work on 03-M6 (projects) and 04-M3 (History view) at the same time. Keep
changes to shared files (nav bar, `CHANGELOG.md`) small; the toast change is one container class.

1. Metrics bar refresh (OD6, T4): one rounded bar, Layout and view-tools tabs inside it, link button as a
   square, the LEGEND edge tab becomes a Legend tool; specs and e2e page objects updated
2. File extension bar blended edges (OD7, T5): 24 px blend per boundary, no white gap, exact percentages
3. Toasts top right below the nav bar (OD8)
4. Changelog (one entry each, or fold into existing ones per root `CLAUDE.md`)

## Steps

- [ ] 1. Metrics bar
- [ ] 2. File extension bar
- [ ] 3. Toasts
- [ ] 4. Changelog

## Notes

