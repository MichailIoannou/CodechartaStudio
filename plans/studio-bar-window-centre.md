---
name: Metrics bar centred on the window
state: progress
version: 1
---

## Goal

Implement the owner change of 2026-11-22 (`02-themes.md` T4 "Position" and "T4 compact bar" → "When"): the bars
are centred on the window again, as upstream #4557 has them, their room is the width around the window centre that
no open panel covers, and the metrics bar turns compact below its full minimum, so no panel covers it.

## Tasks

### 1. Bar shell centred on the window
- `ccBarShell`: `left-0 right-0 mx-auto`; max width capped at the room around the window centre
  (window − 2 × the wider panel inset − the island margins) instead of the free map between the panels
- Domain and dependency bars use the same shell, so they follow

### 2. Compact switch measures the room
- The compact probe spans the room around the window centre (both sides inset by the wider panel)
- Hysteresis (+32 px), 74 px height and the 240 ms switch stay

### 3. Tests, changelog, notes
- Unit tests for shell and probe; e2e: window-centred with one and both panels open, #4557's test restored
  (bar keeps its place when the explorer collapses), compact so no panel covers the bar
- Rewrite the unreleased "Bars beside the side panels" changelog entry; progress note

## Steps

- [ ] Complete Task 1: Bar shell centred on the window
- [ ] Complete Task 2: Compact switch measures the room
- [ ] Complete Task 3: Tests, changelog, notes

## Notes

- Branch `feature/studio-bar-window-centre`.
