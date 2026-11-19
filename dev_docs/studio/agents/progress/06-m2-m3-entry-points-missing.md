---
name: 06-M2/M3 compare entry points and missing analyses
state: progress
version: 1
---

## Goal

Make comparisons reachable from everywhere the design puts them (ref picker, branch comparisons, recent
comparisons, History menus, chip actions) and never fail just because an analysis is missing ("Analyse
missing" / "Use nearest", staleness, size limits) — plan 06 M2 and M3.

## Tasks

Copied from `06-compare-commits-and-prs.md` M2 (core tasks 1–2, renderer 3–8) and M3 (renderer 1–4). Combined
into one agent by orchestration (weekly budget). Branched from `feature/studio-stack` (06-M1 core + renderer
merged). Design overrides the plan's UI: `design/06-compare.md` (C1 entry points — the existing Compare tab,
**no `cc-compare-button`**; C3 dialog; C4 ref picker; C5 preparation; C6 outcomes; "Deviations from the plan"),
`design/04-history.md` (H10 menus), `design/00-design-principles.md`, mock-up.

From `06-m1-compare-core.md` (renderer notes): replace the Base/Head inputs with `cc-ref-picker` and an
`explicit` intent so Base stays base; add base-mode radios and the Pull requests | Recent lists (the PR list
itself needs `hosting.list*`, which is blocked on gh/glab fixtures — show the design's not-available state);
History entries go through 04-M5's `COMMIT_ACTIONS` port to `CompareFacade.compareCommits` /
`compareWithParent` / `compareWithCurrent` / `openDialog`; the port has no disabled state — add an optional
`disabledReasonFor?` (C1: disabled "Compare with Parent" for a root commit). For M3: `needsDecision` and
`continueWithShownSnapshots()` exist; add the `analysing` phase (enqueue only the missing side through the
snapshots feature) and the stale wording; harden the race where a snapshot-view resolve already in flight
replaces a freshly loaded pair. Core tasks: `Revision` refuses short names today — branch and explicit intents
need their own fields (`06-m1-compare-core.md`). Parallel work note: another agent adds History write actions
(04-M7/M8 renderer: branch context menu, fetch) at the same time — contribute branch-menu entries through a port
or the smallest possible hook, and keep shared-file edits small.

M2: 1–2 core intents · 3 ref picker · 4 dialog (no button) · 5 recent comparisons · 6 History entry points ·
7 chip actions · 8 docs/e2e. M3: 1 missing-side paths · 2 preparation list · 3 staleness and size limits · 4 e2e.

## Steps

- [ ] M2 core intents
- [ ] M2 ref picker and dialog
- [ ] M2 recent comparisons
- [ ] M2 History entry points
- [ ] M2 chip actions and docs
- [ ] M3 missing sides and preparation
- [ ] M3 staleness and size limits
- [ ] E2E

## Notes

