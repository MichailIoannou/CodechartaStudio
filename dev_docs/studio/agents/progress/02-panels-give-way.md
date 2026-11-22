---
name: 02 follow-ups — side panels give way, desktop tools deep link
state: complete
version: 1
---

## Goal

Two design follow-ups from O8: side panels give way when the floating bar has no room (`design/02-themes.md` T4
"Too little room", owner question 12, default applied), and the "Open desktop tools" link reaches the failing tool's
row (`design/01-desktop-tools.md` D2 target behaviour, D5).

## Steps

- [x] 1. Side panels give way (metrics view: explorer and inspector)
- [x] 2. Desktop tools deep link (facade entry, dialog, panel, history view)
- [x] 3. Changelog (two unreleased entries rewritten), gates

## Notes

Branch `feature/studio-02-panels` from `feature/studio-next`.

### 1. Side panels give way
- `features/shared/services/sidePanelRoom.service.ts`: `SidePanelRoom`, provided per view (metrics view), and
  `registerSidePanel({ side, isOpen, coveredWidthPx, collapse })`. Free width = window − covered widths − 2 × 6 px,
  the same formula as `ccBarShell`'s free width; the limit is 30rem from the root font size. At 900 px with default
  widths 236 px are free; at 1150 px 486 px, so nothing changes there (design: "above about 1150 px").
- Explorer: registers as `left`, collapse = `ExplorerCollapseService.collapse()` (new, persisted like the toggle).
- Metrics inspector: `InspectorVisibilityService` gets `isCollapsed` / `isExpanded` / `collapse()` / `expand()`; the
  collapsed state is forgotten when the selection clears, so the next selection opens it expanded. Collapsed, the
  inspector is a strip at the top right (same island, `height: auto`) with the selected name (full path in `title`)
  and an "Expand inspector" button (`fa-solid fa-circle-info`), mirroring the explorer's collapsed strip. It gives the
  bars their room back (`--cc-bar-inset-right: 0px`), and the legend panel no longer moves aside for it.
- Resize: only when both sides are open and the free width drops below 30rem, the inspector collapses. A view kept
  alive in the background ignores resizes (its host is detached).
- e2e `app/codeCharta/e2e/sidePanelsGiveWay.e2e.ts` (mouse only): at 900 px the whole give-way cycle and a click on the
  Legend tool beside the open inspector; at 1150 px both panels stay open, and narrowing to 900 px collapses the inspector.

**Deviation 1 (closest reading, needs the designer):** read literally, "opening a side panel collapses the other" makes
the explorer unusable at about 900 px: a click on a row selects it, the selection opens the inspector, and the explorer
collapses under the pointer (the first e2e run failed exactly there, on opening a folder). Implemented instead: the
panel the reader is working in keeps its place — when the opening follows a click (or focus) inside the panel on the
other side, the opening panel opens collapsed itself. A selection made on the map, or a click on a collapsed panel's
expand button, collapses the other side as designed. So at 900 px: clicking a file in the explorer shows it in the
inspector's collapsed strip; "Expand inspector" opens it and collapses the explorer; "Expand explorer" does the reverse.

**Deviation 2:** while the inspector is collapsed, selecting another building updates the strip but does not reopen
the inspector (it would collapse the explorer the reader may just have opened). One click on the strip reopens it.

**Deviation 3 (scope):** only the metrics view takes part. The dependency view's inspector has its own dismiss state
in `DependencyInspectorStore` and no collapsed form; the domain view has no inspector. The dependency view keeps the
known limit of 02-M7 until the designer confirms the rule above; adding it there means a collapsed strip for
`cc-dependency-inspector` and `registerSidePanel` calls in it.

Not covered by the design, left alone: dragging a panel wider with its resize handle never collapses the other one.

### 2. Desktop tools deep link
- `features/globalSettings`: `GlobalConfigurationTarget` (`{ section: "desktopTools", tool?: ToolId }`) and the root
  service `GlobalConfigurationOpener.openGlobalConfiguration(target?)`, both exported from the facade. The Settings
  button (`cc-settings-button`) serves it with its dialog, as D2 asks ("the settings button component exposes … through
  its facade" — the entry sits in the globalSettings facade, which owns the dialog).
- `GlobalConfigurationDialogComponent.open(target?)`; for `desktopTools` it calls `DesktopToolsPanelComponent.reveal(tool?)`:
  `scrollIntoView({ block: "start" })` on the section at once, then focus on the tool's "Choose…" (or "Check again"
  without a tool) as soon as it is rendered — after the report arrives if it was still loading. Focus is taken once.
- History view: the "Open desktop tools" button of the git problem notice opens the shared dialog through the opener
  with `tool: "git"` (both problems that offer it are git's); its private dialog copy is gone.
- e2e in `gitHistory.e2e.ts`: git missing → "Open desktop tools" → section in view, Git's "Choose…" focused.
- If the core is down, "Check again" is disabled and cannot take focus; the section is still scrolled into view.

### Verification
See the report of this milestone (gate results pasted there).
