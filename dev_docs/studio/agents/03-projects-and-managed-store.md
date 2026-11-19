# Plan 03 — Projects and the managed store

- **Status:** ready for implementation; owner decisions applied (see "Owner decisions applied")
- **Depends on:** `00-overview-and-decisions.md` (D1–D10, sections 4, 5, 7), `01-core-and-desktop-shell.md` (see "Required from plan 01")
- **Unlocks:** 04 (git UI needs the active folder), 05 (analysis runs write snapshots into this store), 06 (compare loads two snapshots through this plan's load path)
- **Estimated size:** M0 S · M1 M · M2 L · M3 M · M4 M · M5 L · M6 M · M7 M

## Goal

In the desktop app the user works with **projects** instead of loose cc.json files. A project names a set of folders on disk (the repository, forks, helper folders); the Rust core keeps every analysis of those folders as a snapshot in its managed store and the app reopens the last shown one on start. An existing `.cc.json` / `.cc.json.gz` can still be opened directly ("Open cc.json…"): it is filed as an imported snapshot of a project for the folder that contains it (section 6). The web build keeps today's upload button and behaves exactly as before. Everything about projects, folders and snapshots is also usable without any UI through `codecharta-core projects …` / `snapshots …` (section 3).

## Current state

Angular side verified by opening the files (visualization 2.11.0). Paths are repo-relative.

Load pipeline
- `visualization/app/codeCharta/load/loadFiles.useCase.ts` `LoadFilesUseCase` has three public methods: `loadOnBoot()`, `loadFromUpload(readNameDataPairs: () => Promise<NameDataPair[]>)`, `reloadAfterReset()`. Private `commit(nameDataPairs, provenance)` calls `LoadFileService.loadFiles` and then `store.dispatch(filesLoaded(provenance))` in the same task (its doc comment requires that). Private `provenance(source, options)` sets `forceDefaultMetrics: source === "reset"`. Private `applySettingsAndFilesFromSavedState` applies `preferences`, `mapState`, `domainState` up front and hands `sharedView` + the three lens sources to the reconciliation as `restoredSettings`.
- `loadOnBoot()` reads `CcStatePersistence.read()` once, then `loadFromUrl` when `QueryParamsService.hasFile()`, else `loadFromIndexedDb`, which falls back to `loadSampleFiles` (`sampleFile1`, `sampleFile2`).
- `visualization/app/codeCharta/load/load.facade.ts` exports only `LoadFilesUseCase` and `CcStatePersistence`. Rule `load-external-access-only-via-facade` (`visualization/conf/dependencyCruiser/loadRules.js`) forbids any other entry.
- `visualization/app/codeCharta/stores/fileStore/store/filesLoaded/filesLoaded.actions.ts`: `export type FilesLoadedSource = "url" | "indexedDB" | "sample" | "upload" | "reset"`; `FilesLoadedPayload { source, areSampleFiles, urlMetrics, forceAutoFit, forceDefaultMetrics, restoredSettings }`. The only code that branches on `source` is `provenance()`.
- `visualization/app/codeCharta/features/codeMap/effects/setLoadingIndicator/setLoadingIndicator.effect.ts` `hideLoadingFileOnCommit$` clears `isLoadingFile` on `filesLoaded`. A load that commits nothing must clear it itself.
- `visualization/app/codeCharta/stores/fileStore/loaders/ccJson/services/loadFile.service.ts` `LoadFileService.loadFiles(nameDataPairs)`: starts from `clone(this.filesRepo.getFiles())` (deep copy of every loaded map), runs `enrichFileStatesAndRecentFilesWithValidationResults`, then `filesRepo.setFiles(fileStates)`, `setStandardByNames(recentFiles)`, `fileRoot.updateRoot(rootName)`. Throws `NO_FILES_LOADED_ERROR_MESSAGE` before writing when nothing was valid.
- `.../loaders/ccJson/util/fileParser.ts` `addFile`: a file whose `fileChecksum` is already loaded is not added; the existing entry's `fileMeta.fileName` is overwritten with the new name. A same-name/different-checksum file gets `_1`, `_2` inserted before the first `.`. When `currentFilesAreSampleFiles` is true the list is emptied first.
- `.../util/ccFileHelper.ts` `parseCcFileBytes(bytes: Uint8Array): Promise<ExportCCFile | CcJson2 | null>` gunzips by magic bytes and returns `null` on any failure; `getContentChecksum(content)`; `getCCFile(file: NameDataPair)` normalises 1.x content through `normalizeExportCCFileToCcJson2` (`util/ccJson2/normalizeToCcJson2.ts`) before mapping; 1.x edges, blacklist and marked packages are **path** based (`/<rootName>/…`), so renaming a 1.x root means rewriting those paths.
- `.../util/ccJson2/ccJson2ToCCFile.ts` `mapCcJson2ToCCFile(file, nameDataPair)` builds `fileMeta` from `nameDataPair.fileName`, `file.meta.checksum`, `projectName`, `apiVersion`, `nameDataPair.fileSize`. `meta.commitHash` is dropped. Edges and lens data are resolved through node **ids**, not the root name.
- `visualization/app/codeCharta/model/domain.model.ts` `FileMeta { fileName; fileChecksum; apiVersion; projectName; exportedFileSize; repoCreationDate? }`. `model/codeCharta.api.model.ts` `NameDataPair { fileName; fileSize; content }`; rule `wire-dto-only-in-filestore-boundary` allows importing that file only from `stores/fileStore/`.
- `stores/fileStore/store/files.reducer.ts` `removeFilesFromState`: when no file stays selected it writes `newState[0] = { ...newState[0], selectedAs: Partial }` without checking for an empty list, producing `[{ selectedAs: "Partial" }]` with no `file`.
- `lenses/structure/store/structureTree.selector.ts` `_getUndecoratedAccumulatedData`: in delta state, `reference.file.map.name !== comparison.file.map.name` falls back to `AggregationGenerator.calculateAggregationFile`. `util/aggregationGenerator.ts` `extractNodeFromMap` uses `fileMeta.fileName` as the folder node name of each map, and `util/nodePathHelper.ts` `getTopLevelMapName` splits on `/` — a display name must not contain `/`.
- `load/effects/reconcileAfterLoad/reconcileAfterLoad.effect.ts`: every file-set change runs `mergeFileSettings()` and `unfocusNode()`; only a load whose `filesLoaded` payload has `restoredSettings` gets the user's values back. So a plain project load **erases the user's exclusions, marked packages and focus**, exactly as an upload does today.
- The file-loading spinner is rendered **inside the three view components** (`views/metricsView`, `views/domainView`, `views/dependencyView`), not in the shell. Where no view is mounted nothing shows `isLoadingFile`.
- `stores/fileStore/store/fileStore.readWindow.ts` `FileStoreReadWindow` (exported by `fileStore.facade.ts`): `files$`, `visibleFileStates$`, `isDeltaState$`, `isLoadingFile$`, `getFiles()`, `getVisibleFileStates()`.
- ccsh facts this plan relies on: every ccsh-written map has root name `root` (`analysis/model/.../Project.kt`, `ProjectBuilder.kt`); `meta.checksum` is computed over the body only, so two commits with identical analysed content have the **same checksum** (`ProjectToCcJsonV2Mapper.kt`); with `--commit` the output file is renamed `"$shortHash.${file.name}"` (`CommitAnalysisContext.kt`) — used only as an import *hint* re-verified with git; `-e/--exclude` and `--without` take comma-separated lists, `--without` accepts the parser names plus `git` and `svn`.

Persistence
- `stores/rootStore/indexedDB/indexedDBWriter.ts`: exported `DB_VERSION = 36`, `CCSTATE_STATE_ID = 1001`; module-private `CCSTATE_FILES_ID = 1002`. `writeCcState(state)` writes the files record too when record 1002 does not exist yet. `writeCcFiles(files)` returns early unless `isFilesWriteDue(files)`; both end with `persistedFiles = files`. `isFilesWriteDue` = `!holdsThePersistedFileStates(files)`, comparing length and file-state identity against module variable `persistedFiles` (`null` until the first read or write, so with `null` even an empty list is "due").
- `load/effects/saveCcState/saveCcState.effect.ts` `SaveCcStateEffect.saveCcFiles$` fires on `[...fileActions, setState]`, holds the pending-save spinner when `isFilesWriteDue(...)`, then calls `writeCcFiles(this.ccStateSnapshot.get().files)`.
- This plan adds **no key to `CcState`**, so no migration and no `DB_VERSION` bump.

Shell and nav bar
- `views/codeCharta.component.ts` calls `loadFilesUseCase.loadOnBoot()` in `ngOnInit` and sets `isInitialized` in `finally`; the template renders `<cc-nav-bar>`, `<router-outlet>`, `<cc-changelog-dialog>` only when initialised.
- `features/navBar/components/navBar/navBar.component.html` `navbar-start`: `<cc-nav-bar-logo>`, divider, `<cc-nav-bar-folder-button>`, then `<cc-delta-selector>` if `isDeltaState()` else `<cc-map-selector>`.
- `features/navBar/components/navBarFolderButton/` calls `UploadFilesService.uploadFiles()` (hidden `<input type="file" accept=".json,.gz" multiple>`, then `loadFromUpload`). There is no drag-and-drop anywhere.
- `features/globalSettings/components/globalConfigurationDialog/confirmResetMapDialog/confirmResetMapDialog.component.ts` `confirmReset()`: `ccStatePersistence.delete()` → `localSource.forgetAllFolders()` → `mapResetStore.resetState()` (`setState({ value: defaultState })`, i.e. `files: []` while the views stay mounted) → `loadFilesUseCase.reloadAfterReset()`.
- `visualization/app/app.config.ts` registers effects by spreading each feature's array into `provideEffects([...])` and holds the root `providers`.

Local source
- `features/localSource/services/localSource.service.ts` `LocalSourceService`: private `locate(nodePath)` resolves the visible `FileState`; `findSource(nodePath)` reads through `readableSavedFolder(mapFileName)` + `findFile(directory, relativePath)` and returns `SourceLookup` (`found` carries a DOM `File` and a `LocalSourceFolder`); `editorTargetOf(nodePath)` returns `{ mapFileName, relativePath, editorRootPath }`.
- `.../services/localSourceAvailability.ts` `LocalSourceAvailability.isAvailable` is a `computed` over `canOpenFoldersHere()`, the `localSourceEnabled$` preference and a private `isBlocked` signal; it knows nothing about the visible map. `features/localSource/facade.ts` exports three components, `canOpenFoldersHere` and `LocalSourceService`.
- `.../services/localSourceFolders.repository.ts`: `LocalSourceFolder { mapKey; directory: LocalDirectoryHandle | null; editorRootPath: string | null }`, keyed by `fileMeta.fileName`. `.../services/localSourcePaths.ts` `vscodeFileLink(editorRootPath, relativePath)`.

Scenarios
- `features/scenarios/model/scenario.model.ts` `Scenario.mapFileNames?: readonly string[]`, written from `components/saveScenarioDialog/saveScenarioDialog.component.ts` (`visibleFileNames`, from `fileMeta.fileName`) and matched in `services/scenarioViewModel.service.ts` (`toScenarioView`, `getScenarioPriority`) against a `Set` built in `components/scenarioListDialog/scenarioListDialog.component.ts`.

Tooling
- `visualization/package.json`: `test` (Jest, `conf/jestUnit.config.json`, coverage over `app/**/*.ts`, 80 % global gate), `lint` = `lint:architecture` (`depcruise app`) + `lint:styles` + `lint:deadcode` (`knip`), `build`, `e2e:ci`. `visualization/knip.jsonc` counts a spec as a consumer of an export. `conf/dependencyCruiser/{generalRules,viewAndFeatureRules,loadRules}.js` hold the rules named below. Root `commitlint.config.js` `scope-enum` includes `visualization`; plan 01 adds `core`.
- `visualization/electron/main.js` is the whole Electron main process today (no preload, no IPC, no single-instance lock); plan 01 turns it into the thin shell.

Git behaviour confirmed with git 2.56 on Windows in a throwaway repository (relevant to the core's folder inspector): `rev-parse --show-toplevel` prints a **forward-slash** path (`C:/…`) and exits 128 outside a repository; `symbolic-ref --quiet --short refs/remotes/origin/HEAD` prints `origin/<branch>` and exits 1 when unset; `rev-list --max-parents=0 HEAD` exits 128 in a repository without commits; `config --get-regexp ^remote\..*\.url$` prints `remote.<name>.url <url>` per line **including credentials embedded in the URL**; `rev-parse --verify --quiet <hex>^{commit}` exits 0 and prints the full SHA for a known short hash, exits 1 without output for an unknown one; `show -s --format=%H%x00…` separates fields with NUL and ends with a newline; `rev-parse --abbrev-ref HEAD` prints the **current** branch, not the default branch.

UNVERIFIED (runtime behaviour, not checkable in the repo): `ipcRenderer.invoke` returning a `Uint8Array` of tens of MB (structured clone plus the extra copy `contextBridge` makes); the views tolerating `files: []` for longer than the instant today's reset takes; `webUtils.getPathForFile(file)` callable from the sandboxed preload (only for optional drag-and-drop, M6.5); the `trash` crate moving a directory under `%APPDATA%` to the recycle bin and failing cleanly on network drives; `std::fs::rename` over an existing file on Windows while an indexer holds it; the chosen locking crate's behaviour on Windows. Each has a spike in M0. All crate and version choices named below are UNVERIFIED: confirm with `cargo search` / `cargo add` and record the result in the milestone's progress file.

## Required from plan 01

Names below are plan 01's (`01-core-and-desktop-shell.md`). Re-read it as implemented before M1; if a name differs, adapt and record it in the milestone's progress file (`dev_docs/studio/agents/progress/`).

Core
- `core/` workspace with crates `codecharta-core` (library), `codecharta-core-api` (serde contract types, `ts-rs` derive), `codecharta-cored` (binary `codecharta-core`: `serve`, `askpass`, CLI). The JSON-RPC dispatcher with a method table, per-request error mapping to the stable `ErrorCode` of `codecharta-core-api`, and the notification channel. This plan only registers methods in that table.
- `ErrorCode` / `CoreError` (`codecharta-core-api/src/error.rs`) with at least `BAD_REQUEST`, `NOT_FOUND`, `IO_ERROR`, `TOOL_NOT_FOUND`, `INTERNAL`; codes are append-only. This plan appends the store codes (section 3).
- A tool runner in `codecharta-core/src/tools/` that runs the system `git` with an argument vector (no shell), stdin closed, timeout, hardened environment (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GIT_OPTIONAL_LOCKS=0`, `GIT_PAGER=cat`, `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` removed), `TOOL_NOT_FOUND` when git is missing. This plan writes against a `trait GitRunner` seam (`fn run(&self, cwd: &Path, args: &[&str]) -> Result<GitOutput, CoreError>`) and adapts to plan 01's real type.
- Settings and paths in the core: a settings file with `store_root: Option<PathBuf>`, `AppPaths::default_store_root()` (Windows `%APPDATA%\codecharta-visualization\store`; crate candidate `directories`), a `--store-root` flag / `CODECHARTA_STORE_ROOT` environment variable for CLI and tests, and the JSON-RPC methods `paths.get`, `paths.resetStoreRoot`. This plan implements `store.changeRoot` beside them. As built (03-M0 item 0): `Paths::store_root()` (setting, else `<dataDir>/store`), `store_root: Option<String>`, no `directories` crate, and no `--store-root` / `CODECHARTA_STORE_ROOT` — CLI and tests isolate the store with `--data-dir` / `CODECHARTA_DATA_DIR`.
- The method gate: methods flagged **shell-only** in the method table are refused when they come from the renderer (the shell relays renderer requests by name; it never relays shell-only names). This plan adds `projects.inspectFolder`, `projects.folderPath`, `projects.sourceFileLocation`, `snapshots.inspectImportFile`, `snapshots.mapLocation`, `store.changeRoot`.
- Shell-composed bridge methods: the `DesktopBridge` offers a few methods that exist only in the shell because they combine a native dialog or a file read with core calls. As built (03-M2 part B): they are not core methods and not in the generated contract; the renderer calls them through `bridge.request(method, params)` like a core method, the shell's relay runs them in the main process instead of forwarding them, and `DesktopBridge` declares their params and results by hand (`ShellMethods` in `util/desktop/desktopBridge.ts`). This plan's shell-composed methods: `projects.pickFolder`, `projects.readSourceFile`, `snapshots.pickImportFile`, `snapshots.readMapChunk`, `store.chooseRoot`, plus `projects.revealFolder` (reveal-in-explorer over `projects.folderPath`).
- Test support: `cargo test` workspace setup, `tempfile` as dev-dependency, a way for integration tests to start the binary (`env!("CARGO_BIN_EXE_codecharta-core")` from `codecharta-cored/tests/`). This plan creates the temporary-git-repository fixture (M2.2).

Renderer and shell (`visualization/`)
- Generated contract in `visualization/app/codeCharta/model/coreApi/` and the regeneration command; this plan adds types by adding them to `codecharta-core-api` and regenerating, never by hand. Drift check in CI is plan 01's.
- `DESKTOP_BRIDGE: InjectionToken<DesktopBridge | null>` (`null` in the web build), `DesktopEnvironment` (`isDesktop`, `requireBridge()`), `valueOrThrow` / `DesktopBridgeError` and the result envelope `{ ok: true; value } | { ok: false; error: { code, message } }` in `visualization/app/codeCharta/util/desktop/`. As built (plan 01, overview section 10): one generic `bridge.request("projects.list", params)`, no namespace groups.
- Fake: `createFakeDesktopBridge(seed?)` in `visualization/app/codeCharta/util/desktop/desktopBridge.mocks.ts` and `standInForTheDesktopBridge(page, seed)` in `visualization/app/playwright.helper.ts`, which injects `createFakeDesktopBridge.toString()` with `page.addInitScript`. The function must stay **self-contained** (no imports, no outside constants or helpers), so this plan's in-memory projects/snapshots backend (M2.9) is written inside its body, seeded through new optional `FakeDesktopSeed` fields (`projects`, `snapshots`, `activeProjectId`, `pickedFolders`, `now`; 03-M3 adds `pickedImportFile` and `snapshotMaps`). Plan 01's spec "should work when rebuilt from its own source text" must stay green.
- Shell (`visualization/electron/`, file layout per plan 01; this plan names `projectsShell.js` and `snapshotsShell.js` for the composed methods): the core client (`request(method, params)`), injectable dialog ports (open-folder, open-file, message box) and file reading, `app.relaunch()`, a reveal-in-explorer that resolves a `(projectId, folderId)` through the shell-only `projects.folderPath`, single-instance lock, `vscode:` in the allowed external protocols. Shell code is verified by plan 01's Playwright `_electron` smoke suite, not by Jest.

## Design

### 1. Decisions specific to this plan

1. **Paths never come from the renderer.** A folder or file enters the system only through a native dialog opened by the shell. The shell hands the path to a shell-only core method (`projects.inspectFolder`, `snapshots.inspectImportFile`), which answers with display data plus a short-lived opaque **pick token** held in the core. The renderer passes the token back; no renderer-callable method accepts a filesystem path. (Optional drag-and-drop, M6.5, treats the dropped path as untrusted and confirms through a native box.)
2. **Store ids are generated.** `projectId = "p-" + 16 hex`, `folderId = "f-" + 16 hex` from a random source. Snapshot ids follow section 5 of the decisions file and are built only from git output and hashes. Every id is a validated newtype (`^[a-z0-9-]{1,96}$`) rejected at deserialisation, and every resolved store path is checked to lie inside the store root.
3. **Switching snapshots is one atomic replace**, not `removeFiles` followed by a load (refines D6; reasons: the empty-list bug in `removeFilesFromState` and the deep clone of all loaded maps in `LoadFileService.loadFiles`).
4. **Project maps are marked on `FileMeta`** with an optional `projectSnapshot` field: the single signal for exclusion from IndexedDB, source-file lookup, scenario binding.
5. **Deleting a project, folder or snapshot sends its store directory to the OS recycle bin** (the core, through a `Recycler`). User folders are never touched.
6. **Opening a cc.json in desktop files it into a project** (owner decision); there is no loose-file mode (section 6).
7. **Map bytes never go through JSON-RPC.** The core answers `snapshots.mapLocation` (shell-only) with the map's file path; the shell checks the path is inside the store root and reads it in chunks for the renderer. Stored maps are always gzip, so even an 830 MB map is tens of MB. A stateless chunk call keeps peak copies small and needs no custom protocol (a `fetch` to a custom scheme would be blocked by the CSP, which has no `connect-src`). Source files work the same way through `projects.sourceFileLocation`.
8. **Library first, RPC second.** `codecharta-core` functions take paths and typed inputs; the JSON-RPC layer resolves tokens to paths and the CLI passes argv paths directly. Everything is therefore testable and scriptable without a UI.

### 2. Store layout (refines D5)

```
<storeRoot>/
  store.json                      { "schemaVersion": 1, "createdAt": "ISO" }
  session.json                    { "activeProjectId": "p-…" | null }
  .lock                           OS file lock held while a writing core process runs
  projects/<projectId>/
    project.json
    snapshots/<folderId>/
      <snapshotId>/ snapshot.json, map.cc.json.gz, run.log (analysed only)
      .incoming-<8hex>/           staging directory, renamed to <snapshotId> on commit
```

`project.json`:

```jsonc
{
  "schemaVersion": 1,
  "id": "p-3f9c2a7b1d4e5f60", "name": "CodeCharta", "description": "optional",
  "createdAt": "ISO", "updatedAt": "ISO",
  "folders": [{
    "id": "f-0a1b2c3d4e5f6071",
    "path": "C:\\src\\codecharta",          // absolute, always set
    "label": "codecharta",                   // unique in the project, shown in display names
    "role": "primary",                       // "primary" | "fork" | "helper"
    "kind": "git",                           // "git" | "plain"
    "git": {                                 // null for plain; facts cached at detectedAt
      "topLevel": "C:/src/codecharta", "isRepositoryRoot": true,
      "remotes": [{ "name": "origin", "url": "https://github.com/MaibornWolff/codecharta.git" }],
      "defaultBranch": "main", "rootCommits": ["<40-hex>"], "isShallow": false, "detectedAt": "ISO"
    },
    "addedAt": "ISO"
  }],
  "analysisProfile": { "exclude": [], "without": [], "parallel": true },
  "view": { "workingFolderId": "f-…", "shownSnapshotIdByFolder": { "f-…": "<snapshotId>" } }   // OD1: one working folder, null when the project has none
}
```

Rules
- **Schema and migration hook.** `STORE_SCHEMA_VERSION = 1` and an empty `MIGRATIONS` list. `Store::open` creates `store.json` in an empty root, runs pending migrations in order (rewriting `store.json` after each) and fails with `STORE_NEWER_SCHEMA` when the file's version is higher. `project.json` and `snapshot.json` carry their own `schemaVersion`; a reader that meets a higher one skips that project/snapshot and reports it in `ProjectSummary.problem` instead of failing the list.
- **Atomic writes.** `write_json_atomic`: write a temporary file in the same directory, `sync_all`, rename over the target; on a permission/sharing error (Windows antivirus or indexer) retry 5 times with 20 ms doubling back-off (named constants). `Store::open` deletes leftover temporary files and `.incoming-*` directories. A snapshot becomes visible only by renaming its staging directory.
- **Concurrency.** One app instance (plan 01). Inside the core every write holds a per-project mutex (`ProjectLocks`), so two requests never interleave on one `project.json`. A *writing* core process (`serve`, and CLI commands that write) takes an exclusive OS lock on `.lock`; a second writer fails with `STORE_LOCKED`. Read-only CLI commands (`projects list`, `snapshots list`) take no lock. The OS releases the lock when the process dies, so there is no stale-lock case.
- **Path safety.** `StorePaths` is the only module that builds store paths (`project_dir`, `project_file`, `folder_snapshots_dir`, `snapshot_dir`, `map_file`); each asserts the resolved path stays inside the store root. Source-file reads use `confine_to_folder(folder, relative)`: reject absolute paths and `..` segments, canonicalise, then compare against the canonicalised folder to defeat symlinks leaving it.
- **Folder status is derived, not stored**: `ok` (directory exists) or `missing`. Git facts are refreshed when a project is opened and on `projects.refreshFolder`; a failed refresh keeps the cached facts.
- **Relationships are derived** from cached git facts on every read: for folders A ≠ B, `forkOf` when a non-`origin` remote URL of B equals A's `origin` URL after normalisation (strip `.git`, trailing `/`, credentials, lowercase host; `git@host:owner/repo` equals `https://host/owner/repo`); otherwise `sharesHistoryWith` when the `rootCommits` sets intersect and neither is shallow; otherwise `sameRemote` when the `origin` URLs are equal.

Git commands (through `GitRunner`, `cwd` = folder path, 15 s timeout; every user-derived value is validated hex or a generated id first, so none starts with `-`): `rev-parse --show-toplevel`; `rev-parse --is-shallow-repository`; `config --get-regexp ^remote\..*\.url$` (strip credentials from each URL **before** caching or returning it); `symbolic-ref --quiet --short refs/remotes/origin/HEAD` minus the `origin/` prefix (fallback `rev-parse --abbrev-ref HEAD`, a guess; output `HEAD` means none); `rev-list --max-parents=0 HEAD`; `rev-parse --verify --quiet <hash>^{commit}`; `show -s --format=%H%x00%h%x00%s%x00%an%x00%aI%x00%cI%x00%P <sha>`. `kind` is `git` when `--show-toplevel` exits 0; `is_repository_root` compares the top level with the folder path after canonicalisation (case-insensitive on Windows; crate candidate `dunce` to avoid `\\?\` prefixes). A folder inside a repository but not at its root is `git` with `is_repository_root: false`; the UI shows "git history metrics need the repository root". When git is not installed every folder is `plain`.

Snapshot record additions (refines section 5 of the decisions file): imported snapshots have `"source": "imported"`, `"analysis": null`, `"git": null` unless bound to a commit, and `"imported": { "at": "ISO", "originalFileName": "…", "fileModifiedAt": "ISO", "contentSha256": "<64 hex>" }`. The analysis time of an imported map is **unknown** and never guessed: `imported.at` is the import time, `fileModifiedAt` is the file's mtime, shown only as a hint labelled "file date". `map.checksum` and `map.rootName` are `null` until the renderer has parsed the map once and reported them (`snapshots.recordMapFacts`), because the core never parses a map. `contentSha256` is the SHA-256 of the **uncompressed** content (streamed through a gzip decoder when the source is gzip), so a `.cc.json` and its `.cc.json.gz` are the same content. Imported ids: `<fullSha>-imported-<8hex>` when bound to a commit, else `imported-<16hex>`, the hex being the first digits of `contentSha256`. Duplicate detection does not rely on the id (moving or binding changes it): before importing, the core searches every folder of the target project for an imported snapshot with the same `contentSha256` and returns that one instead.

### 3. Core: modules, types, methods, CLI

Modules in `core/crates/codecharta-core/src/` (no function bodies here; signatures are the contract between this plan's tasks):

| Module | Holds |
| --- | --- |
| `ids.rs` | `new_project_id()`, `new_folder_id()`, `new_token()`, `imported_snapshot_id(sha256: &str, commit: Option<&FullCommit>) -> SnapshotId` |
| `store/mod.rs` | `Store`, `Store::open(root: &Path) -> Result<Store, CoreError>` (writing: lock, create, sweep, migrate), `Store::open_read_only`, `Store::session()`, `STORE_SCHEMA_VERSION`, `Migration { to_version: u32, migrate: fn(&Path) -> Result<(), CoreError> }`, `MIGRATIONS` (as built in 03-M1; the leftover sweep is in `store/sweep.rs`) |
| `store/state.rs` | `StoreState::{Open, Unavailable}` held by `Core` (`Core::open_store`, `Core::store()`, `Core::store_status()`); the degraded `serve` start |
| `store/paths.rs` | `StorePaths`, `confine_to_folder(folder: &Path, relative: &str) -> Result<PathBuf, CoreError>` |
| `store/atomic.rs` | `read_json<T: DeserializeOwned>(path: &Path) -> Result<T, CoreError>`, `write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), CoreError>`, `ProjectLocks` |
| `store/lock.rs` | `StoreLock::acquire(root: &Path) -> Result<StoreLock, CoreError>` (released on drop) |
| `store/session.rs` | `SessionRepository::{active_project, set_active_project}` |
| `store/root_change.rs` | `change_store_root(current: &Path, target: &Path) -> Result<StoreRootChange, CoreError>` (adopt an existing store, copy into an empty folder without `.lock`, else `BAD_REQUEST`) |
| `recycle.rs` | `trait Recycler { fn recycle(&self, path: &Path) -> Result<(), CoreError>; }`, `SystemRecycler` (crate candidate `trash`) |
| `git/runner.rs` | `trait GitRunner { fn run(&self, cwd: &Path, args: &[&str]) -> GitFuture }` (boxed future of `CoreResult<GitOutput { exit_code, stdout }>`), implemented by `Tools`; `GIT_TIMEOUT` (as built in 03-M2) |
| `folders/inspector.rs` | `async inspect_folder(git: &dyn GitRunner, path: &Path) -> FolderInspection`, `resolve_commit(git: &dyn GitRunner, folder: &Path, hash: &CommitHash) -> Result<Option<ResolvedCommit>, CoreError>`, `commit_details(..) -> CoreResult<Option<CommitDetails { resolved, commit_date, parents }>>` (03-M3, for binding) |
| `folders/relationships.rs` | pure: `normalise_remote_url(url: &str) -> String`, `derive_relationships(folders: &[ProjectFolder]) -> BTreeMap<FolderId, Vec<FolderRelationship>>` |
| `projects/repository.rs` | `ProjectRepository` (CRUD, folder operations, derived status, `resolve_folder(&FolderRef) -> Result<ResolvedFolder, CoreError>` with `path`, `kind`, `status` — offered to plans 04/05/06) |
| `projects/tokens.rs` | `PickTokens::{issue_folder, issue_file, take_folder, take_folders, take_file, give_back, settle}` (in-memory, 32 hex, 15-minute lifetime as a named constant; taken before a use and given back when the use fails, so consumed on first successful use) |
| `projects/{record,derived,folders,folder_operations,active,source_files}.rs` | as built in 03-M2: `ProjectRecord` (stored), derived fields, `FolderToAdd`/`attach_folder`, the folder operations, active project and `pick_folder`, `source_file_location` |
| `snapshots/repository.rs` | `SnapshotRepository` (list, map location, delete, record facts, begin/commit/abort, find by commit) |
| `snapshots/record.rs` | `SnapshotRecord` (the full `snapshot.json` of section 5 of the decisions file; plan 05 fills the `analysis`/`hosting` parts) |
| `snapshots/content.rs` | `ImportFile` (open a regular file, gzip detection, content hash, gzip copy), `commit_hint_of` (03-M3 split it out of `import.rs`) |
| `snapshots/import.rs` | `inspect_import_file`, `import_file`, bind to commit, duplicate and existing-target lookup (methods of `SnapshotRepository`); `open_file` and `move_snapshot` are in `snapshots/open_file.rs` and `snapshots/move_snapshot.rs` (03-M3) |

Types in `core/crates/codecharta-core-api/src/{error,store,projects,snapshots,shell}.rs`. Every type derives `Serialize, Deserialize, Clone, Debug, PartialEq` and `ts_rs::TS` (UNVERIFIED tool), uses `#[serde(rename_all = "camelCase")]`; request types add `#[serde(deny_unknown_fields)]`; unit enums serialise lowercase. Timestamps are ISO-8601 UTC strings. Validated newtypes use `#[serde(try_from = "String")]`, so an invalid value is a `BAD_REQUEST` before any handler runs.

```rust
// error.rs — appended to plan 01's ErrorCode (serialised SCREAMING_SNAKE_CASE, stable)
TokenExpired, DuplicateFolder, DuplicateLabel, FolderUnavailable, NotACommit,
DifferentHistory, StoreLocked, StoreNewerSchema, TooLarge      // 03-M1 appended StoreNewerSchema, StoreLocked; 03-M2 TokenExpired, DuplicateFolder, DuplicateLabel, FolderUnavailable, DifferentHistory, TooLarge; NotACommit is 03-M3's
pub enum StoreProblemCode { StoreLocked, StoreNewerSchema, Io }   // methods/store.rs; plan 01's IO code is `IO`
// ids.rs — ProjectId, FolderId, SnapshotId (03-M1); the other newtypes join with their first user

// newtypes: ProjectId, FolderId, SnapshotId  (^[a-z0-9-]{1,96}$);  CommitHash (^[0-9a-f]{7,40}$);
// FullCommit (^[0-9a-f]{40}$);  PickToken (32 hex);  Label (1–60 chars, none of / \ : or control characters);
// ProjectName (1–80);  Description (≤ 500)
pub enum FolderRole { Primary, Fork, Helper }
pub enum FolderKind { Git, Plain }
pub enum FolderStatus { Ok, Missing }
pub enum AnalyserName { Rawtextparser, Unifiedparser, Dependencyparser, Domainlanguageparser, Git, Svn }
pub enum RelationshipKind { ForkOf, SharesHistoryWith, SameRemote }

pub struct GitRemote { name: String, url: String }
pub struct FolderGitFacts { top_level: String, is_repository_root: bool, remotes: Vec<GitRemote>,
    default_branch: Option<String>, root_commits: Vec<FullCommit>, is_shallow: bool, detected_at: String }
pub struct FolderRelationship { kind: RelationshipKind, folder_id: FolderId }
pub struct ProjectFolder { id: FolderId, path: String, label: Label, role: FolderRole, kind: FolderKind,
    git: Option<FolderGitFacts>, added_at: String,
    status: FolderStatus, relationships: Vec<FolderRelationship>, snapshot_count: u32 }   // last three derived
pub struct AnalysisProfile { exclude: Vec<String> /* ≤ 50 × ≤ 200 chars, no line breaks */, without: Vec<AnalyserName>, parallel: bool }
pub struct ProjectView { working_folder_id: Option<FolderId>, shown_snapshot_id_by_folder: BTreeMap<FolderId, SnapshotId> }   // OD1
pub struct Project { id: ProjectId, name: ProjectName, description: Option<Description>, created_at: String, updated_at: String,
    folders: Vec<ProjectFolder>, analysis_profile: AnalysisProfile, view: ProjectView }
pub struct ProjectSummary { id: ProjectId, name: String, folder_count: u32, missing_folder_count: u32, snapshot_count: u32, problem: Option<String> }

pub struct PickedFolder { pick_token: PickToken, path: String, suggested_label: String, kind: FolderKind, git: Option<FolderGitFacts> }
pub struct NewFolder { pick_token: PickToken, label: Label, role: FolderRole }
pub struct FolderRef { project_id: ProjectId, folder_id: FolderId }
pub struct SnapshotRef { project_id: ProjectId, folder_id: FolderId, snapshot_id: SnapshotId }
pub struct SnapshotSummary { r#ref: SnapshotRef, source: SnapshotSource /* Analysed | Imported */, created_at: String,
    commit: Option<FullCommit>, short_commit: Option<String>, subject: Option<String>, commit_date: Option<String>, dirty: bool,
    original_file_name: Option<String>, file_modified_at: Option<String>,   // imported only; a hint, not the analysis time
    map_bytes: u64, checksum: Option<String>, profile_hash: Option<String> }
pub struct ResolvedCommit { commit: FullCommit, short_commit: String, subject: String, author_name: String, author_date: String }
pub struct CommitHint { hash: CommitHash }   // from the file name only: ^([0-9a-f]{7,40})\. as `ccsh analyse --commit` writes it
pub struct ContainingFolder { pick_token: PickToken, path: String, suggested_name: String, kind: FolderKind, git: Option<FolderGitFacts> }
pub struct ExistingTarget { project_id: ProjectId, project_name: String, folder_id: FolderId }
pub struct PickedImportFile { import_token: PickToken, file_name: String, size_bytes: u64, file_modified_at: String,
    commit_hint: Option<CommitHint>, containing_folder: ContainingFolder,
    hint_commit: Option<ResolvedCommit>,            // hint resolved in the containing folder when it is git
    existing_target: Option<ExistingTarget>,        // a project that already has this folder (most recently updated if several)
    duplicate_of: Option<SnapshotRef> }             // same contentSha256 already imported into existing_target's project
pub struct OpenedFile { project: Project, snapshot: SnapshotSummary, created_project: bool, was_already_imported: bool }
pub struct StoreStatus { problem: Option<StoreProblemCode> }
pub struct StoreRootChange { store_root: String, adopted: bool }

// shell-composed results: declared by hand in visualization/app/codeCharta/util/desktop/desktopBridge.ts, not in codecharta-core-api (03-M2 part B)
interface MapChunk { bytes: Uint8Array, offset: number, totalBytes: number }
interface SourceFileBytes { bytes: Uint8Array }
pub struct MapLocation { path: String }                                   // shell-only result of snapshots.mapLocation
pub struct SourceFileLocation { path: String, folder_root: String, size_bytes: u64 }
```

JSON-RPC methods (params → result; `ok` types are the success payload; failures are `CoreError` with the codes above). **Shell-only** methods are never relayed from the renderer; **shell** methods are composed in the shell and appear in the bridge like the others.

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `projects.list` | — | `ProjectList { projects: ProjectSummary[] }` | named wrapper: the contract export only names struct types (03-M2) |
| `projects.get` | `{ projectId }` | `Project` | refreshes git facts and derived fields |
| `projects.inspectFolder` | `{ path }` | `PickedFolder` | shell-only; issues the pick token |
| `projects.pickFolder` | `{ title }` | `PickedFolder \| null` | shell: native folder dialog (title from the caller) → `projects.inspectFolder`; `null` = cancelled |
| `projects.create` | `{ name, description?, folders: NewFolder[] }` | `Project` | |
| `projects.update` | `{ projectId, name?, description?, analysisProfile? }` | `Project` | |
| `projects.delete` | `{ projectId, permanently }` | void | recycle bin unless `permanently` |
| `projects.addFolder` | `{ projectId, folder: NewFolder }` | `Project` | |
| `projects.updateFolder` | `FolderRef & { label?, role? }` | `Project` | |
| `projects.removeFolder` | `FolderRef & { permanently }` | `Project` | recycles the folder's snapshot directory |
| `projects.relinkFolder` | `FolderRef & { pickToken, acceptDifferentHistory? }` | `Project` | |
| `projects.refreshFolder` | `FolderRef` | `Project` | |
| `projects.getActive` / `projects.setActive` | — / `{ projectId \| null }` | `{ activeProjectId }` / void | `session.json` |
| `projects.setView` | `{ projectId, view }` | void | |
| `projects.resolveCommit` | `FolderRef & { hash }` | `ResolveCommitResult { commit: ResolvedCommit \| null }` | `FOLDER_UNAVAILABLE` outside an `ok` git folder |
| `projects.folderPath` | `FolderRef` | `{ path }` | shell-only; for reveal-in-explorer |
| `projects.sourceFileLocation` | `FolderRef & { relativePath }` | `SourceFileLookup { location: SourceFileLocation \| null }` | shell-only; folder `ok`, `confine_to_folder`, ≤ 16 MiB else `TOO_LARGE`; `null` when absent; reads the **working tree**, not the snapshot's commit (plan 04) |
| `projects.readSourceFile` | `FolderRef & { relativePath }` | `SourceFileBytes \| null` | shell: asks `sourceFileLocation`, checks the realpath is inside the realpath of `folder_root`, reads at most `sizeBytes` |
| `projects.revealFolder` | `FolderRef` | `null` | shell: `projects.folderPath` → open the folder in the file manager |
| `snapshots.list` | `FolderRef` | `SnapshotList { snapshots: SnapshotSummary[] }` | newest first by `createdAt`; named wrapper (03-M3, like `ProjectList`) |
| `snapshots.mapLocation` | `SnapshotRef` | `MapLocation` | shell-only; `shell.resolvePath` with a `snapshotMap` target answers the same path (03-M3) |
| `snapshots.readMapChunk` | `SnapshotRef & { offset, length }` | `MapChunk` | shell: `mapLocation` and `paths.get`, the map's realpath inside the store root's realpath and ending in `.cc.json[.gz]`, `read(length at offset)` per call (`offset` a whole number ≤ the map size, `length` 1 to 32 MiB, else `BAD_REQUEST`); the renderer allocates one `Uint8Array(totalBytes)` after the first chunk and fills it with 16 MiB chunks |
| `snapshots.recordMapFacts` | `SnapshotRef & { checksum, rootName }` | void | `checksum`: `MapChecksum` (1–128 ASCII letters/digits), `rootName`: `RootName` (1–255, no `/`) |
| `snapshots.inspectImportFile` | `{ path }` | `PickedImportFile` | shell-only |
| `snapshots.pickImportFile` | `{ title, filters? }` | `PickedImportFile \| null` | shell: native open-file dialog with the caller's title and filters (Electron takes extensions without dots, so the renderer passes `json`, `gz`) → `inspectImportFile` |
| `snapshots.openFile` | `{ importToken, target: FolderRef \| null, bindToCommit: FullCommit \| null }` | `OpenedFile` | section 6 |
| `snapshots.import` | `FolderRef & { importToken, bindToCommit }` | `SnapshotSummary` | |
| `snapshots.move` | `SnapshotRef & { toFolderId, bindToCommit }` | `SnapshotSummary` | imported snapshots only |
| `snapshots.delete` | `SnapshotRef & { permanently }` | void | |
| `store.status` | — | `StoreStatus` | problem `Store::open` reported at startup |
| `store.changeRoot` | `{ path }` | `StoreRootChange` | shell-only |
| `store.chooseRoot` | — | `StoreRootChange \| null` | shell: native folder dialog → `store.changeRoot` → `app.relaunch()` |

This plan adds **no notifications**: the store has a single writing process, so nothing changes behind the renderer's back.

Behaviour rules
- `serve` starts even when the store cannot open: every store-dependent method then answers the startup problem's code, and `store.status` reports it.
- `create` / `addFolder`: reject a path already in the project (`DUPLICATE_FOLDER`, compared canonicalised, case-insensitive on Windows) and a duplicate label (`DUPLICATE_LABEL`, case-insensitive). The first folder is forced to `primary`; making another folder `primary` demotes the old one to `helper`. A consumed or expired pick token answers `TOKEN_EXPIRED`.
- `relinkFolder`: when old and new folder both have `root_commits` and the sets do not intersect, answer `DIFFERENT_HISTORY` unless `acceptDifferentHistory`. Snapshots stay attached to the folder id.
- Deletions: `Recycler::recycle` on the directory, then update `project.json`. If recycling fails, answer `IO_ERROR`; the renderer then offers "Delete permanently" after a second confirmation, repeating the call with `permanently: true` (`remove_dir_all`, still confined by `StorePaths`).
- `inspectImportFile`: refuses a non-regular file; `file_modified_at` = mtime; streams `contentSha256`; inspects the **containing folder** like `inspectFolder` (issuing a pick token); takes `commit_hint` from the file name only (the cc.json `meta.commitHash` is not used — ccsh 2.4.0 does not write it); resolves the hint in the containing folder when it is git; looks up `existing_target` (a project folder whose path equals the containing folder) and `duplicate_of`.
- `openFile` (section 6): `target: null` → reuse `existing_target` or create a project named after the containing folder with that folder as its only (`primary`) folder; then the same steps as `import`. A duplicate returns the existing snapshot with `was_already_imported: true` and writes nothing.
- `import`: copies the file into a staging directory — gzip-compressing unless it starts with the gzip magic bytes — writes `snapshot.json`, renames the directory. With `bindToCommit` the core re-verifies the commit in the folder (`NOT_A_COMMIT`, or `FOLDER_UNAVAILABLE` when the folder is not an `ok` git folder) and fills `git.commit`, `shortCommit`, `subject`, `authorName`, `authorDate`, `commitDate`, `parents`, `dirty: false`, `remotes`; the other `git` fields are left empty (`branchesAtRun: []`, `tagsAtRun: []`, `headAtRun: null`).
- `move`: imported snapshots only (`BAD_REQUEST` otherwise); target folder in the same project. With `bindToCommit` the commit is verified in the **target** folder. The new id is computed, `snapshot.json` rewritten atomically with the new id/folder/`git` block, then the directory renamed `snapshots/<from>/<old>` → `snapshots/<to>/<new>` (`Store::open` repairs a record whose `id`/`folderId` disagree with its directory after a crash in between). `toFolderId` equal to the current folder with a `bindToCommit` = "bind later". `view.shownSnapshotIdByFolder` entries pointing at the old id are updated.
- `store.changeRoot`: adopt the target when it contains `store.json`; copy the current store into it when it is empty; otherwise `BAD_REQUEST` ("Choose an empty folder or an existing CodeCharta store"). Then update the core settings; the shell relaunches the app. The old folder is left untouched (owner default: copy, do not move).

Offered to plan 05 (library, `snapshots/repository.rs`):

```rust
impl SnapshotRepository {
    pub fn begin_snapshot(&self, folder: &FolderRef) -> Result<StagedSnapshot, CoreError>;     // staging dir, map path, log path
    pub fn commit_snapshot(&self, staged: StagedSnapshot, record: SnapshotRecord) -> Result<SnapshotSummary, CoreError>; // validates record.id, renames
    pub fn abort_snapshot(&self, staged: StagedSnapshot) -> Result<(), CoreError>;
    pub fn find_by_commit(&self, folder: &FolderRef, commit: &FullCommit) -> Result<Vec<SnapshotSummary>, CoreError>;
}
```

CLI (`codecharta-cored/src/cli/projects.rs`, `cli/snapshots.rs`; calls the library directly with argv paths, no tokens; global `--data-dir <dir>` (the store is `<dataDir>/store` unless a store root is set) and `--json` per command; exit 0 ok, 1 `CoreError`, 2 usage):

```
codecharta-core projects list
codecharta-core projects create --name <n> [--description <d>] --folder <path>[=<label>[:<role>]] …
codecharta-core projects add-folder --project <id> --path <dir> [--label <l>] [--role primary|fork|helper]
codecharta-core snapshots list --project <id> --folder <id>
codecharta-core snapshots import --project <id> --folder <id> --file <cc.json[.gz]> [--bind-to-commit <sha>]
```

### 4. Renderer: model and load path

`visualization/app/codeCharta/model/projectSnapshot.model.ts` (new, kernel):

```ts
export interface ProjectSnapshotOrigin { projectId: string; folderId: string; snapshotId: string; folderLabel: string }
```

- `FileMeta` gains `projectSnapshot?: ProjectSnapshotOrigin`; `NameDataPair` gains the same optional field; `mapCcJson2ToCCFile` copies it only when present (never as `undefined`/`{}` — LENS_DATA_RULES rule 2).
- `FilesLoadedSource` gains `"project"`.
- New `stores/fileStore/loaders/ccJson/util/rootName.ts`: `withRootName(content, rootName): { content; originalRootName }`. For cc.json 2.x it sets `content.files[0].name`. For 1.x it renames `nodes[0]` and rewrites the `/<old>` prefix of `edges[].fromNodeName`/`toNodeName`, `blacklist[].path`, `markedPackages[].path`. Exported through `fileStore.facade.ts` with the constant `PROJECT_ROOT_NAME = "root"`.
- `LoadFileService.loadFiles(nameDataPairs, options: { replaceLoadedFiles?: boolean } = {})`: with the flag the working list starts as `[]` instead of `clone(this.filesRepo.getFiles())`. A failed load still throws before `setFiles`, so the previous map stays.
- `indexedDBWriter.ts`: new module-private `persistableFiles(files) = files.filter(fileState => !fileState.file.fileMeta.projectSnapshot)`, applied in `isFilesWriteDue`, `writeCcFiles` and the files branch of `writeCcState` (one function for all three — LENS_DATA_RULES rule 2). `isFilesWriteDue` additionally returns `false` when nothing is persistable and nothing is persisted, so a project load neither writes an empty record nor raises the save spinner. `SaveCcStateEffect` needs no change. A session saved before the upgrade is overwritten with `[]` on the first project load, which frees the old maps.

`LoadFilesUseCase` additions (types exported from `load.facade.ts`):

```ts
export interface ProjectSnapshotToLoad { origin: ProjectSnapshotOrigin; displayName: string; readBytes: () => Promise<Uint8Array> }
export interface LoadedSnapshotFacts { origin: ProjectSnapshotOrigin; checksum: string; rootName: string }
export interface ProjectSnapshotsLoadResult {
    loaded: LoadedSnapshotFacts[]
    identicalContent: { kept: ProjectSnapshotOrigin; dropped: ProjectSnapshotOrigin }[]
    unreadable: ProjectSnapshotOrigin[]
}
loadProjectSnapshots(snapshots: ProjectSnapshotToLoad[], options?: { discardMetricSelection?: boolean }): Promise<ProjectSnapshotsLoadResult>
bootFromProject(resolveSnapshots: () => Promise<ProjectSnapshotToLoad[]>): Promise<ProjectSnapshotsLoadResult>
showSampleFiles(): void
unloadAllFiles(): void
```

`loadProjectSnapshots` steps: dispatch `setIsLoadingFile(true)`; for each snapshot **sequentially** set the phase with `describeFileBeingRead`, `readBytes()`, `parseCcFileBytes`, `null` → `unreadable`; `withRootName(content, PROJECT_ROOT_NAME)`; group by `getContentChecksum` — the first of each group is kept, the others go to `identicalContent`; build `NameDataPair { fileName: displayName, fileSize: bytes.byteLength, content, projectSnapshot: origin }`; if nothing is left clear the indicator and phase and return; set phase "Building the map", `await nextPaint()`, then `commit(pairs, provenance("project", …), { replaceLoadedFiles: true })` — no `await` inside `commit`. `provenance()` gets an explicit `forceDefaultMetrics` option (default `source === "reset"`), set from `discardMetricSelection`. All loaded files end up selected as `Partial` (existing behaviour); a caller that wants delta dispatches `setDelta` afterwards (plan 06).

`bootFromProject`: `setIsLoadingFile(true)`, phase "Restoring your session", `ccStatePersistence.read()`; on `persisted.error` open an error dialog titled "Saved settings could not be restored." and continue with defaults; otherwise apply `preferences`/`mapState`/`domainState` and collect `restoredSettings` + missing-property names exactly as `applySettingsAndFilesFromSavedState` does (extract that part into a private `applySavedSettingsUpFront(savedCcState)` first — a structural commit); persisted `files` are ignored. Then `resolveSnapshots()` and the same commit with `restoredSettings` and `forceAutoFit`. With no snapshots: apply the remaining slices through `applyAllSettings`, clear the indicator, return an empty result. `showSampleFiles()` wraps the private `loadSampleFiles(null, "sample")`. `unloadAllFiles()` dispatches `setFiles({ value: [] })` through `LoadInitialFileStore.setFiles` and clears the loading indicator.

Display names (D7), pure function in `features/projects/util/snapshotDisplayName.ts`:
- commit known: `<label>@<shortCommit>`, plus `+dirty` when `dirty`;
- no commit: `<label>@<originalFileName without .cc.json/.json/.gz>`, or `<label>@<createdAt as YYYY-MM-DD HH-mm>`;
- `/` and `\` are replaced by `-`; names within one load are made unique by appending ` (2)`, ` (3)` (two profiles of one commit) so `addFile`'s `_1` suffixing never triggers.

Identical checksums: `ProjectsService` shows a toast for each `identicalContent` entry — "`<kept>` and `<dropped>` have identical content: no differences" — and keeps a single map on screen.

### 5. Renderer: `features/projects`

```
visualization/app/codeCharta/features/projects/
  facade.ts
  services/projects.service.ts            signals + all bridge calls
  services/projectsBoot.service.ts        boot(), reloadAfterReset()
  services/snapshotBytes.ts               chunked read → Uint8Array
  services/linkedProjectFolders.ts        implements localSource's port
  stores/loadedMaps.read.store.ts         toSignal over FileStoreReadWindow.files$
  util/snapshotDisplayName.ts, util/folderRelationshipLabel.ts
  components/projectSwitcher/             cc-project-switcher
  components/projectFolderSelector/       cc-project-folder-selector
  components/projectHome/                 cc-project-home
  components/createProjectDialog/         cc-create-project-dialog
  components/folderListEditor/            cc-folder-list-editor (shared by create and manage)
  components/manageProjectDialog/         cc-manage-project-dialog
  components/openFileDialog/              cc-open-file-dialog (open / import a cc.json)
  components/moveSnapshotDialog/          cc-move-snapshot-dialog
  e2e/projects.e2e.ts, e2e/projects.po.ts
```

`ProjectsService` (`@Injectable({ providedIn: "root" })`, no NgRx); types come from the generated `model/coreApi/`:

```ts
readonly isDesktop: boolean                                  // bridge !== null
readonly projects: Signal<ProjectSummary[]>
readonly activeProject: Signal<Project | null>
readonly visibleFolders: Signal<ProjectFolder[]>             // from activeProject().view.visibleFolderIds
readonly activeFolder: Signal<ProjectFolder | null>          // visibleFolders()[0]; plans 04/05 read this
readonly snapshotsByFolder: Signal<Record<string, SnapshotSummary[]>>
readonly shownSnapshots: Signal<SnapshotSummary[]>           // what is on the map now
readonly storeProblem: Signal<StoreProblemCode | null>
readonly isBusy: Signal<boolean>

initialise(): Promise<void>                                  // list + getActive + get + snapshots of the active project
openProject(projectId: string | null): Promise<void>         // setActive, load its view or unload all
showFolders(folderIds: string[]): Promise<void>              // setView, load each folder's shown snapshot
showSnapshot(ref: SnapshotRef): Promise<void>                // remember per folder, reload (plans 04/05 call this)
showSnapshots(refs: SnapshotRef[]): Promise<ProjectSnapshotsLoadResult>   // plan 06: two snapshots, then setDelta
refreshSnapshots(folder: FolderRef): Promise<void>           // plan 05 calls this after a run
snapshotsToShow(): Promise<ProjectSnapshotToLoad[]>          // used by boot and reset
openFile(request): Promise<void>                             // openFile → openProject → showSnapshot (section 6)
createProject(...), updateProject(...), deleteProject(...), addFolder(...), updateFolder(...), removeFolder(...), relinkFolder(...), importSnapshot(...), moveSnapshot(...), deleteSnapshot(...)
```

What is persisted where: everything about projects, folders, the visible folders and the shown snapshot per folder lives in the core's store (`project.json.view`, `session.json`). The renderer persists nothing about projects — no `CcState` key, no IndexedDB, no localStorage. View settings (metrics, colours, exclusions) stay in IndexedDB record 1001 as today.

The snapshot a folder shows: `view.shownSnapshotIdByFolder[folderId]` when it still exists, else the newest snapshot (`createdAt`). Folders without snapshots are skipped. After each successful load the service calls `snapshots.recordMapFacts` for snapshots whose `checksum` was `null`.

UI placement
- `views/codeCharta.component.ts`: `ngOnInit` calls `projectsBoot.boot()` instead of `loadFilesUseCase.loadOnBoot()`. `boot()` delegates to `loadOnBoot()` unchanged when the bridge is absent **or** `QueryParamsService.hasFile()` is true (`?file=` keeps working for development and e2e); otherwise `projects.initialise()` then `loadFilesUseCase.bootFromProject(() => projects.snapshotsToShow())`. Template: `@if (showsProjectHome()) { <cc-project-home /> } @else { <router-outlet /> }`, where `showsProjectHome = isDesktop && no file loaded`.
- `features/navBar/components/navBar/navBar.component.html`, `navbar-start` after the divider: web (`!isDesktop`) unchanged; desktop: `<cc-project-switcher>`, then, only when a map is loaded: `<cc-delta-selector>` in delta state, else `<cc-project-folder-selector>` when a project is active, else `<cc-map-selector>` (sample maps). `navbar-center` (`<cc-view-switcher>`) is rendered only when a map is loaded.
- `cc-project-switcher`: daisy `dropdown` (same classes and `z-[70]` as the map selector). Trigger: project name or "No project". Content: project list (name, folder count, a warning icon when `missingFolderCount > 0`), then "New project…", "Open cc.json…", "Manage project…", "Close project". Keyboard: `Ctrl+O` (`Cmd+O` on macOS) triggers "Open cc.json…" in desktop only — grep `keydown` / `HostListener` in `app/` first and drop the shortcut if it collides. There is no application menu.
- `cc-project-folder-selector`: copy of the map selector's interaction — checkbox per folder with label, role badge, relationship hint ("fork of codecharta"), the shown snapshot's short commit, status icon; folders without snapshots are disabled with "no analysis yet"; "Apply" → `showFolders`. Two or more checked folders render side by side through the existing aggregation (each under a folder named by its display name); switching to Compare with two folders gives a delta because both roots are `root`.
- `cc-project-home` (fixed below the nav bar, `bg-base-100`): (a) store problem → message, "Open store folder", "Choose another location"; (b) no project → "New project…", "Open cc.json…", "Show sample maps" (`showSampleFiles()`), plus the list of existing projects; (c) active project without a loadable snapshot → folder table (label, path, kind, status, snapshot count) with "Import cc.json…" per folder. Plan 05 adds its "Analyse" action to this table.
- `cc-create-project-dialog` (native `<dialog class="modal">`): name, description, `cc-folder-list-editor` ("Add folder…" → `projects.pickFolder()`; per row: path, editable label, role select, kind badge, remotes, relationship hint, remove). The first folder defaults to `primary`; a later folder that shares history with the primary is pre-set to `fork`, others to `helper`. "Create" → `create` → `openProject`.
- `cc-manage-project-dialog`: tabs "General" (name, description), "Folders" (the editor plus "Re-link…" on missing rows, "Refresh"), "Analysis profile" (exclude patterns as a textarea, one per line; checkbox per analyser for `without`; "Run analysers in parallel"), "Snapshots" (per folder: list with delete; imported rows show the imported badge and "Move to folder…" / "Bind to commit…", which open `cc-move-snapshot-dialog`), "Delete project" (confirm dialog naming the snapshot count: "Moves the project and its N snapshots to the recycle bin. Your folders are not touched.").
- `cc-open-file-dialog`: opened after `snapshots.pickImportFile()`, in two modes. "Open cc.json…" (switcher, home (b), shortcut): target defaults to section 6's rule and is shown as one line ("New project **Downloads** with folder `C:\Users\…\Downloads`" or "Project **X**, folder **y**"), with "Change…" revealing a project/folder select. "Import cc.json…" (home (c), per folder): target fixed to that folder. Both show file name, size, the label **"Imported snapshot — analysis time unknown"**, "File date: `<fileModifiedAt>`" in muted text, and — when `hintCommit` is set — a checked option "Bind to commit `<short>` — `<subject>`"; when the hint exists but did not resolve (plain folder or unknown hash), "Look for commit `<hash>` in another folder…" (folder picker → add the folder to the project → `projects.resolveCommit`). A `duplicateOf` hit replaces the button text by "Show existing snapshot". Confirm → `ProjectsService.openFile` / `importSnapshot`.
- `cc-move-snapshot-dialog`: target folder select (folders of the project), a hash input prefilled from the file-name hint, "Check" → `projects.resolveCommit` on the target folder, shows subject or "not a commit of this folder"; confirm → `snapshots.move`.
- Store location: plan 01's desktop tools panel (`features/desktopTools`, row "Data folder: `<storeRoot>`" with "Show in file manager") gains "Change…" (→ `store.chooseRoot`, which relaunches on success) and, when the root is custom, "Use default" (→ `paths.resetStoreRoot`, then relaunch). No separate store-location component.
- `confirmResetMapDialog.component.ts`: replace `loadFilesUseCase.reloadAfterReset()` by `projectsBoot.reloadAfterReset()`, which calls the old method in the web build and `loadProjectSnapshots(await snapshotsToShow(), { discardMetricSelection: true })` in desktop (or `unloadAllFiles()` when there is nothing to show). The store is not touched by a reset.

Error and edge states
- Bridge call fails: toast with the message; signals keep their last good value.
- Active project no longer exists at boot: `setActive(null)`, show the home.
- Shown snapshot unreadable: toast "The analysis of `<label>` could not be read", fall back to the next newest; none left → home state (c).
- Folder `missing`: row badge "missing" + "Re-link…"; its snapshots still load (the store is the source of truth); source-file opening answers "folder not available".
- Closing a project or deleting the active one: `setActive(null)` then `unloadAllFiles()`.

Interplay with existing features

**localSource.** New port in `features/localSource/services/linkedSourceFolders.ts`, exported from its `facade.ts`:

```ts
export interface LinkedSourceFolder { rootPath: string; readFile(relativePath: string): Promise<File | null> }
export interface LinkedSourceFolders { folderOf(fileMeta: FileMeta): LinkedSourceFolder | null }
export const LINKED_SOURCE_FOLDERS = new InjectionToken<LinkedSourceFolders>("LINKED_SOURCE_FOLDERS", {
    providedIn: "root", factory: () => ({ folderOf: () => null })
})
```

`LocalSourceService` changes: `MapLocation` carries the `fileMeta`; `findSource` and `editorTargetOf` ask the port first. A linked folder answers `found` (with `folder: { mapKey, directory: null, editorRootPath: rootPath }`) or `notFound` — never `folderNeeded`, so the File System Access picker is never shown for a project map. `editorTargetOf` returns `rootPath` as `editorRootPath`. `LocalSourceAvailability.isAvailable` becomes true when the visible map has a linked folder, regardless of the experimental preference. `folderChoiceToast.ts` is unaffected. `features/projects/services/linkedProjectFolders.ts` implements the port (folder must be `ok`; `readFile` → `projects.readSourceFile` → `new File([bytes], baseName)`) and is provided in `visualization/app/app.config.ts` via `provideLinkedProjectFolders()` from the projects facade. The web path (default factory) is byte-for-byte today's behaviour.

**Scenarios.** Binding key = the folder label for project maps, the file name otherwise. New `features/scenarios/util/mapBindingKey.ts`: `mapBindingKeyOf(fileMeta) = fileMeta.projectSnapshot?.folderLabel ?? fileMeta.fileName`, used in `saveScenarioDialog.component.ts` and wherever the visible-name `Set` for `ScenarioViewModelService` is built. A scenario bound to `codecharta` then applies to every commit of that folder. Renaming a folder label unbinds its scenarios (shown as the existing map-mismatch badge). `Scenario.mapFileNames` and the `.ccscenario` schema do not change.

**Multi-map aggregation and delta.** Covered by root-name normalisation and unique slash-free display names. No change to `AggregationGenerator` or `DeltaGenerator`.

**Sample files, `?file=`, upload.** Desktop boots into the project path and never loads samples on its own; they are one click away on the home. `?file=` behaves as today in both builds. `UploadFilesService` and `cc-nav-bar-folder-button` remain and are rendered in the web build only.

### 6. Opening a cc.json file (owner decision)

1. **Pick.** "Open cc.json…" → `snapshots.pickImportFile()` (native dialog in the shell). Optional drag-and-drop (M6.5) arrives at the same point.
2. **Target.** The containing folder of the file decides the project:
   - a project already has a folder with that path → reuse it (the most recently updated one if several; the dialog lets the user pick another project/folder);
   - otherwise create a project whose **name** is the folder's base name (`C:\work\billing\out` → "out") and whose only folder is the containing folder (`primary`, label = base name, `kind` from inspection). The project name is stored independently of the folder; renaming the project never touches the folder, and renaming the folder on disk never renames the project.
3. **Not a source folder.** When the containing folder is not a repository and holds no sources (Downloads, a share, a temp folder) it is still registered, as a `plain` folder — there is no "detached" state. The project home and the manage dialog show a hint on that row: "Imported maps only. Add the repository folder and move the snapshot to it." The user adds the real repository with "Add folder…" (it becomes `primary`; the plain folder is demoted to `helper`) and uses "Move to folder…" on the snapshot, optionally binding it to a commit of the new folder. The now empty plain folder can be removed (its store directory is empty, so nothing goes to the recycle bin).
4. **Capture time unknown.** An imported snapshot records no analysis time. Everywhere it appears (folder selector, snapshot lists, nav bar tooltip) it is labelled "Imported snapshot — analysis time unknown"; the file's modified time is shown only as "File date: …". Sorting "newest first" uses the import time (`createdAt`) and the UI says so in the list header tooltip. `commit` is shown as "unknown" unless bound.
5. **Binding to a commit.** Only offered when the file name starts with a short hash as `ccsh analyse --commit` writes it **and** `rev-parse --verify --quiet <hash>^{commit}` succeeds in the target folder (the containing folder, or a folder the user picks through "Look for commit … in another folder…", which is added to the project first). Binding is the user's choice (checked by default when resolved). Without a binding `git` stays `null`; plan 05 treats such snapshots as "imported, commit unknown". Binding later is "Bind to commit…" (`snapshots.move` to the same folder).
6. **No duplicates.** Re-opening a file whose uncompressed content has the same SHA-256 as an imported snapshot anywhere in the target project shows that snapshot and writes nothing (also after it was moved or bound). The same content opened from a folder that belongs to a *different* project is imported again into that project — snapshots are per project by design.
7. **Show.** `openProject(project.id)` then `showSnapshot(ref)`; the folder selector shows the imported snapshot's folder.

## Milestones

Quality gates. Core work (M1–M3): from `core/`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`. Angular work (M4–M7): root `npm run format:check`; in `visualization/`: `npm test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, and `npm run build && npm run e2e:ci` when UI flows changed. Tests are written first; Rust test functions are named `should_<behaviour>` in snake case with `// Arrange`, `// Act`, `// Assert` comments; Jest test names start with "should". Unit tests sit next to the code (`#[cfg(test)]`); integration tests live in `core/crates/codecharta-core/tests/` and use temporary real git repositories (the fixture of M2.2) and `tempfile` store roots. Task names listed after "Tests:" are the behaviours to cover.

Working notes: one short file per milestone in `dev_docs/Studio/agents/progress/03-M<n>-<slug>.md` (state, decisions, deviations, spike results), committed with the milestone. Do not write into the repository's `plans/` folder and do not rely on `.claude/` or local agent memory.

### M0 — Spikes (S)

No production code; record results in `dev_docs/Studio/agents/progress/03-M0-spikes.md`.

1. On top of plan 01's shell, return a 64 MiB `Uint8Array` from an `ipcMain.handle` and time it; confirm the renderer receives a `Uint8Array`. Decides the chunk size (default 16 MiB).
2. With maps loaded, dispatch `setFiles({ value: [] })` while `<router-outlet>` is swapped for a placeholder, then load again; watch the console in all three views. If it throws, `unloadAllFiles()` is replaced by `setActive(null)` + `window.location.reload()` (boot shows the home).
3. In a scratch Rust test on Windows: the `trash` crate on a directory under `%APPDATA%`; `std::fs::rename` over an existing file while Explorer previews it; the exclusive-lock crate (two processes); the seven git commands of section 2 against a normal clone, a shallow clone, a subfolder and a non-repo; `ts-rs` output for `#[ts(type = "Uint8Array")]` and validated newtypes.
4. Drag a `.cc.json` file onto the window: in the preload, `webUtils.getPathForFile(file)` returns its absolute path. If unavailable from the sandboxed preload, M6.5 is dropped.

### M1 — Store core (M)

All in `codecharta-core`, commit scope `core`.

1. `ids.rs`, `store/paths.rs`, validated newtypes in `codecharta-core-api`. Tests: should reject an id with a path separator; should reject a resolved path outside the store root; should accept a generated id; should refuse a relative path containing `..`; should refuse a symlink that leaves the folder. Commit: `feat(core): add confined store paths and generated ids`
2. `store/atomic.rs`. Tests: should leave the old file intact when the write fails before rename; should retry a rename that fails with a sharing error (injected); should run writes of one project in order. Commit: `feat(core): add atomic json writes for the store`
3. `store/mod.rs` (`Store::open`, migrations, leftover sweep). Tests: should create store.json in an empty root; should run pending migrations in order; should fail with STORE_NEWER_SCHEMA for a newer store; should delete leftover temporary files and staging directories. Commit: `feat(core): open the managed store with a schema version`
4. `store/lock.rs`. Tests (two processes via the test binary): should fail with STORE_LOCKED while another process holds the lock; should acquire the lock once the holder exited; should not lock for a read-only open. Commit: `feat(core): lock the managed store per writing process`
5. `store/session.rs`. Tests: should return no active project for a new store; should persist the active project id. Commit: `feat(core): persist the active project in the store`
6. `store.status` and degraded `serve` start (store problem answered by store methods) in `codecharta-cored`. Tests (`codecharta-cored/tests/`, binary over stdio): should answer store.status with null for a healthy store; should report STORE_NEWER_SCHEMA and still answer paths.get. Commit: `feat(core): report store problems over json-rpc`

Acceptance: `cargo test` green; starting the app creates `store.json` and `.lock` under `%APPDATA%\codecharta-visualization\store`.

### M2 — Projects: core, RPC, CLI, shell, fake (L)

1. `folders/relationships.rs` (pure). Tests: should treat ssh and https urls of one repository as equal; should report fork_of when a non-origin remote matches the other origin; should report shares_history_with for intersecting root commits; should report nothing for shallow clones without matching remotes. Commit: `feat(core): derive relationships between project folders`
2. `core/crates/codecharta-core/tests/support/git_fixture.rs` (`TempRepo`, overview section 10) — temporary git repositories with a hermetic environment (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` → empty file, `GIT_CONFIG_NOSYSTEM=1`, `HOME`/`USERPROFILE` = temp dir, fixed author/committer names and dates, `-c init.defaultBranch=main -c commit.gpgsign=false -c core.autocrlf=false`) with `create()`, `commit(message, files)`, `add_remote(name, url)`, `clone_shallow()`; plan 04 extends it. Then `folders/inspector.rs`. Tests: should strip credentials from a remote url; should report no default branch when origin/HEAD is unset and HEAD has no commits; should classify a repository root as git; should flag a subfolder as not the repository root; should classify a plain folder; should classify everything as plain when git is unavailable (stub runner); should resolve a short hash to its commit; should return none for an unknown hash. Commit: `feat(core): inspect project folders with git`
3. `projects/tokens.rs`. Tests: should consume a token once; should expire a token; should reject a label containing a path separator at deserialisation; should reject an unknown analyser name. Commit: `feat(core): add pick tokens and validated project requests`
4. `projects/repository.rs`: create, get, list, update, delete with an injected `Recycler`. Tests: should write project.json atomically; should force the first folder to primary; should list a project with a newer schema as a problem; should recycle a deleted project's directory; should delete permanently when asked. Commit: `feat(core): store projects in the managed store`
5. Folder operations: add, update, remove, relink, refresh, derived status, `resolve_folder`. Tests: should reject a folder already in the project; should reject a duplicate label; should demote the old primary; should flag a vanished folder as missing; should refuse a relink to a different history unless accepted; should keep snapshots when a folder is relinked. Commit: `feat(core): manage folders of a project`
6. API types, `projects.*` and shell-only methods registered in `codecharta-cored/src/serve/projects_routes.rs`, `confine_to_folder` + `projects.sourceFileLocation`, regeneration of `model/coreApi/`. Tests (`codecharta-cored/tests/`, protocol over stdio): should answer BAD_REQUEST for an unknown request key; should answer BAD_REQUEST for an id containing a path separator; should answer BAD_REQUEST for a commit hash that is not lowercase hex (e.g. `--output=x`); should answer TOKEN_EXPIRED for a reused token; should refuse a source file larger than the limit; should return null for a missing source file; should refuse a source path that leaves the folder through a symlink. Commit: `feat(core): serve projects over json-rpc`
7. CLI `projects list|create|add-folder`. Tests (binary with `--data-dir`): should list no projects in a new store; should create a project from folder arguments; should add a folder with label and role; should exit 2 for a missing argument; should print json with `--json`. Commit: `feat(core): add project commands to the command line`
8. Shell: `projectsShell.js` (`projects.pickFolder`, `projects.readSourceFile`, shell-only gate, `projects.folderPath` for reveal-in-explorer); preload exposure; add the same methods to `createFakeDesktopBridge` as minimal stubs (the compiler forces it). Covered by plan 01's relay specs plus an `_electron` smoke addition (stubbed dialog: pick → create → list). Commit: `feat(visualization): expose projects through the desktop shell`
9. Replace the stubs with an in-memory projects/snapshots/store backend inside `createFakeDesktopBridge` (seedable through `FakeDesktopSeed`). Tests: should create and list a project; should report a seeded missing folder; should work when rebuilt from its own source text. Commit: `test(visualization): add projects to the fake desktop bridge`

Acceptance: `codecharta-core projects create --name demo --folder .` then `projects list` shows it; from DevTools in the running app `await window.codeChartaDesktop.request("projects.pickFolder", { title: "Add Folder" })` opens a native dialog and `create` writes `projects/<id>/project.json`.

### M3 — Snapshots: core, RPC, CLI, shell (M)

1. `snapshots/repository.rs` list/map location/delete/record facts and begin/commit/abort/find_by_commit. Tests: should list snapshots newest first; should skip a directory without snapshot.json; should make a snapshot visible only after commit; should remove the staging directory on abort; should recycle a deleted snapshot. Commit: `feat(core): list and manage snapshots of a folder`
2. `snapshots/import.rs` — inspect and import. Tests: should gzip a plain json file on import; should copy a gzip file unchanged; should hash the uncompressed content so a json and its gzip are one content; should detect a commit hint from a ccsh file name; should not take a hint from a name without a hex prefix; should record the file date as a hint and no analysis time; should return the existing snapshot when the same content is imported twice into a project; should record git facts when bound to an existing commit; should answer NOT_A_COMMIT for an unknown commit. Commit: `feat(core): import cc.json files as snapshots`
3. `snapshots/import.rs` — open_file and move (section 6). Tests: should create a project named after the containing folder; should register the containing folder as the project folder; should register a non-repository folder as plain; should reuse the project that already has the containing folder; should resolve the file-name hint in the containing repository; should show the existing snapshot when the same file is opened again; should not duplicate a snapshot that was moved to another folder; should move an imported snapshot to another folder and bind it; should refuse to move an analysed snapshot; should update the remembered snapshot of a folder after a move. Commit: `feat(core): open a cc.json file into a project`
4. `snapshots.*` registered in `codecharta-cored/src/serve/snapshots_routes.rs` (03-M3; the plan's `rpc/snapshots.rs` does not match the layout as built), `snapshots.mapLocation`, regeneration of `model/coreApi/`. Tests (protocol): should answer a map location inside the store root; should answer NOT_FOUND for an unknown snapshot. Commit: `feat(core): serve snapshots over json-rpc`
5. CLI `snapshots list|import`. Tests: should import a file and list it; should print the existing snapshot when importing the same file twice; should exit 1 with the error code for an unknown folder. Commit: `feat(core): add snapshot commands to the command line`
6. Shell: `snapshotsShell.js` (`snapshots.pickImportFile`, `snapshots.readMapChunk` with the inside-store-root check), preload exposure, fake-bridge support. Covered by plan 01's relay specs plus the `_electron` smoke (stubbed open-file dialog: open `sample1.cc.json`, read a map chunk). Commit: `feat(visualization): expose snapshots through the desktop shell`

Acceptance: `codecharta-core snapshots import` of `visualization/app/codeCharta/assets/sample1.cc.json` creates `snapshots/<folderId>/imported-<16hex>/{snapshot.json,map.cc.json.gz}`; in the app, `pickImportFile` then `openFile` with `target: null` creates a project named "assets", and a second `openFile` of the same file returns `wasAlreadyImported: true`.

### M4 — Renderer load path (M)

1. Structural: extract `applySavedSettingsUpFront` in `loadFiles.useCase.ts`; give `provenance()` the `forceDefaultMetrics` option. Existing specs stay green unchanged. Commit: `refactor(visualization): split settings restore from file restore`
2. `model/projectSnapshot.model.ts`; optional field on `FileMeta` and `NameDataPair`; copy in `mapCcJson2ToCCFile`. Tests (`ccJson2ToCCFile.spec.ts`): should carry the project snapshot origin into the file meta; should leave the key absent for an upload. Commit: `feat(visualization): mark maps that come from a project snapshot`
3. `rootName.ts` + facade export. Tests: should rename the root of a 2.x file; should rewrite edge, blacklist and marked-package paths of a 1.x file; should report the original root name. Commit: `feat(visualization): normalise the root name of project maps`
4. `LoadFileService.loadFiles` option. Tests: should replace the loaded files in one setFiles; should keep the loaded files when every new file is invalid; should not clone the loaded files when replacing. Commit: `feat(visualization): replace loaded maps in a single step`
5. `indexedDBWriter.ts` filter. Tests (`indexedDBWriter.spec.ts`, fake-indexeddb): should not persist a project map; should persist an uploaded map beside a project map; should not be due when only project maps are loaded and nothing is persisted; should clear maps persisted before when a project map replaces them. Commit: `feat(visualization): keep project maps out of the saved session`
6. `FilesLoadedSource` `"project"`, `loadProjectSnapshots`, facade type exports. Tests (`loadFiles.useCase.spec.ts`): should load a snapshot under its display name with source project; should drop a snapshot with identical content and report it; should report an unreadable snapshot and load the rest; should clear the loading indicator when nothing could be loaded; should force default metrics when asked. Commit: `feat(visualization): load project snapshots into the map`
7. `bootFromProject`, `showSampleFiles`, `unloadAllFiles`. Tests: should restore saved settings and load the resolved snapshots; should ignore files of an older saved session; should finish without files when nothing resolves; should continue with defaults when the saved settings are unreadable. Commit: `feat(visualization): boot the desktop app from a project`

Knip: tasks 6–7 export symbols nothing but specs use until M5; specs count as consumers.

Acceptance: all existing unit and e2e tests pass unchanged (web behaviour untouched).

### M5 — Projects UI (L)

1. `ProjectsService` + `snapshotBytes.ts` + `snapshotDisplayName.ts`. Tests: should expose the active project after initialise; should assemble chunks into one byte array; should name a commit snapshot label@short; should append +dirty; should make two equal names unique; should fall back to the newest snapshot when the remembered one is gone; should toast identical content. Commit: `feat(visualization): add the projects service`
2. `ProjectsBootService`, `cc-project-home`, wiring in `codeCharta.component.ts/.html`. Tests: should call loadOnBoot without a bridge; should call loadOnBoot when a file url is present; should boot from the active project in desktop; should show the home when no map is loaded in desktop; should not show the home in the web build. Commit: `feat(visualization): show a project home in the desktop app`
3. `cc-folder-list-editor`, `cc-create-project-dialog`. Tests: should add a picked folder with its suggested label; should preselect fork for a folder sharing history with the primary; should disable Create without a name; should show the bridge error as a toast. Commit: `feat(visualization): create projects with several folders`
4. `cc-project-switcher` + nav bar template/`imports` change. Tests: should render the upload button in the web build; should render the project switcher in desktop; should hide the view switcher while no map is loaded; should open a project from the list. Commit: `feat(visualization): switch projects from the nav bar`
5. `cc-project-folder-selector`. Tests: should disable a folder without snapshots; should load the checked folders on Apply; should show the relationship hint. Commit: `feat(visualization): choose which project folders are shown`
6. `cc-manage-project-dialog` (general, folders, re-link, profile, snapshots, delete). Tests: should offer re-link for a missing folder; should ask again when the history differs; should save the analysis profile; should name the snapshot count in the delete confirmation; should unload the map when the active project is deleted. Commit: `feat(visualization): manage a project and its folders`
7. Reset dialog seam (`projectsBoot.reloadAfterReset`). Tests: should reload the shown snapshots after a reset in desktop; should call the web reload without a bridge. Commit: `feat(visualization): keep the project open when the map is reset`
8. E2E on the web suite with the fake bridge installed by `standInForTheDesktopBridge(page, seed)` (`features/projects/e2e/`): create a project → home lists its folders; seeded project with one snapshot boots into the map; switching projects swaps the map; existing `navBarFolderButton.e2e.ts` still passes without a bridge. Commit: `test(visualization): cover the project flow end to end`
9. Changelog (Added): "**Projects**: the desktop app groups folders into projects and reopens the last shown analysis of a project on start." Commit: `docs(visualization): announce projects in the changelog`

Acceptance: in the desktop app, create a project with two folders, restart, land in the same project.

### M6 — Import and store settings (M)

1. `cc-open-file-dialog` + switcher/home entry points + `Ctrl+O`. Tests: should name the new project after the containing folder; should target the existing project of the containing folder; should label the snapshot as imported with unknown analysis time; should show the file date as a hint; should offer binding when the hint resolves to a commit; should not offer binding for a plain folder; should offer show existing for a duplicate; should show the opened snapshot. Commit: `feat(visualization): open cc.json files in the desktop app`
2. `cc-move-snapshot-dialog` + manage-dialog entries + the plain-folder hint row. Tests: should list the folders of the project as targets; should check the hash in the target folder; should move and show the snapshot. Commit: `feat(visualization): move imported snapshots between folders`
3. Core: `store/root_change.rs` and `store.changeRoot`. Tests (core): should adopt a folder that already holds a store; should copy the store into an empty folder without the lock file; should refuse a non-empty folder without a store; should leave the old store in place. Commit: `feat(core): copy the managed store to a new folder`
4. Shell `store.chooseRoot` (dialog → `store.changeRoot` → `app.relaunch()`) and "Change…" / "Use default" in plan 01's desktop tools panel. Tests (Jest): should not render in the web build; should call chooseRoot and show no change when the choice is cancelled; should offer Use default only for a custom root. Commit: `feat(visualization): change the store folder from the settings`
5. Optional, only if spike M0.4 passed: drag-and-drop. The preload adds `snapshots.openDroppedFile(file: File)`, which calls `webUtils.getPathForFile(file)` and hands the path to the shell. The shell treats it as untrusted (absolute, regular file, allowed extension, ≤ the import size limit), shows a **native** message box ("Open `<file name>` from `<folder>`?", Open / Cancel), then calls `snapshots.inspectImportFile` as `pickImportFile` would; the renderer shows `cc-open-file-dialog` as usual. The drop handler lives on `views/codeCharta.component.ts` (`(drop)`/`(dragover)` host listeners, desktop only). Tests (Jest + smoke): should do nothing for a relative path; should refuse a directory; should not inspect when the confirmation is cancelled; should open the dialog for a dropped file. Commit: `feat(visualization): open a cc.json file by dropping it on the window`
6. Changelog (Added) "**Open cc.json files**: the desktop app files an opened cc.json into a project for its folder, marked as imported with an unknown analysis time, and can tie it to the commit its name points to." and (Changed) "**Store folder**: the desktop settings can move where analyses are kept." Commit: `docs(visualization): announce opening cc.json files and the store folder`

### M7 — Local source and scenarios (M)

1. Port `linkedSourceFolders.ts` + `LocalSourceService`/`LocalSourceAvailability` changes. Tests (`localSource.service.spec.ts`): should read a file through the linked folder without a picker; should answer notFound when the linked folder has no such file; should give the linked root path to the editor target; should behave as before without a linked folder (existing specs unchanged). Commit: `feat(visualization): let a linked folder serve local source files`
2. `linkedProjectFolders.ts`, `provideLinkedProjectFolders()` in `app.config.ts`. Tests: should return no folder for an uploaded map; should return no folder for a missing project folder; should turn the bridge bytes into a file. Commit: `feat(visualization): open source files from project folders`
3. `mapBindingKey.ts` in scenarios. Tests: should bind a project map by its folder label; should bind an uploaded map by its file name; should match a scenario across two commits of one folder. Commit: `feat(visualization): bind scenarios to project folders`
4. Changelog (Changed): "**Source files in projects**: maps of a project open their source files and the editor straight from the project folder." Commit: `docs(visualization): announce source files from project folders`

## Repo rules that bite here

- **dependency-cruiser (Angular side).** `features/projects` is reached only through `facade.ts`; `navBar` and `globalSettings` import that facade, `projects` imports the `localSource` and `shared` facades and `load/load.facade.ts` — `projects` must never import `navBar`, `globalSettings` or `scenarios` (`feature-no-circular-dependencies-between-features`). `@ngrx/store` only in `features/projects/stores/` (`feature-only-stores-can-import-ngrx-store`): `ProjectsService` reads loaded files through `FileStoreReadWindow` inside `stores/loadedMaps.read.store.ts`. `NameDataPair` and `withRootName` stay inside `stores/fileStore/` (`wire-dto-only-in-filestore-boundary`); `load/` receives them through `fileStore.facade.ts`. New `load/` exports go through `load.facade.ts` only. `ProjectSnapshotOrigin` lives in `model/` because `load/`, `stores/fileStore/`, `features/localSource` and `features/scenarios` all need it. Services must not import components (`feature-services-not-to-components`).
- **knip** (Angular `app/**/*.ts`): every export needs a consumer in the same commit (a spec counts). Generated types in `model/coreApi/` count as used once a service or the fake imports them.
- **Jest 80 % gate** covers `app/**/*.ts` only; every new component and service ships with its spec. Shell glue is covered by plan 01's `_electron` smoke suite, core code by cargo tests.
- **Rust gates**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` from `core/`; no `unwrap`/`expect` outside tests; library errors are `CoreError` with a stable code, never strings; all filesystem paths in store code go through `StorePaths`.
- **Biome** (Angular): `State` from `@ngrx/store` banned outside `stores/**`; `noForEach`, `useBlockStatements`, `noConsole` (only `warn`/`error`), `noNonNullAssertion`. Run `npm run format:check` from the repo root.
- **Styles**: no component stylesheet (`lint:styles`), daisyUI/Tailwind classes, Font Awesome icons, native `<dialog class="modal">`, OnPush, signals only (zoneless).
- **Persistence**: no new `CcState` key → no entry in `restoredSliceActions.ts`/`actionsRequiringSaveCcState.ts`, no migration, no `DB_VERSION` bump. Do not put the active project into `preferences`; it belongs to the store.
- **LENS_DATA_RULES**: rule 2 (omit, never empty) for `projectSnapshot`; rule 3 — the replace path removes one deep copy per load, add none; rule 4 — project maps are never written to IndexedDB.
- **Clean code**: methods < 25 lines, ≤ 4 parameters (request objects), no magic numbers (chunk size, token lifetime, retry counts as named constants), no narrating comments.
- **Commits**: commitlint scopes `core` (core work, added by plan 01) and `visualization` (Angular and shell), subject ≤ 72 characters; structural commits separate and first (M4.1).
- **Security**: every id, hash, label and token is a validated newtype before a handler runs; ids match `^[a-z0-9-]{1,96}$` before any path join; every store path goes through `StorePaths`; source reads through `confine_to_folder` (canonicalised); shell-only methods are refused from the renderer; the shell reads only paths the core returned and checks them against the store root or folder root; git arguments are arrays and every user-derived value is validated hex or a generated id, so none starts with `-`; remote URLs lose embedded credentials before they are cached, logged or returned; no token, password or credential is ever stored.
- **Changelog**: one bold title + one sentence per user-visible change, under `## [unreleased]`, sections in header order; rewrite an entry instead of adding a second one.
- **Lockfile / dependencies**: no npm dependency added. Cargo dependencies: in use `serde`, `serde_json`, `thiserror`, `ts-rs`, `tempfile`, `humantime` (timestamps) and `getrandom` (ids, 03-M1); candidates `sha2`, `flate2`, `trash`, `dunce`. Not used: `directories` (pulls MPL-2.0 `option-ext`, refused by `core/deny.toml`) and `fs4` (std `File::try_lock` suffices; 03-M0 item 3). Keep `Cargo.lock` committed.

## Manual verification (packaged app, Windows)

- [ ] First start with an empty `%APPDATA%\codecharta-visualization\store`: the project home appears, no sample map.
- [ ] "Show sample maps" loads the two samples; restart returns to the home (samples are not a session).
- [ ] New project with a git repository, a fork clone of it and a plain folder: kinds, remotes and "fork of …" are shown; `project.json` exists and contains no temp files beside it.
- [ ] `codecharta-core projects list --json` (from the installed `resources` folder, app running) prints the same project without disturbing the app.
- [ ] Open a `ccsh analyse --commit` output (`<hash>.<name>.cc.json.gz`) lying inside a clone: the dialog targets a new project named after the containing folder, binding is offered with the commit subject; after opening, the nav bar shows `<label>@<hash>`.
- [ ] Open a plain `.cc.json` from Downloads: a project "Downloads" with a plain folder appears; the snapshot reads "Imported snapshot — analysis time unknown" with the file date as a hint; it is stored as `map.cc.json.gz`; opening it again (also its `.gz` twin) creates no second snapshot.
- [ ] Rename that project: the Downloads folder on disk is unchanged. Add the real repository folder, "Move to folder…" with the hash: the snapshot is now bound, and opening the Downloads file again still shows the moved snapshot.
- [ ] Restart: same project, same snapshot, metric and colour settings restored; DevTools → Application → IndexedDB `CodeCharta/ccstate` record 1002 holds `files: []`.
- [ ] Import one map into the repo folder and one into the fork folder, check both in the folder selector: both appear side by side; Compare shows a delta.
- [ ] Rename a project folder on disk: row shows "missing", the map still opens, "Re-link…" to the renamed folder restores it; re-linking to an unrelated repository asks for confirmation.
- [ ] Right-click a file in the map → open source: the file opens without a folder picker; "open in editor" opens VS Code at the file.
- [ ] Delete a project: it is in the recycle bin; the repositories are untouched (`git status` clean, no new files).
- [ ] Settings → desktop tools → data folder: "Show in file manager" opens Explorer; "Change…" to an empty folder copies the store and restarts into the same project.
- [ ] Start a second instance: the first window is focused, no second window.
- [ ] Web build (`npm run build`, open through the e2e static server): upload button present, no project UI, samples load on first visit.

## Out of scope

- Running analyses, progress, `run.log`, the full `git`/`hosting`/`analysis` blocks of `snapshot.json` (plan 05).
- Branch and commit lists, choosing a commit, "stale by N commits" (plans 04, 05).
- Choosing two snapshots to compare and PR/MR data (plan 06); this plan only guarantees that two loaded project maps can be put into delta.
- Reading a source file as it was at the snapshot's commit (`git show`), plan 04.
- Drag-and-drop of folders, and of files beyond the optional M6.5; OS file associations ("Open with CodeCharta"); an application menu.
- Exporting or sharing a project, syncing the store between machines, garbage-collecting old snapshots.
- Merging several folders into one map with `ccsh merge`.
- Any change to the cc.json format or to ccsh.

## Risks and unknowns

| Risk | Resolution |
| --- | --- |
| Views may throw when the last map is unloaded and `<router-outlet>` is replaced. Today's reset already passes through `files: []` with views mounted, which suggests the state is survivable. | Spike M0.2; fallback is `setActive(null)` + page reload. |
| Large `Uint8Array` over `invoke` may be slower or copied more often than assumed. | Spike M0.1; chunk size is one constant. If even 16 MiB chunks are slow, register a privileged custom scheme in plan 01 and add `connect-src` to the CSP — a cross-plan change, not done here. |
| Peak memory while switching: the old map stays in the store until the new one is parsed. For a ~3 GB-heap map this can exceed the heap limit. | Measure in M4 with the largest available map. If it fails, `loadProjectSnapshots` unloads first (`unloadAllFiles()`) when the stored `map_bytes` of the shown snapshot exceeds a threshold, accepting that a failed load leaves the home on screen. |
| `fs::rename` over an existing file fails intermittently on Windows. | Retry loop in `write_json_atomic`; spike M0.3. |
| The recycle-bin move can fail on network or removable drives. | "Delete permanently" fallback after an explicit second confirmation. |
| Git facts are wrong for shallow clones, worktrees and submodules (`root_commits` of a shallow clone are the graft points). | `is_shallow` suppresses `sharesHistoryWith`; relationships are hints only and never block an action. |
| A file renamed by the user can start with hex that is not a commit (e.g. `cafe.cc.json`). | The hint is only offered after `rev-parse --verify` succeeds and shows the commit subject; binding stays the user's choice. |
| Many opened files from one download folder pile up as one "Downloads" project. | Accepted; "Move to folder…" and project delete clean up. |
| Dropped-file path comes from the renderer (M6.5). | Treated as untrusted, re-checked in the shell and confirmed in a native dialog; the task is optional. |
| The shell reads files the core named; a bug there could widen the read surface. | The shell checks every path against the store root or the folder root the core returned and refuses anything else; covered by the smoke suite. |
| `ts-rs` may not express validated newtypes or the `Uint8Array` override as needed. | Spike M0.3; fall back to another generator or hand-annotated `#[ts(type = "string")]`, recorded in the progress file. |
| Plan 01 names differ, as implemented, from "Required from plan 01". | Re-read plan 01's code before M1 and adapt names; the design does not depend on them. |
| A label rename unbinds scenarios. | Accepted; shown as the existing mismatch badge. |

## Owner decisions applied

- **Opening a cc.json in desktop** stays possible and files it into a project for its containing folder (section 6).
- **Deleting a project, folder or snapshot** moves its store directory to the OS recycle bin; no automatic pruning.
- **Changing the store location** copies into an empty target (or adopts an existing store) and leaves the old folder in place.
- **"Stale by N commits"** (plan 05) is a non-modal banner plus a persistent chip; this plan only supplies the snapshot data.
- **Headless core** (decisions D2, D3): all of this plan's domain logic lives in `core/`, with CLI commands for projects and snapshots; Electron only picks files and folders and moves map bytes.

## Open questions for the owner

1. **May the "open local source files" preference be bypassed for project maps?** Default: yes — a project folder is an explicit link, so source opening is always on for project maps; the experimental switch keeps governing uploaded maps in the web build.
2. **How many folders may be shown side by side?** Default: no limit; D6's "one or two maps in memory" becomes "as many as the user checked", with no warning.
