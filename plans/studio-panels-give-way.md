---
name: Side panels give way, desktop tools deep link
state: complete
superseded-by: studio-compact-metrics-bar
version: 1
---

## Goal

Keep at least 30rem of map free for the floating bars by collapsing the opposite side panel (design
02-themes T4 "Too little room", owner question 12 default), and let "Open desktop tools" open the
settings dialog at the desktop tools section with the failing tool focused (design 01 D2/D5).

## Tasks

### 1. Side panels give way
- View-scoped room service in `features/shared`: panels register side, open state, covered width, collapse
- Opening a panel with less than 30rem free collapses the other side; a resize collapses the inspector
- Explorer and metrics inspector register; the inspector gets a collapsed strip that reopens it
- e2e at about 900 px driven with the mouse

### 2. Desktop tools deep link
- Panel `reveal(tool?)`: scroll the section into view, focus "Choose…" of the tool or "Check again"
- Dialog `open(target?)`, a root opener service in the globalSettings facade, the settings button serves it
- History view asks the opener instead of its own dialog

## Steps

- [x] Complete Task 1: Side panels give way
- [x] Complete Task 2: Desktop tools deep link
- [x] Changelog, progress file, all gates

## Notes

- Progress and deviations: `dev_docs/studio/agents/progress/02-panels-give-way.md`
- Task 1 was undone by `studio-compact-metrics-bar.md` (owner answer to question 12): the panels stay open and the
  metrics bar turns compact instead.
