---
name: 03-M6 import and store settings
state: progress
version: 1
---

## Goal

Open or import a cc.json file into a project from the desktop app, move imported snapshots between
folders, and let the user move the managed store to another folder (plan 03, Milestones, M6).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M6. Branched from `feature/studio-stack`.
Design (overrides the plan's UI): `design/03-projects.md` P8 (open/import dialog), P9 (move/bind dialog —
its host is the snapshots dialog of area 05, which does not exist yet: build the dialog and its tests, and
record where its entry point will go), P10 (imported-snapshot label), P11 (drop target, optional), and the
store-folder rows in `design/01-desktop-tools.md`; `design/00-design-principles.md` for wording and
shortcuts; owner decisions incl. the store-folder confirmation (open question 11's answer).

Task 5 (drag and drop) depends on 03-M0 spike item 4 (`webUtils.getPathForFile` in the sandboxed preload),
which was never run: run it first on Linux (record the result in `03-m0-spikes.md`) and build task 5 only if
it passes. Task 3 changes `core/`: gates with and without `--all-features`, `npm run contract` no diff.
From 03-M5: `snapshots.openFile` sets neither the active project nor the view — call `projects.setActive` /
`projects.setView` after it; picker titles and filters come from the UI.

1. Open file dialog (P8), entry points, Ctrl+O
2. Move snapshot dialog (P9)
3. Core: change the store root
4. Shell and desktop tools: change the store folder
5. Optional: drag and drop (only if the spike passes)
6. Changelog

## Steps

- [x] 1. Open file dialog
- [x] 2. Move snapshot dialog
- [x] 3. Core store root change
- [ ] 4. Store folder in settings
- [ ] 5. Drag and drop (optional)
- [ ] 6. Changelog

## Notes

