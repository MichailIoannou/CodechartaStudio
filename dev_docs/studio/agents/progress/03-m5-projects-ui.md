---
name: 03-M5 projects UI
state: progress
version: 1
---

## Goal

The first new screens of the desktop app: the project menu in the nav bar, the project overview page,
creating and managing projects with their folders, booting into the last shown snapshot of the active
project — built to `design/03-projects.md` (plan 03, Milestones, M5).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M5, **adjusted to the design**, which overrides
the plan's UI wherever they differ (read its "Deviations from the plan"). Design elements in scope here:
P1 project menu (projects, folders, working folder — `cc-project-switcher`), P3 project overview page
(`cc-project-overview`, route `#/project`; replaces the plan's `cc-project-home`), P4 create project dialog,
P5 folder list editor, P6 manage project dialog, P7 delete confirmation. Out of scope (later milestones):
P8 open/import dialog and P11 drop target (03-M6), P9 move/bind (area 05), W1 workspace status (area 05).
Owner decision OD1: one working folder at a time — the plan's task 5 (`cc-project-folder-selector`, multi-folder
Apply) is removed; switching the working folder happens in P1. Follow `design/00-design-principles.md` for
nav-bar composition, icons, wording, toasts and z-layers, and `design/journeys.md` for the flows.

Renderer API from 03-M4 (`03-m4-renderer-load-path.md`): `LoadFilesUseCase.loadProjectSnapshots(...)`,
`bootFromProject(...)`, `showSampleFiles()`, `unloadAllFiles()`; `ProjectSnapshotToLoad { origin, displayName,
readBytes }`; send `{checksum, rootName}` to `snapshots.recordMapFacts`; toast each `identicalContent`.
Shell API from 03-M2/M3: `projects.pickFolder({ title })` → token, `snapshots.readMapChunk` (16 MiB chunks),
`projects.revealFolder`; fake bridge with in-memory projects/snapshots (`standInForTheDesktopBridge(page, seed)`).
Retire `readSnapshotMap` if nothing uses it.

1. Projects service, snapshot bytes, display names
2. Boot service, project overview page (P3), wiring
3. Folder list editor (P5), create project dialog (P4)
4. Project menu (P1) in the nav bar, with folders and working folder
5. ~~Folder selector~~ — removed by OD1 (folded into task 4)
6. Manage project dialog (P6) incl. delete confirmation (P7)
7. Reset dialog seam
8. E2E on the web suite with the fake bridge
9. Changelog

## Steps

- [x] 1. Projects service
- [x] 2. Boot and overview page
- [ ] 3. Create project
- [ ] 4. Project menu
- [x] 5. Folder selector — removed by OD1
- [ ] 6. Manage project
- [ ] 7. Reset seam
- [ ] 8. E2E
- [ ] 9. Changelog

## Notes

