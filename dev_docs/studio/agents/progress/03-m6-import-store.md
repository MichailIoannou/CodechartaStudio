---
name: 03-M6 import and store settings
state: complete
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
- [x] 4. Store folder in settings
- [x] 5. Drag and drop (optional)
- [x] 6. Changelog

## Notes

Environment (2026-11-19): Arch Linux, node 26.13, npm 12.2, rustc 1.95, Electron 44.9.1. Branch
`feature/studio-03-m6` from `feature/studio-stack` (`30aa1aea8`).

### Verified before changing code
- 03-M5 as described: `ProjectsService`, P1 (`projectSwitcher`, empty footer slot), P3 (`projectOverview`),
  `FolderGitService`; 03-M3: `snapshots.pickImportFile` (shell, title and filters from the caller),
  `snapshots.openFile` / `import` / `move`, `projects.resolveCommit`, `PickedImportFile` as documented;
  `openFile` sets neither the active project nor the view.
- Plan 01 already had shell-only `paths.setStoreRoot` (points the setting elsewhere, copies nothing) and the
  bridge function `chooseStoreRoot({ title })`; `Core` held the store in a `OnceLock` (no runtime switch).
- The fake bridge had no `snapshots.move` / `projects.resolveCommit`; both added (seed `commits` per folder id).

### 1. Open file dialog (P8)
- `services/openFile.service.ts` (`OpenFileService`: `pickToOpen`, `pickToImport(folder)`, `openDropped(file)`,
  `pickAgain`, `open(target, bind)`, `importSnapshot`, `show(ref)`, `resolveHint`, `lookInAnotherFolder`;
  signal `pending`), `components/openFileDialog/*` (one instance, hosted by P1; P3 and the drop target only
  call the service). `ProjectsService.showSnapshot(ref)` = `setActive` + read project + `setView
  { workingFolderId }` + load that snapshot + map view (falls back to the working folder's own choice).
- Entry points: P1 footer "Open cc.json…" with the "Ctrl+O" hint; `Ctrl+O` / `Cmd+O` (document listener on
  P1; ignored while focus is in `input`/`textarea` or a `dialog[open]` exists); P3 (b) "Open cc.json…";
  P3 (a) folder row overflow (`fa-ellipsis`) "Import cc.json…".
- Targets: default = `existingTarget`, else new project; "Change…" shows Project / Folder selects. The hint is
  taken from `hintCommit` for the containing folder and re-resolved with `projects.resolveCommit` for any other
  git folder (import mode too, since `hintCommit` was resolved in the containing folder only).
- "New project" while another project already has the folder: `projects.create` with the containing folder's
  pick token, then `snapshots.import` (`openFile` with `target: null` would reuse the existing project).
- "Look for commit … in another folder…": folder picker → added to the target project (`addFolder`, role from
  `defaultRoleFor`); for a new-project target the project is **created at that moment** with the containing
  folder (primary) and the picked one, because `resolveCommit` needs a folder of a project. It stays if the
  user then cancels (plan 03 §6.5 says the folder "is added to the project first"; nothing says what a cancel
  undoes).
- Tests: the plan's eight names plus Change, new project over an existing one, unbinding, look elsewhere (found,
  not found, cancelled), import mode, inline error, vanished file / Pick again; switcher (menu entry, Ctrl+O
  rules, picker failure), overview (open, import from the row), service, `showSnapshot`, fake; web e2e
  "should open a cc.json file with Ctrl+O into a new project and show its map".

### 2. Move snapshot dialog (P9)
- `components/moveSnapshotDialog/*` with `open(snapshot, "move" | "bind")`; `ProjectsService.resolveCommit`,
  `moveSnapshot` (then `showSnapshot` of the new ref). Commit input prefilled from the bound commit or the file
  name hint; "Check" → `projects.resolveCommit`; primary disabled while a typed hash is unchecked or unresolved.
- **No entry point yet**, as the orchestration notes say: its host is the snapshots dialog of area 05 (design
  P9, Deviation 2 — the design places that dialog in M6, the orchestrator deferred it). Area 05 adds
  "Move to folder…" / "Bind to commit…" on imported rows and exports the component from `projects/facade.ts`
  (not exported now: knip refuses an export without a consumer). No changelog entry for it for the same reason.
- Tests: the plan's three plus bind mode without a hash, check invalidation, refused move, failed check.

### 3. Core: store root change
- Structural commit first: repositories own an `Arc<Store>`; `Core` keeps `RwLock<Option<StoreState>>` and
  `Core::store()` answers an `Arc<Store>`, so a request keeps the store it started with.
- `store/root_change.rs` `prepare_store_root(current, target) -> PreparedRoot { Adopted, Copied, Empty }`:
  absolute target (created when missing), adopt when `store.json` is there, else it must be empty
  (`BAD_REQUEST`), not inside the current store (`NOT_ALLOWED`), copy without `.lock`, symlinks not followed, a
  failed copy empties the target again. `Core::change_store_root` / `reset_store_root`: refuse while analyses
  are queued or running (`CONFLICT`), prepare, `Store::open` at the target, update the settings, swap the open
  store. Choosing the open store's own folder changes nothing. With an unusable current store (P3 (c)) there is
  nothing to copy: an empty target starts a new store.
- Api: `store.changeRoot { path } -> StoreRootChange { storeRoot, adopted }` (shell-only). **`paths.setStoreRoot`
  removed** (it pointed the setting at a folder without the store; 03-M0 item 0 left "replace or wrap" to M6);
  `paths.resetStoreRoot` now copies or adopts into the default folder and switches at once. Plans 01 and 03
  corrected. No store-changed notification: the renderer that asked reloads (single window).
- Tests: the plan's four plus nested/relative refusal and the empty start; protocol tests for the copy, the
  refusal, and copy → serve → reset over JSON-RPC.

### 4. Store folder in settings
- Shell `chooseStoreRoot`: native folder picker → `store.changeRoot` → `paths.get`; a refusal carries the picked
  path in `details.path` (the renderer never sees the picked path otherwise and the design's sentence names it).
  Sender check is the existing `handleTrusted` on the dialog channel.
- `features/desktopTools/services/storeFolder.service.ts` (`StoreFolderService`: `chooseFolder`,
  `useDefaultFolder`, `isChanging`, `changes`), "Store folder" row (path, Show, Change… with spinner and
  "Copying the store…", Use default only when custom; every other panel control disabled while copying).
  `ProjectsService` reloads (status, list, active project, working folder, map) when `changes` ticks.
  P3 (c) gets "Choose another location…".
- Tests: the plan's three (web build already covered by the dialog spec "should not show desktop tools on the
  web"), copying state, refusal toasts, reload after a change, smoke "should copy the store into a picked folder
  and serve it without a restart".

### 5. Drag and drop (P11)
- 03-M0 spike item 4 passed on Linux (recorded in `03-m0-spikes.md`), so it was built.
- Preload `openDroppedFile(file)` → `webUtils.getPathForFile` → dialog channel; shell `createDropShell`
  (`snapshotsShell.js`): absolute path with a `.cc.json` / `.cc.json.gz` ending, regular file, at most
  `MAX_DROPPED_FILE_BYTES` (4 GiB, `shellPolicy.js`), then the native message box "Open '<file name>' from
  '<folder>'?" (Open / Cancel), then `snapshots.inspectImportFile`. Renderer: `fileDropOverlay` component
  (window `dragover` / `dragleave` / `drop` listeners), mounted in `views/codeCharta.component.html`; non-map
  names toast the design's warning before the shell is asked.
- Tests: the plan's four (shell: relative path, directory/missing/other extension, cancelled confirmation, Jest:
  dialog for a dropped file) plus web build, overlay show/hide, shell refusal toast; smoke "should inspect a
  dropped cc.json file once the native confirmation is accepted".

### Followed the design over the plan
- **No relaunch** after a store change (OD5, design D3): the plan's (and this milestone brief's)
  `app.relaunch()` is not used; the core swaps the store at runtime and the renderer reloads.
- No confirmation before "Change…" / "Use default" (OD5); toasts and refusal sentences from D3.
- P9 without the manage-dialog entries the plan names (Deviation 2: no Snapshots tab in P6).
- P11 overlay and wording from the design; the plan's "host listeners on `codeCharta.component.ts`" are on a
  child component (`cc-file-drop-overlay`) rendered there: the root component is built with `new` in its spec.

### Deviations and gaps (wording not given by the design, kept minimal)
- Picker titles: "Open cc.json" / "Import cc.json" (the dialog titles), filter name "cc.json files"
  (`json`, `gz`); "Look for commit <hash> in another folder"; store picker "Choose the store folder".
- Duplicate: the binding option and "Look for commit…" are hidden (the primary action only shows the snapshot).
- A refused store change other than "not empty" / I/O (e.g. `CONFLICT` while analyses run, `NOT_ALLOWED` for a
  folder inside the store) toasts the core's message.
- `MAX_DROPPED_FILE_BYTES` = 4 GiB: the plan asks for "the import size limit", which does not exist (03-M3).
- Pre-existing, not changed: "Try again" on `STORE_LOCKED` only re-reads `store.status`; the core never retries
  opening (choosing the same folder through "Choose another location…" does retry now).
- Hashing/copying still run on the request task (no `spawn_blocking`); a large store copy blocks one worker.

### Screenshots (Playwright, seeded fake bridge, 1280×720, cc-dark and cc-light; scratch spec, not committed)
- P8 new project with a resolved hint: title, file line with size, verbatim label, "File date: 12 Nov 2026,
  14:00", "Goes to New project **billing-api** with folder `C:\work\billing-api` Change…", checked binding with
  helper line, Cancel / Open (focused). As the mock-up. "Change…" shows the Project / Folder selects (folder
  select disabled for a new project). Duplicate: info alert, "Show existing snapshot". Import mode: static
  target sentence, binding re-resolved in billing-api.
- P9: file line "· imported 12 Nov 2026", Folder select, mono Commit input + Check; "Not a commit of 'out'."
  in warning colour with Move disabled; after switching to billing-api "✓ Fix the invoice rounding (Mia Chen,
  3 Nov)" in success colour. (Opened through a temporary, uncommitted overview entry.)
- D3 store rows: "Store folder /media/data/codecharta-store  Show  Change…  Use default" under the data folder.
- P11 overlay (dashed primary border, icon, sentence) over P3 (c) with "Choose another location…".
- Fixed after looking: the folder-row overflow menu was clipped by the list's `overflow-hidden`; the closing
  dialog briefly showed an empty "Open cc.json" box (it now keeps its content while it fades out); the
  "Look for commit" link broke into three underlined pieces.

### 6. Changelog
- Added "**Open cc.json files**" and "**Store folder**" (Added, not the plan's Changed: the store is new in
  this unreleased release). No entry for moving snapshots (no entry point yet).

### Gates (final)
format:check clean; npm test 685 suites, 5357 passed (2 todo), coverage 96.95 / 90.14 / 95.61 / 96.89; lint
clean; tsc clean; build ok; test:electron 76/76; e2e:desktop 16/16; web e2e:ci 170/170 (temporary uncommitted
`BROWSER_CHANNEL = "chromium"` and `E2E_PORT = 9137`, because another worktree's suite held port 9009;
both reverted); cargo fmt, clippy and test with and without `--all-features` (847 / 843 passed); `npm run
contract` no diff.
- The shared `core/target` is also written by other worktrees: cargo gives workspace members the same unit
  names whatever their path, so the `codecharta-core` binary there was another branch's build during one smoke
  run. The final cargo gates and the smoke suite used `core/target/studio-03-m6`.

### How to try it
`cd visualization && npm run build && npm run start` (core from `core/target/debug`). Ctrl+O or the project
menu's "Open cc.json…" opens a file into a project named after its folder; drop a `.cc.json(.gz)` on the
window for the same; Settings → Desktop tools → Store folder "Change…" copies the store to an empty folder and
keeps working without a restart.
