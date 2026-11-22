---
name: Panels follow-ups — gate, O9.1 (side panels give way, desktop tools deep link)
state: complete
version: 1
---

## Goal

Clear the two quality-gate errors in the panels/charts area, then build the designer's answers to O9.1
(`design/02-themes.md` T4 "Too little room" refinements, `design/01-desktop-tools.md` D2).

## Steps

- [x] 1. Gate: dropped on the orchestrator's instruction — `metricColorRangeDiagram.component.ts` and
  `dependencyGraphOption.builder.spec.ts` were fixed on `feature/studio-themes` (985d514fb, 39eda0e3a) and reach
  `feature/studio-next` by merge. This branch leaves both files untouched.
- [x] 2. The panel the user works in never collapses: checked, `SidePanelRoom.makeRoomFor` already does what T4
  now says (a panel opened by a click or focus inside the other one opens collapsed itself). No change.
- [x] 3. Collapsed inspector strip: shared `cc-collapsed-inspector-strip` (features/shared), used by both
  inspectors. Same island as the explorer's strip, 300 px wide (`COLLAPSED_STRIP_WIDTH_PX`, moved from the
  explorer to `sidePanelRoom.service.ts` in a structural commit), `fa-solid fa-circle-info` button titled
  "Show inspector" (title = aria-label).
- [x] 4. A new selection does not reopen a collapsed inspector; the strip shows a `badge badge-primary badge-xs`
  dot (daisyUI `indicator` on the button) and the title "Show inspector — selection changed" until it is opened.
  What the inspector showed when it collapsed counts as seen, so a panel that opens collapsed (click in the
  explorer) shows no dot; selecting the seen node again clears it.
- [x] 5. Dependencies view gives way too: `SidePanelRoom` provided by `cc-dependency-view`;
  `DependencyInspectorCollapseStore` (collapsed state, forgotten once the inspector shows nothing; dot by subject
  id, now public on `DependencyInspectorStore`); `cc-dependency-inspector` registers as the right panel and shows
  the strip while collapsed (bottom `auto`, 300 px); the legend drawer moves aside only for the expanded inspector.
  Mouse-only e2e at 900 px in `e2e/sidePanelsGiveWay.e2e.ts` with the new fixture
  `resources/sample_with_declarations.cc.json` (sample1 plus two declarations and one declaration edge — the
  startup samples carry no declarations, so the dependency inspector never opens for them).
- [x] 6. Core down: the desktop tools deep link focuses the D1 heading (`tabindex="-1"`) while the core notice is
  shown, with or without a tool (the rows and their Choose… buttons are hidden then, Check again is disabled).
- [x] 7. Changelog entry "Bars beside the side panels" rewritten; gates.

## Notes

Branch `feature/studio-panels-followups` from `feature/studio-next`.

**Deviation / question for the designer:** T4 asks for the inspector strip to mirror the explorer's "with the
expand button on the side facing the map". The explorer's strip has its button at the screen edge (left), not
facing the map. Built as written for the inspector (button on its left, facing the map, then the name), so the
two strips are not exact mirrors. If a true mirror is meant, the inspector's button moves to the right end; if
"facing the map" is meant for both, the explorer's button moves to its right end.

Fake desktop bridge: not touched.
