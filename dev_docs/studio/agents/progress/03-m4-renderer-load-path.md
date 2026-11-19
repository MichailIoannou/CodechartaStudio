---
name: 03-M4 renderer load path
state: progress
version: 1
---

## Goal

Load project snapshots from the managed store into the map: mark them as project maps, normalise root
names, replace loaded maps in one step, keep them out of IndexedDB (D6), and boot the desktop app from a
project. Web behaviour unchanged (plan 03, Milestones, M4).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M4 (tests to write first are listed there).
Branched from `feature/studio-stack`. Design: `design/03-projects.md` (loading states: the views' existing
loading overlay; nothing new on screen in this milestone).

From `03-m2-projects.md` / `03-m3-snapshots.md` (shell hand-over): read maps with 16 MiB `readMapChunk`
calls through `bridge.request(...)` (allocate `Uint8Array(totalBytes)` after the first chunk); bytes are
always gzip; call `snapshots.recordMapFacts` once after parsing; the old whole-file `readSnapshotMap` may be
retired here if nothing needs it. Owner decision OD1: one working folder at a time. Overview section 7: never
remove the last map and then load — replace in one step; clear `FileSelectionModeService.lastSetFilesOfPreviousMode`
on project switches is plan 06's.

1. Split settings restore from file restore (structural)
2. Mark maps from a project snapshot
3. Normalise root names
4. Replace loaded maps in one step
5. Keep project maps out of the saved session (IndexedDB)
6. `FilesLoadedSource` `"project"`, `loadProjectSnapshots`
7. Boot the desktop app from a project

## Steps

- [x] 1. Structural split
- [x] 2. Project snapshot origin
- [x] 3. Root names
- [x] 4. Replace in one step
- [x] 5. IndexedDB filter
- [x] 6. Load project snapshots
- [ ] 7. Boot from project

## Notes

- Verified before changing code: `load/loadFiles.useCase.ts` (`LoadFilesUseCase`, private `commit`,
  `provenance`, `applySettingsAndFilesFromSavedState`), `LoadFileService.loadFiles`
  (`stores/fileStore/loaders/ccJson/services/loadFile.service.ts`), `fileStore.facade.ts`,
  `stores/rootStore/indexedDB/indexedDBWriter.ts` (`DB_VERSION = 37`), `mapCcJson2ToCCFile`
  (`.../util/ccJson2/ccJson2ToCCFile.ts`, called only from `getCCFile`), `FilesLoadedSource`
  (`.../store/filesLoaded/filesLoaded.actions.ts`), `describeFileBeingRead` (`util/busy/loadPhase.ts`). All as
  the plan names them.
- Task 1: `applySavedSettingsUpFront(savedCcState)` returns `{ restoredSettings, missingProperties }`;
  `provenance()` takes `forceDefaultMetrics` (default `source === "reset"`).
- Task 4/6: `LoadFilesOptions` is exported as a type through `fileStore.facade.ts`; `commit` takes it as an
  optional rest tuple so existing calls still reach `loadFiles(nameDataPairs)` with one argument (existing
  specs assert `toHaveBeenCalledWith(pairs)`, which a trailing `undefined` would break).
- Task 5 deviation: "not due when nothing is persistable and nothing is persisted" is narrowed to "files are
  loaded, all of them project maps, and nothing is persisted", so an empty file list keeps today's web
  behaviour (due while nothing was persisted yet). `persistableFiles` reads `fileState.file?.fileMeta?` because
  existing specs (and the `removeFilesFromState` empty-list state) hand in file states without a file.
- Task 6: reading, root renaming and checksum grouping live in `load/services/projectSnapshotReader.ts`
  (`readProjectSnapshots`, types `ProjectSnapshotToLoad`, `LoadedSnapshotFacts`, `ProjectSnapshotsLoadResult`,
  re-exported as types from `load.facade.ts`). `LoadedSnapshotFacts.rootName` is the map's **original** root
  name (what `snapshots.recordMapFacts` should record). A `readBytes` rejection counts as unreadable. When
  `LoadFileService` rejects every map (validation errors, its own dialog shows) the result reports them as
  unreadable and the indicator is cleared; a partial validation failure still lists the rejected map under
  `loaded` (not distinguished in M4).

