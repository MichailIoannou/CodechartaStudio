---
name: 03-M7 local source and scenarios
state: complete
version: 1
---

## Goal

Maps of a desktop project open their source files and VS Code straight from the project folder, and
scenarios bind to a project folder instead of a map file name (plan 03, Milestones, M7).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M7, and its "Interplay with existing features"
(localSource, Scenarios). Branched from `feature/studio-next`. No design file covers this milestone
(`design/03-projects.md` names no source or scenario UI); the plan's error state "source-file opening
answers 'folder not available'" applies. Source files are read only through the shell's composed
`projects.readSourceFile` (core `projects.sourceFileLocation` + realpath check); no core or shell change.

1. Port + `LocalSourceService` / `LocalSourceAvailability`
2. `linkedProjectFolders.ts`, `provideLinkedProjectFolders()` in `app.config.ts`
3. `mapBindingKey.ts` in scenarios
4. Changelog

## Steps

- [x] 1. `feat(visualization): let a linked folder serve local source files`
- [x] 2. `feat(visualization): open source files from project folders`
- [x] 3. `feat(visualization): bind scenarios to project folders`
- [x] 4. `docs(visualization): announce source files from project folders`

## As built

- Port `features/localSource/ports/linkedSourceFolders.port.ts` (exported from the localSource facade):
  `LinkedSourceFolders.folderOf(fileMeta)` → `null` (not a linked map) or a `LinkedSourceFolder`, which is
  `{ status: "available", rootPath, readFile(relativePath) }` or `{ status: "unavailable", label }`.
  `LINKED_SOURCE_FOLDERS` defaults to `{ folderOf: () => null }` (web build, specs).
- `LocalSourceAvailability`: `canChooseFolders` is the old `isAvailable` (picker exists, switched on, not
  blocked); `isAvailable = canChooseFolders || a visible map has a linked folder` (also an unavailable one,
  so its menu entries explain instead of vanishing).
- `LocalSourceService`: `MapLocation` carries `fileMeta`; `findSource` and `editorTargetOf` ask the port
  first. Available → `found` (`folder: { mapKey, directory: null, editorRootPath: rootPath }`) or
  `notFound`; editor target uses `rootPath`. Unavailable → `{ status: "folderUnavailable", folderLabel }`
  from both; the component toasts "The folder "<label>" is not available, so its files cannot be opened.
  Re-link it in the project." Never `folderNeeded` for a linked map, so the picker never opens for it.
- `isMapRoot` became `offersFolderSettings(nodePath)` (map root and `canChooseFolderFor(map)`), and
  `canChooseFolderFor(mapFileName)` (choosing allowed and the map has no linked folder) drives the map
  selector's folder row and its right-click menu: a project map shows neither "Set Local Folder…" /
  "Set VS Code Folder…" nor the "Folder: / VS Code:" row. `nodeContextMenu` renamed its computed to
  `offersLocalFolderSettings`.
- `features/projects/services/linkedProjectFolders.ts` (`LinkedProjectFolders`): no `projectSnapshot` →
  `null`; the snapshot's folder not in the active project or `missing` → unavailable with the snapshot's
  folder label; else available with the folder's `path` as root and `readFile` →
  `ProjectsService.readSourceFile` (`projects.readSourceFile`) → `new File([bytes], baseName)`.
  `provideLinkedProjectFolders()` from the projects facade, spread in `app.config.ts`.
- Fake bridge: new optional seed `sourceFiles: Record<"<folderId>/<relativePath>", string>` answered by
  `projects.readSourceFile` (every other file `null`, as before).
- Scenarios: `features/scenarios/util/mapBindingKey.ts` — `mapBindingKeyOf(fileMeta)` (folder label for
  project maps, file name otherwise) and `visibleMapBindingKeys(fileStates)` (unique keys of the visible
  maps, so two commits of one folder in delta bind once). Used by `saveScenarioDialog` and
  `scenarioListDialog` (signals renamed `visibleMapKeys`). `Scenario.mapFileNames` and `.ccscenario`
  unchanged.
- Tests: Jest specs for each step; web e2e (fake bridge) `projects.e2e.ts` "should show a source file of a
  project map from its folder without asking for a folder".

## Deviations from the plan

- The port lives in `ports/linkedSourceFolders.port.ts` (as `gitHistory` and `compare` do), not
  `services/linkedSourceFolders.ts`.
- `folderOf` does not answer `null` for a missing folder (plan test "should return no folder for a missing
  project folder"): `null` would hide the menu entries, or — with local source switched on — open the
  browser's picker for a project map, which the plan forbids; it answers `unavailable` instead, which
  realises the plan's error state "source-file opening answers 'folder not available'".
- `readFile` copies the bridge bytes into a fresh `Uint8Array` (`BlobPart` needs an `ArrayBuffer`-backed
  view in the TypeScript lib).
- Changelog: two Changed entries (source files, scenarios) instead of the plan's one; the scenario binding
  is a user-visible change of its own.

## Open questions for the designer

- The source of a project map is read from the folder's working tree, not from the snapshot's commit
  (out of scope here, plan 04). A file changed since the analysis shows its current text without a hint.
- "is not in the chosen folder" is still the wording when a project folder lacks the file.
