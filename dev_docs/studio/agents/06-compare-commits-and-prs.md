# 06 — Compare commits, branches and PRs / merge requests

- **Status:** draft (owner decisions applied; Angular paths and symbols verified against the repository, the `gh` field list verified against `gh` 2.101.0; `glab`, the Rust crates named here and the plan 01/03/04/05 core APIs this plan calls are UNVERIFIED and marked where used)
- **Working notes:** per-milestone working plan files go in `dev_docs/studio/agents/progress/` (not in `plans/`); nothing may rely on `.claude/` or local agent memory, the work moves between machines through git only.
- **Depends on:** `01-core-and-desktop-shell.md` (core workspace, JSON-RPC server, tool runner, generated contract, bridge token, fake bridge), `03-projects-and-managed-store.md` (projects, folders, project load path), `04-git-branches-and-history.md` (ref listing, commit log, history UI, credential-prompting network path), `05-commit-analysis-and-snapshots.md` (snapshot lookup, nearest analysed commit, analysis queue). Shared decisions: `00-overview-and-decisions.md` (D1–D10, sections 4, 5, 7).
- **Unlocks:** nothing further; this is the last plan in the chain.
- **Estimated size:** M0 spikes S · M1 compare core (Rust) and orchestration L · M2 entry points M · M3 missing snapshots and staleness M · M4 changed files M · M5 PRs / merge requests L · M6 polish and stretch M.

Names taken from other plans are listed in "Required from other plans". In the core they are consumed through thin traits in `compare/ports.rs` and `hosting/ports.rs`; in the renderer through one adapter file per plan. A different name costs one file.

## Goal

The user picks two points of a project folder's history (two commits, a branch against its base, or a PR / merge request) and gets the existing delta view for exactly those two, without handling files. The **core** resolves the refs, chooses the merge base, reports which analyses exist and how stale a substitute would be, lists changed files, and talks to `gh` / `glab`. The **renderer** orchestrates: it asks the core, lets the user decide about missing analyses, enqueues them, loads both maps, enters delta mode with the right reference and comparison, and labels the result with commits, branches and PR number instead of file names. A changed-files list and a filter that greys everything else make the delta readable on a large map. The same resolution is available headless: `codecharta-core compare resolve`.

## Current state

All Angular paths are under `visualization/app/codeCharta/` unless they start with `visualization/`. Everything here was confirmed by opening the file.

Delta state and actions
- `model/state.model.ts` defines `FileSelectionState { Reference, Comparison, Partial, None }` and `FileState { file, selectedAs }`; `model/files/files.ts` re-exports both. Delta mode means some file is `Reference` (`isDeltaState` in `model/files/files.helper.ts`).
- `stores/fileStore/store/files.actions.ts`: `setDelta({ referenceFile, comparisonFile })`, `setDeltaReference({ file })`, `setDeltaComparison({ file })`, `switchReferenceAndComparison()`, `setStandard({ files })`, `setStandardByNames({ fileNames })`, `removeFiles({ fileNames })`, `setFiles({ value })`, `addFile({ file })`. `stores/fileStore/fileStore.facade.ts` exports all of them except `addFile` and `setStandardByNames`, plus `FileStoreReadWindow`, `FilesRepo`, `LoadFileService`, `parseCcFileBytes`, `isDeltaStateSelector`, `visibleFileStatesSelector`, `filesLoaded`, `FilesLoadedSource`.
- `stores/fileStore/store/files.reducer.ts`:
  - `setFileStatesState` and `insertIntoSortedState` keep the array sorted by `fileMeta.fileName`, then `fileChecksum`. Index 0 and 1 mean "alphabetically first", nothing else.
  - `setDeltaState` and `setDeltaReferenceState` match with `isEqual` (checksum equality). `setDeltaComparisonState` matches with `file.file === comparison` (object identity): a `CCFile` that is not the store's own instance silently selects nothing.
  - `removeFilesFromState` is not delta-aware. When no file is left `Partial` it writes `newState[0] = { ...newState[0], selectedAs: Partial }`; on an emptied list that creates an entry without a `file`.
- `stores/fileStore/loaders/ccJson/services/loadFile.service.ts` `LoadFileService.loadFiles`: deep-clones all loaded file states (`clone(this.filesRepo.getFiles())`), then `setFiles`, then `setStandardByNames(recentFiles)` and `fileRoot.updateRoot(<root of recentFiles[0]>)`. Every load therefore ends in standard selection of the new files. It throws `FILES_ALREADY_LOADED_ERROR_MESSAGE` after writing the store when nothing new was added.
- `stores/fileStore/loaders/ccJson/util/fileParser.ts` `addFile`: a file whose checksum is already loaded is not added; the existing entry is renamed to the incoming name. A name clash with a different checksum gets a `_1` style suffix.
- `load/loadFiles.useCase.ts` `LoadFilesUseCase`: public `loadOnBoot`, `loadFromUpload(readNameDataPairs)`, `reloadAfterReset`; private `commit()` runs `loadFiles` and dispatches `filesLoaded(provenance)` in the same task. `FilesLoadedSource = "url" | "indexedDB" | "sample" | "upload" | "reset"` (`stores/fileStore/store/filesLoaded/filesLoaded.actions.ts`). The only programmatic "load then delta" is `LoadInitialFileStore.setRenderState` (`load/loadInitialFile.store.ts`), which dispatches `setDelta({ referenceFile: files[0], comparisonFile: files[1] })` on the name-sorted list, synchronously after `commit()`.

Delta computation
- `lenses/structure/store/structureTree.selector.ts` `_getUndecoratedAccumulatedData`: in delta state, if the two visible root names differ (`reference.file.map.name !== comparison.file.map.name`) it returns `AggregationGenerator.calculateAggregationFile(fileStates)`, i.e. side-by-side maps with no deltas and no warning. Otherwise `getDeltaFile(clone(fileStates))`, with `domainWords` and `clusterings` stripped before the clone.
- `util/getDeltaFile.ts` orders the two visible files by `selectedAs`; with one visible file it returns that file without deltas.
- `util/deltaGenerator.ts` `DeltaGenerator`: nodes are matched by `path` only; `createCodeMapFromHashMap` finds the root through the global `fileRoot.rootPath` (`util/fileRoot.ts`); a node only in the reference gets `fileCount.removed = 1` and zeroed attributes, only in the comparison `fileCount.added = 1`, in both `fileCount.changed = differenceExists ? 1 : 0`. `getFileMetaData` names the result `delta_between_<ref>_and_<comp>` (via `FileNameHelper.withoutCCExtension`) and joins the checksums with `;`.
- `renderer/renderModel/accumulatedData/accumulatedData.selector.ts` clones the structure tree again before decorating and sums `fileCount` and `deltas` up to the root (`NodeDecorator.decorateParentNodesWithAggregatedAttributes`).
- `visualization/LENS_DATA_RULES.md` section 3: the delta path must copy because `DeltaGenerator` mutates; three clones are retained by memoized selectors.

UI
- `features/navBar/components/navBar/navBar.component.html`: `navbar-start` holds `cc-nav-bar-logo`, a divider, `cc-nav-bar-folder-button`, then `@if (isDeltaState()) <cc-delta-selector> @else <cc-map-selector>`. The nav bar also hosts `cc-export-3D-map-dialog` because hover-mounted children get unmounted.
- `features/navBar/components/deltaSelector/deltaSelector.component.ts|.html`: two dropdowns listing `fileMeta.fileName | removeExtension`, a swap button; writes through `NavBarWriteStore` (`features/navBar/stores/navBar.write.store.ts`).
- `features/navBar/components/modeToggle/modeToggle.component.ts`: `isCompareOffered = !isRadialLayout() || isDeltaState()`; both tabs navigate to `routeLinks.metrics` and call `FileSelectionModeService.toggle()`. It is rendered by `viewModeBar.component.html` only for the `metrics` view.
- `features/navBar/services/fileSelectionMode.service.ts`: `lastSetFilesOfPreviousMode: FileState[]` is filled from a `pairwise()` subscription on `files$` each time delta state flips. Leaving delta runs `navBarWriteStore.setFiles(this.lastSetFilesOfPreviousMode)` unfiltered. The array holds complete `FileState` objects, so it keeps whole maps alive and can put removed maps back into the store.
- `features/navBar/effects/redirectAwayFromDomainView/redirectAwayFromDomainView.effect.ts` calls `fileSelectionModeService.toggle()` and toasts "Left compare mode — the domain view shows a single word cloud." when the domain view is opened in delta state.
- `features/radialMap/components/radialMap/radialMap.component.html` shows "This layout shows a single map. Switch to another map layout to compare two maps."; `features/dependencyMap/components/dependencyMap/dependencyMap.component.html` shows "The dependency view shows a single map. Leave compare mode to see its dependencies.". `LayoutAlgorithm` (`model/domain.model.ts`) = `SquarifiedTreeMap | StreetMap | TreeMapStreet | Sunburst | RadialTreeMap`; `setLayoutAlgorithm` is exported by `stores/mapState/mapState.write.facade.ts`, `isRadialLayout$` by `MapStateReadWindow`.
- `features/legend/components/legendPanel/legendDeltaColorsSection.component.html` renders the two delta color rows. `features/sidebarInspector/components/inspectorNodeBadges/inspectorNodeBadges.component.html` renders `Δadded Δ-removed Δchanged` for folders.
- `model/files/files.helper.ts` `createPNGFileName` builds `delta_<visible names joined by _>_<suffix>.png` in store (name-sorted) order. `FileNameHelper.getNewFileName` (`util/fileNameHelper.ts`) is used by the 3D-print export with the `delta_between_…` name.

Flatten, search, explorer
- `renderer/renderModel/flatness/flattenPredicate.selector.ts` `flattenPredicateSelector` decides, at layout time, whether a node is drawn flat and grey: `flattenMatcher.isFlattened(node.path) || (isLeaf(node) && metricRuleMatcher.matches(node.attributes))`. `isNodeFlat` in `renderer/threeViewer/algorithm/treeMapLayout/treeMapHelper.ts` consults it first; `isVisible` hides flat leaves when `mapState.hideFlatBuildings` is on (toggle exists in the Global Configuration dialog).
- `MetricRule` (`model/domain.model.ts`) matches `node.attributes` only, never `deltas` or `fileCount`.
- `sharedView.searchPattern` dims non-matching buildings through the same `isNodeFlat`; patterns are comma-separated gitignore globs (`util/nodeRules/gitignorePattern.ts`).
- `load/restoredSliceActions.ts` `transientSharedViewKeys` (`hoveredNodePath`, `hoveredFileExtensions`, `keptHighlightPaths`, `selectedNodePath`, `rightClickedNodeData`) are never restored and are ignored by the missing-key check (`LoadInitialFileStore.ignoredSharedViewKeys`). A new transient key needs no migration.
- `features/codeMap/effects/renderCodeMapEffect/actionsRequiringRerender.ts` is an explicit list; an action missing from it does not re-render the map.
- Explorer modes: `EXPLORER_CONDITIONAL_MODES` (`features/sidebarExplorer/explorerCapabilities.ts`) is a single (non-multi) `InjectionToken<Signal<ExplorerMode[]>>`; `features/clusterExplorer/provideClustersExplorerMode.ts` is its only provider. `sidebarExplorer.component.html` projects `[modeBody]` whenever the active mode is not `files`; `views/metricsView/metricsView.component.html` passes `<cc-cluster-explorer modeBody>`. `ExplorerModeService` is exported from `features/sidebarExplorer/facade.ts`.
- `stores/sharedView/sharedView.write.facade.ts` exports `setSelectedNodePath`, `focusNode`, `setSearchPattern`, `addFlattenedNodes`.

Not present today: any commit, branch, PR or project concept, any IPC, any git or `gh`/`glab` call in `visualization/`.

UNVERIFIED (no source for it in this repository; each has a spike in M0): the exact JSON fields and flags of `gh` and `glab`, whether `baseRefOid` of a merged PR stays at its merge-time value, and the heap cost of a two-map delta relative to the stored `map.bytes`.

## Design

### 1. Who does what

| Concern | Where | Why |
|---|---|---|
| Ref resolution, ordering of two commits, merge base, "already merged" / "same commit" / "no common ancestor" | core `compare::resolve` | needs git; headless-testable |
| Snapshot status per side (exact / missing / nearest + stale-by), profile and size verdict | core `compare::resolve` (reads plan 03/05 store) | the store is the core's |
| Changed-files list | core `compare::changed_files` | `git diff` |
| Provider detection, `gh` / `glab` calls and JSON parsing, caching, PR-head fetch | core `hosting` | child processes, credentials path of plan 04 |
| Ask the user, enqueue analyses, load two maps, `setDelta`, route, chip, filter | renderer `features/compare` | UI and NgRx |

Electron relays the JSON-RPC calls and reads the two map files; it knows nothing about comparisons.

### 2. Core contract (crate `codecharta-core-api`)

Files `core/crates/codecharta-core-api/src/compare.rs` and `hosting.rs`. All types derive `Debug, Clone, PartialEq, Serialize, Deserialize` with `#[serde(rename_all = "camelCase")]` and the plan 01 TypeScript-generation derive (`ts-rs`; UNVERIFIED, plan 01 decides). Types shared with other plans (`FolderAddress { project_id, folder_id }`, `CommitId` = validated 40-hex string, `CoreError`, `Remote`) come from plans 01, 03 and 04; their exact names are UNVERIFIED.

```rust
pub enum BaseMode { MergeBase, Tip }
pub enum ComparisonOrigin { Commits, Branches, PullRequest, Folders }
pub enum RefLabelKind { Commit, Branch, Tag, PullRequest, WorkingTree, Imported }
pub struct RefLabel { pub kind: RefLabelKind, pub name: String }   // "feature/x", "#123", short SHA, "Working tree"

/// What the user pointed at. `Rev` is a branch, tag, full SHA or unique prefix.
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RefInput { Rev { name: String }, WorkingTree { snapshot_id: String }, Imported { snapshot_id: String } }
pub struct SideInput { pub folder: FolderAddress, pub rev: RefInput }

#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CompareIntent {
    Commits { folder: FolderAddress, a: String, b: String },        // ancestor first, else older commit date
    WithParent { folder: FolderAddress, commit: String },           // first parent
    WithCurrent { folder: FolderAddress, commit: String },          // head = snapshot currently shown, else HEAD
    Branch { folder: FolderAddress, branch: String, target: Option<String>, base_mode: BaseMode },
    ChangeRequest { folder: FolderAddress, number: u64, remote: Option<String> },
    Explicit { base: SideInput, head: SideInput, base_mode: BaseMode },   // dialog, cross-folder, snapshots
}
pub struct ResolveParams { pub intent: CompareIntent, pub shown_commit: Option<String> }  // shown_commit feeds WithCurrent

pub enum SideKind { Commit, WorkingTree, Imported }
/// One resolved side. For `Commit`, `commit` is a full SHA; the other kinds are addressed by `snapshot_id`.
pub struct SnapshotRef { pub folder: FolderAddress, pub kind: SideKind, pub commit: Option<CommitId>, pub snapshot_id: Option<String>, pub label: RefLabel }

pub struct SnapshotSummary { pub snapshot_id: String, pub commit: Option<CommitId>, pub short_commit: Option<String>,
    pub display_name: String, pub checksum: String, pub map_bytes: u64, pub root_name: String, pub profile_hash: Option<String> }
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SideStatus {
    Exact { snapshot: SnapshotSummary },
    Missing { nearest: Option<NearestSnapshot> },
}
pub struct NearestSnapshot { pub snapshot: SnapshotSummary, pub stale_by: u32 }   // commits between requested and shown

pub struct ResolvedSide { pub requested: SnapshotRef, pub status: SideStatus }
pub enum SizeVerdict { Ok, Warn, Block }
pub struct Preflight { pub identical_checksums: bool, pub profiles_differ: bool, pub combined_bytes: u64, pub size_verdict: SizeVerdict }

/// Outcomes the user must see; they are results, not errors.
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ResolveStatus {
    Ready,
    SameCommit,
    AlreadyMerged { target: String },                                  // merge base equals head
    NoCommonAncestor,                                                  // offer tip vs tip
    HeadNotLocal { commit: CommitId, remote: String, change_request: Option<u64> },
}
pub struct ResolvedComparison {
    pub status: ResolveStatus,
    pub origin: ComparisonOrigin, pub base_mode: BaseMode,
    pub base: ResolvedSide, pub head: ResolvedSide,
    pub base_tip: Option<SnapshotRef>,                                 // set for MergeBase: tip the merge base came from
    pub change_request: Option<ChangeRequestSummary>,
    pub preflight: Preflight,
}

pub struct ChangedFilesParams { pub base_folder: FolderAddress, pub head_folder: FolderAddress, pub base: CommitId, pub head: CommitId }
pub enum ChangedFileStatus { Added, Modified, Deleted, Renamed, Copied, TypeChanged }
pub struct ChangedFile { pub status: ChangedFileStatus, pub path: String, pub previous_path: Option<String>, pub similarity: Option<u8> }
pub enum ChangedFilesSource { Git, Unavailable }                       // Unavailable: no clone has both commits
pub struct ChangedFilesResult { pub source: ChangedFilesSource, pub files: Vec<ChangedFile> }

// hosting.rs
pub enum HostingProvider { Github, Gitlab }
pub enum CliState { Ready, NotInstalled, NotAuthenticated, Error }
pub enum DetectedBy { KnownHost, HostNameHint, Override }
pub struct CliInfo { pub name: String, pub state: CliState, pub version: Option<String>, pub detail: Option<String> }
pub struct HostingStatus { pub provider: Option<HostingProvider>, pub host: Option<String>, pub repository: Option<String>,
    pub remote: Option<String>, pub detected_by: Option<DetectedBy>, pub cli: Option<CliInfo> }
pub enum ChangeRequestState { Open, Merged, Closed }
pub struct ChangeRequestSummary { pub provider: HostingProvider, pub number: u64, pub title: String, pub state: ChangeRequestState,
    pub is_draft: bool, pub author: String, pub base_ref_name: String, pub head_ref_name: String, pub head_commit: CommitId,
    pub base_commit: Option<CommitId>, pub merge_commit: Option<CommitId>, pub is_cross_repository: bool,
    pub updated_at: String, pub url: String }
pub enum StateFilter { Open, Merged, All }
pub struct ListChangeRequestsParams { pub folder: FolderAddress, pub state: StateFilter, pub force_refresh: bool }
pub struct ChangeRequestList { pub items: Vec<ChangeRequestSummary>, pub fetched_at: String, pub is_truncated: bool }
pub struct FetchHeadParams { pub folder: FolderAddress, pub remote: String, pub provider: HostingProvider, pub number: u64, pub operation_id: String }
pub struct FetchedHead { pub git_ref: String, pub commit: CommitId }
```

Error codes added to the core's stable code enum (wire form `"<area>.<code>"`): `compare.refNotFound`, `compare.folderNotGit`, `hosting.unknownProvider`, `hosting.cliNotInstalled`, `hosting.cliNotAuthenticated`, `hosting.cliFailed`, `git.fetchFailed`, `git.fetchCancelled`, `git.refNotOnRemote`. Same-commit, already-merged, no-ancestor and head-not-local are `ResolveStatus` values, not errors.

JSON-RPC methods (params → result), all folder addressing by `(projectId, folderId)`:

| Method | Params → result |
|---|---|
| `compare.resolve` | `ResolveParams` → `ResolvedComparison` |
| `compare.changedFiles` | `ChangedFilesParams` → `ChangedFilesResult` |
| `hosting.status` | `{ folder }` → `HostingStatus` |
| `hosting.listChangeRequests` | `ListChangeRequestsParams` → `ChangeRequestList` |
| `hosting.getChangeRequest` | `{ folder, number }` → `Option<ChangeRequestSummary>` |
| `hosting.fetchChangeRequestHead` | `FetchHeadParams` → `FetchedHead` (progress as plan 04's `git.operationProgress`, questions as `prompt.requested`, cancel through plan 04's operation cancel) |
| `hosting.removeFetchedRefs` (M6 stretch) | `{ folder }` → `{ removed: u32 }` |

No notification is defined by this plan; it consumes `analysis.progress` (plan 05), `git.operationProgress` and `prompt.requested` (plan 04). The host override of an unrecognised host is stored on the folder record as `hosting?: { provider, host }` through plan 03's folder-update method.

### 3. Core modules (crate `codecharta-core`)

```
core/crates/codecharta-core/src/
  compare/
    mod.rs              # re-exports
    ports.rs            # traits over plans 03/04/05: FolderLookup, SnapshotLookup (find, nearest_analysed), GitQueries
    resolve.rs          # pub fn resolve(ctx: &CoreContext, params: &ResolveParams) -> Result<ResolvedComparison, CoreError>
    sides.rs            # pub fn side_status(ctx: &CoreContext, side: &SnapshotRef) -> Result<SideStatus, CoreError>
    preflight.rs        # pub fn preflight(base: &SideStatus, head: &SideStatus, limits: &SizeLimits) -> Preflight
    changed_files.rs    # pub fn changed_files(ctx: &CoreContext, params: &ChangedFilesParams) -> Result<ChangedFilesResult, CoreError>
                        # pub fn parse_name_status(output: &[u8]) -> Result<Vec<ChangedFile>, ParseError>
  git/
    compare.rs          # pub fn merge_base(runner: &ToolRunner, repo: &Path, a: &CommitId, b: &CommitId) -> Result<Option<CommitId>, GitError>
                        # pub fn diff_name_status(runner: &ToolRunner, repo: &Path, base: &CommitId, head: &CommitId) -> Result<Vec<ChangedFile>, GitError>
  hosting/
    mod.rs
    remote_url.rs       # pub fn parse_remote_url(url: &str) -> Option<RemoteRef>   // RemoteRef { host, repository }; credentials stripped
    detect.rs           # pub fn detect(remotes: &[Remote], override_: Option<&HostingOverride>) -> Detection
    slug.rs             # pub fn validate_repo_slug(raw: &str) -> Result<RepoSlug, HostingError>
    github.rs           # pub struct GithubCli; impl HostingCli; pub fn parse_gh_pull_requests(json: &[u8]) -> Result<Vec<ChangeRequestSummary>, HostingError>
    gitlab.rs           # pub struct GitlabCli; impl HostingCli; pub fn parse_glab_merge_requests(json: &[u8]) -> Result<Vec<ChangeRequestSummary>, HostingError>
    cache.rs            # pub struct ChangeRequestCache { .. } with get_or_fetch(key, force, fetch) -> Result<ChangeRequestList, HostingError>
    fetch.rs            # pub fn fetch_change_request_head(ctx: &CoreContext, params: &FetchHeadParams, op: &OperationHandle) -> Result<FetchedHead, CoreError>
core/crates/codecharta-cored/src/rpc/{compare,hosting}.rs    # handler registration, param validation
core/crates/codecharta-cored/src/cli/{compare,hosting}.rs    # headless subcommands
```

`pub trait HostingCli { fn status(&self, runner: &ToolRunner, host: &str) -> CliInfo; fn list(&self, runner: &ToolRunner, repo: &RepoSlug, state: StateFilter) -> Result<ChangeRequestList, HostingError>; fn view(&self, runner: &ToolRunner, repo: &RepoSlug, number: u64) -> Result<Option<ChangeRequestSummary>, HostingError>; }`

Candidate crates (exact crates and versions UNVERIFIED, the implementer confirms with `cargo search` / `cargo add`): `serde`, `serde_json`, `thiserror`, `ts-rs` (already chosen by plan 01), `tempfile` (dev). No HTTP crate: the core never calls a hosting API. Plan 01's `ToolRunner` replaces `child_process`; no new process-spawning code is written here.

CLI subcommands (same library code): `codecharta-core compare resolve --project <id> --folder <id> --base <rev> --head <rev> [--mode merge-base|tip] [--json]`, `compare resolve --branch <name> [--target <name>]`, `compare resolve --pr <n>`, `compare changed-files --project <id> --folder <id> --base <sha> --head <sha>`, `hosting status`, `hosting list [--state open|merged|all]`. Exit codes follow plan 01 (0 ok, 1 error, 2 usage); `--json` prints the result type above.

### 4. From user intent to base and head (core, `compare::resolve`)

All refs go through plan 04's `resolve_ref` first; nothing downstream sees a branch name.

| Intent / entry point | base | head | origin / baseMode |
|---|---|---|---|
| Two commits selected in the history → **Compare** (`Commits`) | the ancestor if one is an ancestor of the other, else the older by commit date | the other | `Commits` / `Tip` |
| Commit → **Compare with parent** (`WithParent`) | first parent (`<sha>^1`); `compare.refNotFound` for a root commit (the UI disables it) | the commit | `Commits` / `Tip` |
| Commit → **Compare with current** (`WithCurrent`) | the commit | `shown_commit`, else `HEAD` | `Commits` / `Tip` |
| Commit → **Compare with…** | opens the dialog with head prefilled | | |
| Branch → **Compare with `<target>`** (`Branch`), target = current branch, or the default branch when the clicked branch is the current one | `merge_base(target tip, branch tip)` | branch tip | `Branches` / `MergeBase` |
| Same with `base_mode = Tip` | target tip | branch tip | `Branches` / `Tip` |
| PR / MR row (`ChangeRequest`) | section 7.4 | PR head commit | `PullRequest` / `MergeBase` |
| Compare dialog (`Explicit`) | as chosen | as chosen | derived from the picked kinds |
| `Explicit` with two folders | commit in folder A | commit in folder B | `Folders` / `Tip` |
| Snapshot row → **Compare with working tree** / **Compare with imported…** | the commit snapshot | the folder's working-tree snapshot, or an imported snapshot of the same project | `Commits` / `Tip` |
| Working-tree or imported snapshot shown → **Compare with commit…** | the picked commit | the shown snapshot | `Commits` / `Tip` |

Working-tree and imported sides are used only when the snapshot already exists (plan 05 creates working-tree snapshots, plan 03 imports); this plan never creates them. They have no commit: no merge base, no git changed-files list (the Changes tab uses the metrics source, section 8), `stale_by` is not computed (the chip shows "working tree" or "imported <date or unknown>"), and the dialog lists them under a "Snapshots" group only when they exist. When no working-tree snapshot exists the picker offers "Analyse working tree" through plan 05's queue, always as an explicit click.

The merge base is the default for branches because it answers "what does this branch change", the three-dot semantics of a PR page; tip vs tip also shows what the target gained meanwhile, as negative deltas. The renderer remembers the toggle per project.

`ResolveStatus` is decided in this order: head not in any local clone → `HeadNotLocal`; `base == head` → `SameCommit`; merge base equals head → `AlreadyMerged`; `merge_base` is `None` → `NoCommonAncestor`; else `Ready`. `Preflight` is always filled when both sides could be looked up. `SizeLimits` constants `COMBINED_BYTES_WARNING` and `COMBINED_BYTES_LIMIT` are `pub const` in `preflight.rs`, initial 15 MB and 60 MB of combined compressed `map_bytes`, calibrated by M0 task 4.

### 5. Renderer feature layout

```
visualization/app/codeCharta/features/compare/
  facade.ts                                   # CompareFacade + the components other features mount
  model/compare.model.ts                      # ComparePhase, CompareState, LoadedSide, CompareError (renderer-only); re-exports generated coreApi types
  ports/compareGateways.ts                    # SnapshotGateway, CoreGateway, HostingGateway + tokens
  adapters/snapshotGateway.adapter.ts         # binds to plans 03 and 05
  adapters/coreGateway.adapter.ts             # compare.* and plan 04 git reads through the DesktopBridge
  adapters/hostingGateway.adapter.ts          # hosting.* through the DesktopBridge
  services/compare.service.ts                 # orchestration (section 6)
  services/compareIntent.ts                   # pure: UI selection → CompareIntent
  services/comparisonText.ts                  # pure: chip label, copy text, parse "a..b" / "a...b"
  stores/compare.store.ts                     # signal state
  stores/compare.write.store.ts               # the only file dispatching setDelta / setStandard / removeFiles / filter
  stores/compare.read.store.ts                # reference/comparison checksums, delta root node, layout
  stores/changeRequests.store.ts              # PR list per folder, loading / empty-state reason
  selectors/deltaChangeSummary.selector.ts
  selectors/changedFileRows.ts                # pure: ChangedFile[] + delta tree → rows
  repos/recentComparisons.repo.ts             # LocalStorageRepo, per project
  provideChangesExplorerMode.ts
  components/{compareHost,compareButton,comparisonChip,compareDialog,refPicker,comparePreparation,changeRequestList,changesExplorer,comparisonLegendCaption}/
  e2e/compare.e2e.ts, e2e/compare.po.ts
```

Generated types live in `model/coreApi/` (plan 01); this feature imports them through its own `model/` re-export. Dependency direction (dependency-cruiser forbids cycles between features): `navBar → compare`, `gitHistory → compare`, `legend → compare`; `compare → projects, snapshots` (their `facade.ts`), `compare → renderer/renderModel/renderModel.facade.ts`, `stores/*` facades. `compare` never imports `navBar` or `gitHistory`.

`CompareState` (signal in `compare.store.ts`, `@Injectable({ providedIn: "root" })`, D8; not in `CcState`, not persisted):

```ts
export type ComparePhase = "idle" | "resolving" | "needsDecision" | "analysing" | "loading" | "active" | "noDifferences" | "failed"
export interface LoadedSide { requested: SnapshotRef; snapshotId: string; shownCommit: string | null; staleBy: number; checksum: string; fileName: string }
export interface CompareState { phase: ComparePhase; resolved: ResolvedComparison | null; base: LoadedSide | null; head: LoadedSide | null; error: CompareError | null }
```

`isActive` is a computed that also requires the store's current `Reference` and `Comparison` checksums to equal `base.checksum` and `head.checksum`; if the user changes the selection by any other route the chip disappears instead of lying.

### 6. Orchestration — `CompareService.start(intent)`

Each step maps to a `ComparePhase`. Steps 1 and 2 of the old renderer-side design (ref resolution, preflight) are now one core call.

1. **resolving** — `CoreGateway.resolve(intent)` → `ResolvedComparison`.
2. **Status** — `SameCommit`, `AlreadyMerged`, `NoCommonAncestor` stop with their message ("Both sides are the same commit — nothing to compare."; "`<branch>` is already contained in `<target>`. Compare tip vs tip, or pick a base commit."; offer tip vs tip). `HeadNotLocal` shows "The head of #123 is not in your clone yet." with **Fetch from `<remote>`** (section 7.5) and re-resolves afterwards.
3. **needsDecision** — only when a side is `Missing` or `preflight.sizeVerdict !== Ok`, or `profilesDiffer`. `cc-compare-preparation` shows one row per side: `base  abc1234 (main)  — not analysed · nearest: 9f8e7d6, 4 commits older`. Actions: **Analyse missing** (primary), **Use nearest** (enabled only when every missing side has a nearest snapshot and the two nearest differ), **Cancel**; `Warn` adds "These two analyses are large; comparing may take a while and use several GB of memory." with **Compare anyway**; `Block` shows "Too large to compare in memory. Analyse with a lighter profile or compare a sub-folder." without a go-ahead; `profilesDiffer` warns that deltas may not be code changes.
4. **analysing** — `SnapshotGateway.analyse(missingRefs)` (plan 05 `analysis.enqueue`, progress through `analysis.progress`) returns one batch; the dialog shows both jobs in one list with one **Cancel** for the batch. A failed job leaves the dialog open with its message and offers "Use nearest" for that side. After the batch, call `compare.resolve` again so statuses and checksums come from the store.
5. **Identical check** — if `preflight.identicalChecksums`: do not enter delta (the loader would collapse the two). Load the head snapshot alone, set phase `noDifferences`, show the neutral chip "No metric differences between `abc1234` and `def5678`", and still fetch the changed-files list ("12 files changed in git without a metric change").
6. **loading** — `SnapshotGateway.loadPair(base, head, { rootName })` (plan 03 load path; the shell reads both map files). `rootName` is the base folder's normalised root name; for `Folders` it forces both maps onto the same root. The gateway replaces whatever project maps were loaded (D6).
7. **Select** — after `loadPair` resolves, read `FileStoreReadWindow.getFiles()`, find the two `CCFile` instances by `fileMeta.fileChecksum === side.checksum`, dispatch `setDelta({ referenceFile: baseFile, comparisonFile: headFile })`. Then assert `isDeltaState` and `baseFile.map.name === headFile.map.name`; on failure set phase `failed` with "The two analyses could not be aligned (different root folders)." and show the head alone.
8. **Route** — `router.navigateByUrl(routeLinks.metrics)`; if `isRadialLayout`, dispatch `setLayoutAlgorithm({ value: LayoutAlgorithm.SquarifiedTreeMap })` and toast "Switched to the treemap layout — the radial layouts show a single map." When started from the domain or dependency view, toast "Compare runs in the metric view — the domain and dependency views show a single map."
9. **active** — store both `LoadedSide`s, push to recents, clear any previous changed-files filter, start `compare.changedFiles` (section 8) without awaiting it.

Rules that come straight from the Angular code and must not be broken:

- `setDelta` is dispatched after the load, never before: `LoadFileService.loadFiles` ends in `setStandardByNames`.
- Files are located by checksum, never by index: `files[0]`/`files[1]` are name-sorted, and with `<folderLabel>@<shortSha>` names the order is arbitrary with respect to time.
- `setDeltaComparison` is never used by this feature. **Swap** dispatches `switchReferenceAndComparison()` and swaps `base`/`head` in the store; **Change…** runs `start()` again, which ends in a full `setDelta`.
- The pair is never removed down to an empty list (the `removeFilesFromState` empty-list defect). Order when leaving: `setStandard({ files: [headFile] })`, then `removeFiles({ fileNames: [baseFile.fileMeta.fileName] })`.

`CompareService.exit()`: clear the changed-files filter, run the two dispatches above, tell plan 05 that the head snapshot is now the viewed one (`SnapshotGateway.markViewed(head)`), set phase `idle`.

Interplay with `FileSelectionModeService` (two changes inside `features/navBar`):
- `toggle()` first asks `CompareFacade`: if a project comparison is active it calls `compareFacade.exit()` and returns; if a project is open and no delta is active it calls `compareFacade.openDialog()` and returns. The existing behaviour stays for plain uploaded files. This one choke point covers both `ModeToggleComponent` and `RedirectAwayFromDomainViewEffect`.
- The `files$` subscription prunes `lastSetFilesOfPreviousMode` to entries still in the store (reuse the private `filterNoneExisting`) on every emission. Today the prune happens only inside `toggle()` when leaving delta (a spec "should not restore a removed file when toggling back to delta mode" already covers that), so unloaded project maps stay retained in memory until the next toggle.

Error states (`CompareError.kind`): `refNotFound`, `analysisFailed`, `analysisCancelled`, `loadFailed`, `rootMismatch`, `tooLarge`, `bridgeUnavailable`, `coreUnavailable` (core process down; plan 01 restarts it, the UI offers retry), plus the hosting codes. Each is shown in the dialog that started the flow, or as an error toast when started from a context menu; none leaves the store half-loaded (on failure after step 6 the head is shown alone).

### 7. PRs and merge requests in the core (D10)

#### 7.1 Provider detection (`hosting/remote_url.rs`, `detect.rs`)

- Remotes come from plan 04's git module (`git remote -v`); preference order `upstream`, then `origin`, then the first.
- `parse_remote_url` handles `https://host[:port]/a/b(.git)`, `git@host:a/b(.git)`, `ssh://git@host[:port]/a/b(.git)`, with any number of path segments (GitLab subgroups); credentials in the URL are stripped and never returned.
- Mapping: `github.com → Github`, `gitlab.com → Gitlab` (`KnownHost`); otherwise the folder's `hosting` override (`Override`); otherwise a host label containing `gitlab` or `github` (`HostNameHint`); otherwise `provider: None`.
- The override is written from the PR tab's empty state ("This host is not recognised. Treat `git.example.org` as: GitHub Enterprise / GitLab") through plan 03's folder-update method.

#### 7.2 GitHub through `gh`

`GithubCli` runs `gh` through `ToolRunner` (argument vector, never a shell string; `cwd` = folder path, 30 s timeout) with the environment additions `GH_PROMPT_DISABLED=1`, `GH_NO_UPDATE_NOTIFIER=1`, `NO_COLOR=1` (variable names from `gh`'s documented environment; M0 confirms they are honoured by the installed version). `REPO` is `[HOST/]OWNER/REPO` from detection (`-R, --repo` confirmed in `gh pr list --help`, gh 2.101.0). `validate_repo_slug` rejects a slug that starts with `-` or contains anything outside `[A-Za-z0-9._/:-]`, so it can never be read as a flag; PR numbers are `u64`; commits are `CommitId`.

```
gh --version
gh auth status --hostname <host>            # exit 0 = authenticated, non-zero = not; output is neither stored nor shown
gh pr list -R <REPO> --state <open|merged|all> --limit 100 \
   --json number,title,state,isDraft,author,baseRefName,headRefName,headRefOid,baseRefOid,isCrossRepository,updatedAt,url,mergeCommit
gh pr view <number> -R <REPO> \
   --json number,title,state,isDraft,author,baseRefName,headRefName,headRefOid,baseRefOid,isCrossRepository,updatedAt,url,mergeCommit
```

Confirmed with `gh pr list --help` (gh 2.101.0): flags `--json`, `-L/--limit`, `-s/--state {open|closed|merged|all}`, `-R/--repo`; every JSON field above is listed; `gh auth status` takes `-h/--hostname`. `StateFilter` has no `Closed`.

`parse_gh_pull_requests` mapping: `state` `OPEN|MERGED|CLOSED` → enum; `author.login` → `author`; `headRefOid` → `head_commit`; `baseRefOid` → `base_commit`; `mergeCommit.oid` → `merge_commit` (None when absent; the nested shape is UNVERIFIED until the M0 fixture). Unknown JSON fields are ignored, missing optional ones become `None`. `is_truncated` is true when exactly 100 rows came back. Never called: `gh auth token`, `gh auth status --show-token`, `gh api`, anything that writes.

#### 7.3 GitLab through `glab` — UNVERIFIED, spike first

Intended commands (flags confirmed in M0; the parser is written against the captured output, not this list):

```
glab --version
glab auth status --hostname <host>
glab mr list -R <REPO> --output json --per-page 100 [--merged | --all]
glab mr view <iid> -R <REPO> --output json
```

Expected fields: `iid`, `title`, `state` (`opened|merged|closed`), `draft`, `author.username`, `source_branch`, `target_branch`, `sha`, `diff_refs.base_sha`, `source_project_id`, `target_project_id`, `web_url`, `updated_at`. `is_cross_repository = source_project_id != target_project_id`. If `diff_refs` is absent from list output, `base_commit` is `None` in the list and filled by `hosting.getChangeRequest` when a row is opened.

#### 7.4 Which base for a PR

`base = merge_base(base_commit, head_commit)` where `base_commit` is the base SHA the PR records; when it is `None` or not present locally, `base = merge_base(tip of <remote>/<base_ref_name>, head_commit)`; for a merged request whose recorded base is unusable (M0 task 1 decides), `base = <merge_commit>^1` merged with the head the same way. The PR page shows the three-dot diff, and the recorded base SHA is reproducible after the PR was merged, when the base branch tip already contains the head. If the result equals `head_commit` the status is `AlreadyMerged`. `base_tip` keeps the base branch tip so the chip can offer "tip vs tip".

#### 7.5 Head commits that are not local, and working without a CLI

- `resolve` reports `HeadNotLocal` when `has_commit(head)` is false in every clone involved (fork PR, or branch never fetched). **Fetch** calls `hosting.fetchChangeRequestHead`, the only trigger being the user's click. It runs through plan 04's credential-prompting network path (`GIT_ASKPASS` / `SSH_ASKPASS` to `codecharta-core askpass`, `GIT_TERMINAL_PROMPT=0`, 300 s timeout so a human can answer; answers are relayed once and never stored or logged; cancel kills the fetch, `git.fetchCancelled`):
  - GitHub: `git fetch --no-tags <remote> +refs/pull/<n>/head:refs/codecharta/pr/<n>`
  - GitLab: `git fetch --no-tags <remote> +refs/merge-requests/<n>/head:refs/codecharta/mr/<n>`
  then `git rev-parse --verify refs/codecharta/<pr|mr>/<n>^{commit}`. `remote` must be one of the folder's own remote names. If the fetched commit differs from the listed `head_commit`, the list is refreshed and the fetched commit wins. The same check and fetch of `<remote> <base_ref_name>` applies when `base_commit` is missing locally. A branch that lives only on a fork's own remote is not offered (the user adds the remote and uses plan 04). Fork PRs need no extra remote: both ref namespaces are served by the base repository.
- Without a CLI (`NotInstalled`, `NotAuthenticated`, or unknown provider with an override): the PR tab shows a number input "Open PR / MR by number" which fetches the ref as above and asks for the base branch (default: the default branch). Title and author are unknown; the label is `PR #<n>`.
- Empty states of the PR tab, by `HostingStatus`:
  - `provider: None` → the override prompt of 7.1.
  - `NotInstalled` → "Install the GitHub CLI (`gh`) to list pull requests, or enter a number below." (link `https://cli.github.com`; GitLab: `https://gitlab.com/gitlab-org/cli`).
  - `NotAuthenticated` → "Run `gh auth login --hostname <host>` in a terminal, then refresh." The app never starts the login and never reads a token.
  - `Error` → the CLI's first stderr line, plus the number input.
  - `Ready` with zero rows → "No open pull requests."

#### 7.6 Caching

`ChangeRequestCache` (in memory in the serving core): key `projectId/folderId/state`, TTL 5 minutes, one in-flight request per key (the synchronisation primitive follows plan 01's concurrency model). `force_refresh` bypasses it. The renderer `ChangeRequestsStore` keeps the last list per folder so reopening the dialog paints immediately and refreshes behind it when older than the TTL. Nothing is written to disk; recents keep the `ChangeRequestSummary` they were started from.

### 8. Changed files, the filter, the summary

**Changed-files list.** `compare.changedFiles` runs `git -C <folder> diff --name-status -M -z --relative <base> <head>` in the clone that has both commits (base folder first, then head folder); neither → `source: Unavailable`. `-z` output is NUL-separated: a status token (`A`, `M`, `D`, `T`, `R<score>`, `C<score>`) followed by one path, or two paths (old, new) for `R` and `C`; `parse_name_status` is pure. `--relative` restricts to and strips the folder's prefix so paths match map paths when the project folder is a repository subfolder. Paths are forward-slashed, relative to the folder; non-UTF-8 paths are converted lossily (UNVERIFIED how git reports them with `-z` on Windows). The renderer maps `path` to a node path with `/${rootName}/${path}`.

`ChangesExplorerComponent` is a new explorer mode "Changes" (`id: "changes"`, icon `fa-solid fa-code-compare`, `hidesListTools: true`) offered while a project comparison is active. Rows: status letter badge, file name, dimmed parent path, the height-metric delta when the node exists; renamed rows show `old → new`. Click dispatches `setSelectedNodePath({ value })`; a per-row button "Focus folder" dispatches `focusNode({ value: parentPath })`. Rows whose path has no node are greyed with the title "Not part of the analysis". The list is virtualised with `ListViewport`/`listWindow` from the sidebarExplorer facade, as the cluster explorer does.

Two structural changes make a second conditional mode possible:
- `EXPLORER_CONDITIONAL_MODES` becomes a `multi` token; `ExplorerModeService` flattens the injected array of signals; `provideClustersExplorerMode` adds `multi: true`.
- `sidebarExplorer` projects `[modeBody]` for every non-files mode, so each mode body renders only when its own mode is active: `ClusterExplorerComponent` and `ChangesExplorerComponent` both guard on `ExplorerModeService.activeMode().id`.

When the core answers `Unavailable` (also for side kinds without a commit, and in a fake bridge that does not seed it) the list is built from the delta tree: every leaf with `fileCount.added`, `removed` or `changed` set (`changedFileRows.ts`, pure, fed by `accumulatedDataSelector`). The header says which source is shown: "Files changed in git" or "Files with metric changes".

**Show only changed files.** Mechanism: a new transient `sharedView` key read by `flattenPredicateSelector`, the same selector flatten rules and metric rules already go through. Not flatten rules (persisted user data), not the search pattern (it would fill the search box), not a `MetricRule` (rules read `attributes`, not `fileCount`).

```ts
// model/domain.model.ts
export type ChangedFilesFilter = { source: "git"; paths: string[] } | { source: "metrics" }
// model/state.model.ts — SharedView
changedFilesFilter: ChangedFilesFilter | null
```

- New slice `stores/sharedView/store/changedFilesFilter/` (`.actions.ts` `setChangedFilesFilter({ value })`, `.reducer.ts` default `null`, `.selector.ts`, reducer spec; sibling slices such as `searchPattern/` show the layout), registered in `stores/sharedView/store/sharedView.reducer.ts` (the `combineReducers` there and the `defaultSharedView` it exports), exported from both sharedView facades, added to `transientSharedViewKeys` in `load/restoredSliceActions.ts` (no restore action, no migration, no `DB_VERSION` bump) and to `actionsRequiringRerender.ts`.
- New pure helper `util/nodeRules/changedFilesMatcher.ts` `createChangedFilesMatcher(filter): (node: CodeMapNode) => boolean` — true for a leaf that should be greyed: for `git`, `!pathSet.has(node.path)`; for `metrics`, `node.fileCount` exists and `added + removed + changed === 0`; for `null`, always false.
- `flattenPredicateSelector` gains `changedFilesFilterSelector` as an input and ORs the matcher into its leaf branch. Unchanged files are drawn flat and grey; with "hide flat buildings" they disappear.
- The toggle "Only changed files" sits in the Changes mode header. `CompareService` clears the filter on `start`, `exit` and whenever `isActive` turns false.

**Summary header.** At the top of the Changes mode: `+12 added · −3 removed · 41 changed` from the delta root's aggregated `fileCount`, and the root `deltas` of the current area and height metrics (`rloc +1 240`, `complexity −35`), via `deltaChangeSummary.selector.ts`. With the git list loaded it adds `58 files changed in git (4 renamed)`.

**Rename awareness (stretch, assessed).** `DeltaGenerator` would need a map `previousPath → path` and, in `getReferenceNodesByPath`, key each renamed reference node under its new path and overwrite its `path` and `name` with the comparison node's, so `applyComparisonToReferenceNode` treats it as changed. The blocker is where the pairs live: `structureTreeSelector` is a lens and may not read `sharedView` (`lens-no-view-state`), so the pairs would have to enter through the file store next to the two files, which changes a persisted home. Until then the Changes list shows the rename and selecting the row highlights the new path; the old path appears as removed in the map. Do it only if M6 has room.

**Recent comparisons.** `recentComparisons.repo.ts` on `LocalStorageRepo`, key `codeCharta.compare.recent.<projectId>`, the last 10 `CompareIntent`s with their label (plus the last base-mode toggle), de-duplicated on resolved `base.commit + head.commit + folder ids`. Listed in the dialog's Recent tab with label and age; a click runs `start()`.

**Copy as text.** `comparisonText.ts`: `repo: main...feature/x (abc1234..def5678)` plus the PR URL when present; tip mode uses two dots. Pasting the same form into a ref picker is parsed. A deep link that opens the app is out of scope.

### 9. UI

Nav bar (`features/navBar/components/navBar/navBar.component.html`, `navbar-start`; plan 03 edits the same block — rebase onto it):

```html
@if (hasProjectComparison()) {
    <cc-comparison-chip></cc-comparison-chip>
} @else if (isDeltaState()) {
    <cc-delta-selector></cc-delta-selector>
} @else {
    <cc-map-selector></cc-map-selector>
}
<cc-compare-button></cc-compare-button>
<cc-compare-host></cc-compare-host>
```

- `cc-compare-button`: `btn btn-ghost btn-sm`, icon `fa-solid fa-code-compare`, text "Compare". Rendered only when the bridge is present and a project with at least one git folder is open. Opens the dialog.
- `cc-comparison-chip` replaces the delta selector while `isActive` or `noDifferences`: `base abc1234 (main)  ⇄  head def5678 (feature/x)   PR #123` — the `⇄` is the swap button (`fa fa-arrows-h`, same title as today's), a `badge badge-warning badge-sm` "stale by 4" follows a side whose `staleBy > 0` (title: "No analysis for abc1234. Showing 9f8e7d6, 4 commits older."), the PR badge links to `changeRequest.url` (`target="_blank"`, handled by the existing `setWindowOpenHandler`). A caret menu offers **Change…** (dialog prefilled), **Copy as text**, **Leave compare**.
- `cc-compare-dialog`: native `<dialog class="modal">` (pattern: `features/globalSettings/components/globalConfigurationDialog/`). Rows: folder select (git folders; a second appears after ticking "compare with another folder"), **Base** and **Head** `cc-ref-picker`, the base-mode toggle (only when base is a branch or tag), a tab strip `Refs | Pull requests | Recent`. Footer: **Compare**, **Cancel**.
- `cc-ref-picker`: text input with a result list grouped Branches, Tags, Commits, Pull requests. Branches and tags are filtered client-side from plan 04's `git.listRefs`; commits come from plan 04's `git.searchCommits` (hash prefix or subject substring, limit 50, debounced 250 ms); PRs match on number or title from `ChangeRequestsStore`. Each row shows short SHA, name, subject, and a dot when an analysis exists. Typing `a..b` or `a...b` fills both pickers (two-dot = tip, three-dot = merge base).
- `cc-change-request-list`: rows `#123  Title  feature/x → main  author  2 days ago`, badges `draft`, `fork`, analysis dots for base and head. Header: state filter Open / Merged / All, a refresh button with "updated 3 min ago". Empty states in 7.5.
- Legend: `cc-comparison-legend-caption` is added at the top of `legendDeltaColorsSection.component.html` and renders `Δ = head def5678 − base abc1234` during a project comparison, nothing otherwise.
- Screenshot name: `createPNGFileName` orders the visible files Reference first, giving `delta_<base>_<head>_map.png`. `DeltaGenerator.getFileMetaData` is left as is: with D7 names it already yields `delta_between_repo@abc1234_and_repo@def5678`.

### 10. Cross-folder comparison and performance

Two folders of one project (the repository and a fork clone) can be compared via `Explicit` with two folders: same commit in both (should be identical → "No metric differences") or different commits. It works because `loadPair` forces one root name. Limits, stated in the dialog: paths are matched as they are, so a fork with a different folder layout shows as removed plus added; merge base and the git list are only available when one of the two clones contains both commits (core probes base folder first), otherwise base mode is `Tip` and the list falls back to metric changes; different analysis profiles produce deltas that are not code changes (`profiles_differ`, warned in the preparation dialog for same-folder comparisons too).

Delta mode holds two maps in the store, clones both for `DeltaGenerator`, and clones the delta tree twice more for decoration (`visualization/LENS_DATA_RULES.md` section 3): about six map-sized node graphs against about three for one map. The documented reference is one 830 MB cc.json ≈ 3 GB heap with a 4.3 GB ceiling, so a pair each above roughly a third of that cannot be compared. The core's `preflight` guards on the sum of the two records' `map_bytes` (section 4); project maps are not written to IndexedDB (D6); unloading on exit plus the `FileSelectionModeService` pruning gives the memory back.

### Required from other plans

The core rows are consumed in `compare/ports.rs` and `hosting/ports.rs`, the renderer rows only in `features/compare/adapters/*`. Names are this plan's assumption (UNVERIFIED until reconciled at the start of M1).

| From | What | Used for |
|---|---|---|
| 01 (core) | `CoreContext`, `ToolRunner` (argument vector, cwd, env additions, timeout, cancellation, ENOENT → "not installed"), stable error-code enum with `<area>.<code>` wire form, JSON-RPC method registration, TS contract generation command, test support in `core/crates/codecharta-core/tests/support/` (temporary git repository builder with deterministic author/committer env, fake `ccsh`) | all core work |
| 01 (renderer) | `DESKTOP_BRIDGE` token (`DesktopBridge \| null`), a typed call by method name with `operationId` for cancellable calls, typed bridge errors, event observation, the in-memory fake bridge installable in Jest and in the web Playwright suite | gateways; feature hidden when null |
| 03 | `FolderAddress`, folder lookup `(projectId, folderId) → path`, folder-update method (incl. `hosting` override); `ProjectsFacade.activeProject()` signal with `folders: { id, label, isGitRepository, hosting? }[]` | core resolution; folder pickers |
| 03 | project load path: `FilesLoadedSource` value `"project"`, replace semantics, a `rootName` override before the map reaches `LoadFileService`, and the map-file read by the shell | `SnapshotGateway.loadPair` |
| 03/05 | the loader resolves with the loaded snapshots' `meta.checksum`, or the snapshot record's `map.checksum` equals `fileMeta.fileChecksum` | locating the two files |
| 04 (core) | `resolve_ref`, `is_ancestor`, `has_commit`, `remotes`, default branch, commit date, `CommitId`, and the credential-prompting network path (`run_git_network` with `askpass` env, operation handle, cancel) | resolver, PR-head fetch |
| 04 (renderer) | `git.listRefs`, `git.searchCommits`; history UI multi-selection and extension points in the commit-row and branch-row context menus | ref picker, entry points of M2 |
| 05 (core) | `find_snapshot(side)`, `nearest_analysed(side) → (snapshot, stale_by)`, snapshot record fields `id, commit, shortCommit, map.checksum, map.bytes, map.rootName, analysis.profileHash`, display name `<folderLabel>@<shortSha>` | `side_status` |
| 05 (renderer) | `analysis.enqueue` batch with per-job progress and one cancel, `analysis.progress`, `markViewed(snapshot)` | steps 4 and exit |

### Offered to other plans

Core: JSON-RPC methods `compare.resolve`, `compare.changedFiles`, `hosting.status`, `hosting.listChangeRequests`, `hosting.getChangeRequest`, `hosting.fetchChangeRequestHead`, and the CLI subcommands of section 3. Renderer, `features/compare/facade.ts`:

```ts
@Injectable({ providedIn: "root" })
export class CompareFacade {
    readonly state: Signal<CompareState>
    readonly isActive: Signal<boolean>
    readonly isAvailable: Signal<boolean>          // bridge present and a project with a git folder is open
    compareCommits(folder: FolderAddress, commitA: string, commitB: string): Promise<void>
    compareWithParent(folder: FolderAddress, commit: string): Promise<void>
    compareWithCurrent(folder: FolderAddress, commit: string): Promise<void>
    compareBranch(folder: FolderAddress, branch: string, options?: { target?: string; baseMode?: BaseMode }): Promise<void>
    compareChangeRequest(folder: FolderAddress, number: number): Promise<void>
    openDialog(prefill?: { folder?: FolderAddress; base?: string; head?: string }): void
    swap(): void
    exit(): void
}
export { CompareButtonComponent, CompareHostComponent, ComparisonChipComponent, ChangesExplorerComponent, ComparisonLegendCaptionComponent }
export { provideChangesExplorerMode }
```

## Milestones

Every core task ends green on `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (run from `core/`); every renderer task on the checks of `00-overview-and-decisions.md` section 6. Tests are written first, named "should …" (Jest) / `snake_case` (cargo), with Arrange/Act/Assert comments. A milestone that changes the contract regenerates `visualization/app/codeCharta/model/coreApi/` with plan 01's command in the same commit.

### M0 — Spikes (S)

No production code. Record results in Notes and commit the fixtures under `core/crates/codecharta-core/tests/fixtures/hosting/`.

1. Run the `gh` commands of 7.2 against a public repository with open, draft, merged and fork PRs. Save raw output as `gh-pr-list.json`, `gh-pr-view.json`, `gh-pr-list-empty.json`. Record the `gh` version, the exit codes of `gh auth status` logged in and logged out, the `mergeCommit` shape, and `baseRefOid` of a merged PR versus its merge commit's first parent. Commit: `test(core): capture gh pull request fixtures`
2. Same for `glab` (7.3): JSON output flag, state filters, `-R`, auth-status exit codes, whether `diff_refs` is in list output. Save `glab-mr-list.json`, `glab-mr-view.json`. If `glab` cannot emit JSON for lists, GitLab ships with the number-entry fallback only; note it. Commit: `test(core): capture glab merge request fixtures`
3. On Windows: fetch a fork PR head into `refs/codecharta/pr/<n>` in a scratch clone; confirm the ref does not show in `git branch -a` or `git tag`, that `git worktree add --detach <path> <sha>` works on it, that a fetch against a remote that needs credentials reaches plan 04's prompt (after plan 01's askpass spike and plan 04's helper exist) and that Cancel ends it without a leftover process or partial ref. Confirm how `git diff --name-status -z` reports non-UTF-8 and non-ASCII paths on Windows.
4. Memory: load two snapshots of a large repository in delta mode in the desktop build, read the JS heap in DevTools, and set `COMBINED_BYTES_WARNING` / `COMBINED_BYTES_LIMIT` from the ratio of heap to `map.bytes`.

Acceptance: fixtures exist; every UNVERIFIED item in this plan is either confirmed or rewritten.

### M1 — Compare core: commit vs commit (L)

Core first, then the renderer.

1. (core) Contract and pure parts. Add `compare.rs` / `hosting.rs` types to `codecharta-core-api` (only those M1 uses), `compare/preflight.rs`, and regenerate the TypeScript contract. Unit tests: `marks_a_side_missing_without_a_snapshot`, `reports_identical_when_checksums_are_equal`, `blocks_when_combined_size_exceeds_the_limit`, `flags_differing_profiles`. Commit: `feat(core): add comparison contract and preflight`
2. (core) `git/compare.rs::merge_base` (exit 1 → `None`) and `compare/resolve.rs` for `Commits`, `WithParent`, `WithCurrent`, with `compare/sides.rs` over fake `SnapshotLookup`. Integration tests in `core/crates/codecharta-core/tests/compare_resolve.rs` on temporary real repositories (deterministic `GIT_AUTHOR_*`/`GIT_COMMITTER_*` names, dates and config): `takes_the_ancestor_as_base`, `takes_the_older_commit_as_base_when_diverged`, `reports_same_commit`, `refuses_the_parent_of_a_root_commit`, `reports_stale_by_for_the_nearest_snapshot`, `returns_no_common_ancestor_for_unrelated_histories`. Commit: `feat(core): resolve commit comparisons`
3. (core) Register `compare.resolve` in `codecharta-cored/src/rpc/compare.rs` and the `compare resolve` subcommand. Tests: a protocol test in `tests/serve_compare.rs` driving `codecharta-core serve` over stdio (request line in, result line out, unknown folder → typed error), and a CLI test asserting `--json` output equals the RPC result. Commit: `feat(core): serve and expose compare resolve`
4. (renderer) Tidy first: prune `lastSetFilesOfPreviousMode` to files still in the store on every `files$` emission. Files: `features/navBar/services/fileSelectionMode.service.ts`, its spec. Tests: "should forget remembered files that were removed from the store", "should not put removed files back when leaving delta". Commit: `refactor(visualization): drop removed maps from remembered selection`
5. (renderer) Model, `comparisonText.ts` and specs; ports and store: `ports/compareGateways.ts` (`SnapshotGateway`, `CoreGateway`, `HostingGateway`, one `InjectionToken` each), `stores/*`, `ports/compareGateways.mocks.ts` (in-memory fakes). Tests: "should label a merge-base comparison with three dots", "should parse a two-dot range into base and head", "should be inactive when the selected checksums no longer match the comparison". Commit: `feat(visualization): add compare state and gateway ports`
6. (renderer) `CompareService.start` for "both snapshots exist". Tests with fake gateways and `provideMockStore`: "should dispatch setDelta with the base as reference and the head as comparison", "should find the files by checksum when their names sort head first", "should dispatch setDelta only after the pair is loaded", "should load only the head and report no differences when checksums are equal", "should fail with rootMismatch and show the head alone when root names differ", "should stop on a same-commit status", "should navigate to the metric view", "should switch a radial layout to the treemap and tell the user". Commit: `feat(visualization): orchestrate loading a comparison into delta`
7. (renderer) `swap` and `exit`. Tests: "should switch reference and comparison and swap the sides", "should select the head before removing the base when leaving", "should clear the comparison when leaving". Commit: `feat(visualization): swap and leave a comparison`
8. (renderer) Adapters to plans 03/05 and to the bridge, provided in `app/app.config.ts`; adapter specs against the fake bridge, which gains `compare.resolve` seeding. If plan 03's load path has no `rootName` override or does not report checksums, add it there with its own tests. Commit: `feat(visualization): connect compare to snapshots and the core`
9. (renderer) `CompareFacade`, `cc-comparison-chip`, nav bar wiring, the `FileSelectionModeService.toggle()` delegation. Tests: "should show both short commits and their ref names", "should show the delta selector for uploaded files", "should leave the comparison when Explore is chosen", "should leave the comparison when the domain view is opened". Commit: `feat(visualization): label project comparisons in the nav bar`
10. (renderer) Screenshot order in `model/files/files.helper.ts` + spec: "should name the reference before the comparison". Commit: `fix(visualization): name delta screenshots base before head`
11. (renderer) E2E `features/compare/e2e/compare.e2e.ts` + `compare.po.ts` in the web build with the fake bridge seeded with two snapshots (payloads: the bundled `sample1.cc.json` / `sample2.cc.json`): start through the UI available at this milestone (history context menu if plan 04 exposes it in the fake, otherwise a `data-testid="compare-recent-…"` entry seeded in localStorage), assert the chip text and that the inspector shows delta values and that the chosen metrics survive entering a comparison. Changelog under Added: "**Compare commits**: pick two commits of a project folder and see what changed between them." Commit: `test(visualization): cover commit comparison end to end`

Acceptance: with two analysed commits, `compareCommits` ends in delta mode with base as reference regardless of name order; leaving returns to the head alone with one map in the store; `codecharta-core compare resolve --json` prints the same resolution headless.

### M2 — Entry points (M)

1. (core) Branch intents: `Branch` with `BaseMode` and default-branch targeting. Integration tests: `uses_the_merge_base_by_default`, `uses_the_target_tip_in_tip_mode`, `targets_the_default_branch_when_the_current_branch_is_compared`, `reports_a_branch_that_is_already_merged`. Commit: `feat(core): resolve branch comparisons`
2. (core) `Explicit` intents with `RefInput::Rev` (branches, tags, SHA prefixes; ambiguous prefix → `compare.refNotFound`). Tests: `resolves_a_tag_and_a_unique_prefix`, `rejects_an_unknown_ref`. Commit: `feat(core): resolve explicit comparison sides`
3. (renderer) `cc-ref-picker`. Tests: "should group branches, tags and commits", "should search commits after the debounce", "should mark refs that have an analysis", "should fill both sides from a pasted range". Commit: `feat(visualization): add a ref picker`
4. (renderer) `cc-compare-dialog`, `cc-compare-host`, `cc-compare-button`, nav bar wiring. Tests: "should offer only git folders", "should show the base mode toggle for a branch base", "should start the comparison and close", "should hide the button without a project". Commit: `feat(visualization): add the compare dialog`
5. (renderer) `recentComparisons.repo.ts` and the Recent tab. Tests: "should keep the ten most recent comparisons per project", "should not store a comparison twice", "should survive unreadable storage". Commit: `feat(visualization): remember recent comparisons`
6. (renderer) History entry points in plan 04's feature: two-commit selection → **Compare**; commit menu → **Compare with parent**, **Compare with current**, **Compare with…**; branch menu → **Compare with `<target>`**. Tests: "should offer Compare when two commits are selected", "should disable Compare with parent for a root commit". Commit: `feat(visualization): compare from the commit history`
7. (renderer) Chip menu **Change…**, **Copy as text**, **Leave compare**. Test: "should copy the range and the pull request link". Commit: `feat(visualization): add chip actions for comparisons`
8. Docs: extend the e2e (open the dialog, pick two refs, compare); update `gh-pages/src/content/docs/docs/visualization/user-controls/compare.md` with "Comparing commits in the desktop app"; rewrite the M1 changelog entry to cover branches and the dialog. Commit: `docs(visualization): document comparing commits and branches`

Acceptance: every row of the section 4 table except PRs, working-tree and imported is reachable in the app and produces the stated base and head.

### M3 — Missing snapshots and staleness (M)

1. (renderer) `CompareService` paths for missing sides. Tests: "should ask for a decision when the base has no snapshot", "should analyse only the missing side", "should resolve again and load the pair after both analyses finish", "should offer the nearest snapshot when an analysis fails", "should stop without loading when the batch is cancelled", "should record stale-by per side when the nearest snapshot is used", "should refuse the nearest snapshots when both sides resolve to the same one", "should warn when the two analysis profiles differ". Commit: `feat(visualization): prepare missing analyses for a comparison`
2. (renderer) `cc-compare-preparation` with the combined progress list. Tests: "should list each side with its status", "should show one progress row per running analysis", "should disable Use nearest when a side has none". Commit: `feat(visualization): show analysis progress for a comparison`
3. (renderer) Chip staleness badges and size-guard texts. Tests: "should show how stale each side is", "should ask before comparing two large analyses", "should block a comparison above the size limit". Commit: `feat(visualization): show staleness and size limits when comparing`
4. (renderer) E2E with the fake bridge: head not analysed → "Use nearest" → chip shows "stale by 2". Commit: `test(visualization): cover comparing with a stale analysis`

The core side (nearest snapshot, stale-by, size verdict) is covered in M1 task 2; add no core code here unless the M1 reconciliation with plan 05 shows a gap.

Acceptance: no entry point ends in an error merely because an analysis is missing; the chip always tells which commit is really shown.

### M4 — Changed files (M)

1. (core) `parse_name_status` and `git/compare.rs::diff_name_status`, `compare/changed_files.rs`, method `compare.changedFiles`, CLI `compare changed-files`. Unit tests: `parses_added_modified_and_deleted`, `parses_a_rename_with_similarity_and_both_paths`, `keeps_paths_with_spaces_and_non_ascii_characters`; integration tests in `tests/changed_files.rs`: `reports_paths_relative_to_a_subfolder`, `returns_unavailable_when_no_clone_has_both_commits`, `uses_the_head_folder_clone_when_only_it_has_both`. Commit: `feat(core): list changed files between two commits`
2. (renderer) Tidy first: multi `EXPLORER_CONDITIONAL_MODES` and the active-mode guard in `ClusterExplorerComponent`. Files: `features/sidebarExplorer/explorerCapabilities.ts`, `services/explorerMode.service.ts`, `features/clusterExplorer/provideClustersExplorerMode.ts` (+ spec), `components/clusterExplorer/*`. Tests: "should offer the modes of every provider", "should render only while the clusters mode is active". Commit: `refactor(visualization): allow several conditional explorer modes`
3. (renderer) `changedFileRows.ts`, `deltaChangeSummary.selector.ts`. Tests: "should map a git path to its node path", "should mark a path without a node", "should fall back to metric changes when the core reports Unavailable", "should sum added, removed and changed from the delta root". Commit: `feat(visualization): derive change rows and summary`
4. (renderer) `ChangesExplorerComponent`, `provideChangesExplorerMode`, wiring in `views/metricsView/metricsView.component.ts|.html`. Tests: "should offer the Changes mode only during a project comparison", "should select the node when a row is clicked", "should focus the parent folder", "should show which source the list comes from". Commit: `feat(visualization): show changed files in the explorer`
5. (renderer) `changedFilesFilter` slice and matcher (files per section 8, plus state mocks defaults). Tests: reducer spec; `changedFilesMatcher.spec.ts` "should grey a file git did not change", "should keep a file with metric changes", "should match nothing without a filter"; `flattenPredicate` spec "should flatten unchanged leaves while the filter is on"; `renderCodeMap.effect.spec.ts` "should re-render when the filter changes"; a `LoadInitialFileStore` spec "should not report the filter as missing from a saved session". Commit: `feat(visualization): add a changed-files map filter`
6. (renderer) Toggle in the Changes header; clearing on start, exit and deactivation. Tests: "should set the git filter with node paths", "should clear the filter when the comparison ends". Commit: `feat(visualization): filter the map to changed files`
7. (renderer) E2E: Changes mode lists the fake's changed files; toggling the filter is asserted through a visible effect (summary line and a flattened-count test id). Changelog under Added: "**Changed files**: while comparing, the explorer lists the files that changed and can grey out everything else." Verify a 20 000-file diff stays responsive. Commit: `test(visualization): cover the changed files list`

Acceptance: in a comparison the Changes tab lists exactly the files of `git diff --name-status`, clicking selects the building, and the filter greys every other building; leaving the comparison restores the map.

### M5 — PRs and merge requests (L)

1. (core) `hosting/remote_url.rs`, `detect.rs`, `slug.rs`, `hosting.status`. Unit tests: `reads_host_and_repository_from_an_https_remote`, `…_from_an_scp_style_remote`, `…_from_an_ssh_url_with_a_port`, `keeps_gitlab_subgroups`, `never_returns_credentials_embedded_in_a_url`, `prefers_upstream_over_origin`, `honours_a_folder_override`, `guesses_the_provider_from_the_host_name`, `rejects_a_slug_that_looks_like_a_flag`. Commit: `feat(core): detect the hosting provider of a folder`
2. (core) `hosting/github.rs`: command builder, `parse_gh_pull_requests` against the M0 fixtures, auth state. Tests with a fake `gh` executable from the test support (replays fixtures chosen by environment variable; UNVERIFIED how the support builds a cross-platform fake, plan 01 decides) in `tests/hosting_github.rs`: `maps_every_fixture_field`, `marks_a_full_page_as_truncated`, `reports_not_installed_when_gh_is_missing`, `reports_not_authenticated_on_a_failing_auth_status`, `never_requests_a_token`, `sets_the_non_interactive_environment`. Commit: `feat(core): list GitHub pull requests through gh`
3. (core) `hosting/cache.rs`, `hosting.listChangeRequests`, `hosting.getChangeRequest`, CLI `hosting list`, fake bridge data. Tests: `serves_a_second_request_from_the_cache`, `bypasses_the_cache_on_forced_refresh`, `shares_one_in_flight_request`, `rejects_a_folder_that_is_not_in_the_project`. Commit: `feat(core): serve pull request lists with a cache`
4. (core) `hosting/fetch.rs`, `hosting.fetchChangeRequestHead`, `HeadNotLocal` and PR base choice (7.4) in `resolve`. Integration tests with a local bare repository carrying `refs/pull/7/head` (`git update-ref`) in `tests/fetch_change_request.rs`: `fetches_the_head_into_the_private_namespace`, `reports_a_number_that_does_not_exist_on_the_remote`, `does_not_create_a_branch_or_tag`, `rejects_a_remote_that_is_not_configured`, `cancels_a_running_fetch`; in `compare_resolve.rs`: `uses_the_merge_base_of_the_recorded_base_and_the_head`, `falls_back_to_the_base_branch_tip`, `asks_to_fetch_a_head_that_is_not_local`, `reports_a_merged_pull_request_whose_base_equals_its_head`. Commit: `feat(core): fetch pull request heads into a private ref`
5. (renderer) `adapters/hostingGateway.adapter.ts`, `ChangeRequestsStore`, `compareChangeRequest`, fetch-then-re-resolve. Tests: "should ask to fetch a head that is not local", "should prefer the fetched commit when it differs from the list", "should re-resolve after the fetch". Commit: `feat(visualization): resolve pull request comparisons`
6. (renderer) `cc-change-request-list`, the PR tab, the empty states of 7.5, the number-entry fallback, the PR badge in the chip, PR rows in the ref picker. Tests: one per empty state, "should list fork pull requests with a badge", "should compare by number without a CLI". Commit: `feat(visualization): compare pull requests`
7. (renderer) Host override UI writing `hosting` onto the folder. Test: "should treat an overridden host as GitHub Enterprise". Commit: `feat(visualization): map custom hosts to a provider`
8. (core) `hosting/gitlab.rs` against the M0 fixtures (or the fallback-only variant decided in M0); tests mirror task 2. Commit: `feat(core): list GitLab merge requests through glab`
9. Docs and changelog under Added: "**Compare pull requests**: pick a pull or merge request of a project folder and see what it changes; the list comes from your own `gh` or `glab` login." Extend `compare.md`. Commit: `docs(visualization): document comparing pull requests`

Acceptance: with `gh` logged in, the PR tab lists open PRs of a GitHub folder and one click reaches delta mode with base = merge base; with `gh` absent, entering a number works after a fetch; no code path reads, stores or logs a token.

### M6 — Polish and stretch (M)

1. (renderer) `cc-comparison-legend-caption` in `features/legend/components/legendPanel/legendDeltaColorsSection.component.html|.ts`. Test: "should name base and head during a project comparison". Commit: `feat(visualization): caption the delta legend with both commits`
2. (core + renderer) Cross-folder comparison: core `Explicit` with two folders (`has_commit` probing, tip fallback), second folder select, limits text. Core tests: `compares_the_same_commit_of_two_folders`, `falls_back_to_tip_when_no_clone_has_both_commits`; renderer: "should compare the same commit of two folders as identical", "should fall back to metric changes when no clone has both commits". Commit: `feat(core): resolve comparisons across two folders` and `feat(visualization): compare two folders of a project`
3. (core + renderer) Working-tree and imported sides per the last rows of the section 4 table: `RefInput::WorkingTree|Imported`, `SideStatus` by `snapshot_id`, no merge base, `Unavailable` changed files; chips without a stale badge, metrics-only Changes tab, picker group "Snapshots". Core tests: `compares_a_commit_snapshot_with_the_working_tree_snapshot`, `compares_against_an_imported_snapshot`, `does_not_compute_a_merge_base_for_a_side_without_a_commit`; renderer: "should list changed files from metrics when a side has no commit". Commits: `feat(core): compare against working-tree and imported snapshots`, `feat(visualization): compare against a working-tree or imported snapshot`
4. (stretch) Inspector: git status line for the selected file (`renamed from src/old.ts`). Commit: `feat(visualization): show a file's git change in the inspector`
5. (stretch, core) `hosting.removeFetchedRefs` (`git for-each-ref refs/codecharta` + `git update-ref -d`) and a folder-menu action. Test: `removes_only_refs_under_the_private_namespace`. Commit: `feat(core): clean up fetched pull request refs`
6. (stretch) Rename-aware delta per the assessment in section 8; write a dated working plan in `dev_docs/studio/agents/progress/` first because it changes the file store. No commit planned here.

## Repo rules that bite here

- **Core gates.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` from `core/`; no `unwrap()` on user-derived data; every child process through `ToolRunner` with an argument vector; tests use temporary real git repositories with deterministic author/committer environment and never touch the developer's git config (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM`; UNVERIFIED names on the pinned git, confirm in M0). The generated TypeScript contract must be regenerated and committed in the same commit as any contract change; CI fails on drift.
- **Commits.** Core work `<type>(core): <subject>` (the `core` scope is added to `commitlint.config.js` by plan 01); UI work `<type>(visualization): <subject>`; subject at most 72 characters; structural commits before behavioural ones. This plan adds no npm dependency; Cargo dependencies per the candidate list in section 3, versions confirmed with cargo.
- **dependency-cruiser (Angular side).** `feature-no-external-access-to-internals` / `feature-cross-feature-only-via-public-api`: navBar, gitHistory, legend and the metrics view import only `features/compare/facade.ts`. `feature-no-circular-dependencies-between-features`: `compare` must not import `navBar` or `gitHistory` — leaving compare is implemented in `CompareService` and `FileSelectionModeService` delegates to it. `feature-only-stores-can-import-ngrx-store`: only `features/compare/stores/*` and `selectors/*` import `@ngrx/store`. `sidebar-explorer-is-view-agnostic`: `features/sidebarExplorer` may not import sharedView, mapState or renderer, so the multi-provider change stays generic and every Changes-specific read lives in `features/compare`. `display-components-cannot-dispatch`. `feature-services-not-to-components`: services open dialogs by setting store signals that `cc-compare-host` reads. `lens-no-view-state`: the filter is read in `renderer/renderModel`, never in `lenses/structure`. `util-is-a-leaf-kernel`: `util/nodeRules/changedFilesMatcher.ts` imports only `model/` and `util/`. `wire-dto-only-in-filestore-boundary`: the compare feature never imports `model/codeCharta.api.model.ts`; bytes go through plan 03's loader. The generated `model/coreApi/` types are imported through the feature's own `model/` re-export.
- **Biome.** `State` from `@ngrx/store` only in `stores/**`; no `forEach`; block statements; no `console.log`; names longer than two characters; methods under 25 lines — split `CompareService.start` into one private method per phase. Run root `npm run format` before each commit.
- **knip.** Every export of `facade.ts`, the ports and the re-exported contract types must have a consumer in the same commit; add an export in the commit that first uses it. Mock gateways live in `*.mocks.ts`, which production code may not import (`no-prod-import-of-mocks`).
- **Coverage (80 % global).** Applies to the Angular side only. The feature adds many small files; each pure helper and store gets its spec in the same commit. The core has no percentage gate; its tests are listed per task.
- **Persistence.** The only `CcState` change is `sharedView.changedFilesFilter`, added to `transientSharedViewKeys`: no restore action, no entry in `actionsRequiringSaveCcState.ts`, no migration, no `DB_VERSION` bump. `tsc` points at every `SharedView` literal in mocks and specs that needs the new key. Recents use `LocalStorageRepo`. Do not add commit fields to `FileMeta`; labels live in `CompareStore`.
- **LENS_DATA_RULES.** No new clone of the node graph: `changedFileRows` and the summary read `accumulatedDataSelector`'s result without copying. The git path list is external data, so it may sit in the store; the metrics variant stores only its discriminator.
- **Zoneless / OnPush.** Bridge promises and notification callbacks must end in signal writes; no field mutation in `.then`.
- **Styling.** daisyUI/Tailwind classes only, native `<dialog>`, Font Awesome icons, no component stylesheet (`npm run lint:styles`).
- **E2E.** Selectors only in `compare.po.ts`, `data-testid` on new controls; build first (`npm run build && npm run e2e:ci`); the inline-script CSP hash must not change. The web suite uses the fake bridge; the Electron smoke suite of plan 01 is not extended here.
- **Changelog.** `visualization/CHANGELOG.md`, `[unreleased]` → `### Added 🚀`; one bold title plus one user-facing sentence; rewrite the existing entry when a later milestone extends the same capability.

## Manual verification

On Windows, packaged desktop build, with a project whose folder is a GitHub clone with at least one fork PR, and `gh` installed. Also run `codecharta-core compare resolve --json` for the same inputs from a terminal and compare with the UI.

1. Select two commits in the history → Compare. The chip reads `base <older> ⇄ head <newer>`; buildings show green/red tops; the inspector shows Δ values.
2. Swap in the chip: colours invert, labels swap. Leave compare: one map remains, and Task Manager shows the renderer's memory dropping after a few seconds.
3. Right-click a feature branch → Compare with main. The base in the chip is the merge base, not main's tip. Toggle tip vs tip and compare again: the base becomes main's tip.
4. Pick a commit with no analysis as head. The preparation dialog offers Analyse missing / Use nearest. Run both variants; with Use nearest the chip shows "stale by N" with the right N (`git rev-list --count`).
5. Cancel a running analysis from the preparation dialog; the app returns to the previous map and `git worktree list` shows no leftover after `git worktree prune`.
6. Compare two commits that differ only in a README: "No metric differences…" and the Changes tab lists the README from git.
7. Changes tab: counts match `git diff --name-status -M <base> <head>`; click a row → the building is selected; "Only changed files" greys the rest; with "hide flat buildings" on they vanish; leaving compare restores the map.
8. PR tab: the list matches `gh pr list`. Open a fork PR: "Fetch from origin" appears, then the comparison loads. `git for-each-ref refs/codecharta` shows the ref; `git branch -a` does not.
9. `gh auth logout`, refresh the PR tab: the sign-in hint appears; entering the PR number still works. Rename `gh.exe` away from PATH: the install hint appears.
10. Switch to the radial layout, start a comparison: the layout switches to treemap with a toast. Open the Domain view while comparing: compare is left with the existing toast and one map remains.
11. Take a screenshot in compare: the file is named `delta_<base>_<head>_map.png`.
12. Restart the app: no comparison is active, the Recent tab lists the earlier ones and one click restores one. Kill the core process during a comparison: the UI shows the retry state, and after the core restarts a retry works.
13. Start the web build (`npm run dev`): no Compare button; uploading two files and using Explore/Compare works as before with the old delta selector.

## Out of scope

- Delta for the radial, dependency and domain views, edge or cluster deltas, a color-metric delta.
- Creating working-tree or imported snapshots (plans 03 and 05 own that); this plan only compares them once they exist.
- More than two sides, or a timeline / animation across commits.
- Calling the GitHub or GitLab HTTP APIs, storing tokens, starting a CLI login, posting comments or statuses to a PR.
- Bitbucket, Azure DevOps, Gitea.
- A URL scheme or deep link that opens the app on a comparison.
- An analysis-side diff (`ccsh` has none) and incremental analysis of the missing side.
- Persisting the PR list or restoring the active comparison across restarts.

## Risks and unknowns

| Risk | Resolution |
|---|---|
| `gh` JSON fields or exit codes differ by version | M0 task 1; the parser is written against captured fixtures; unknown fields are ignored, optional ones become `None` |
| `glab` cannot list as JSON or lacks `diff_refs` in lists | M0 task 2; fallback to number entry for GitLab, `base_commit` filled on demand |
| `baseRefOid` of a merged PR is not the merge-time base | M0 task 1; if so, use the first parent of `mergeCommit` (already requested in the field list) |
| Plans 01/03/04/05 name or shape their core or renderer APIs differently | all use is confined to `compare/ports.rs`, `hosting/ports.rs` and three adapter files; reconcile at the start of M1 and update "Required from other plans" |
| Plan 03's loader cannot force a root name or report checksums | M1 task 8 adds it there with tests; without it cross-folder comparison (M6) is dropped, same-folder still works |
| Plan 03/05 unload with `removeFiles` down to an empty list | the reducer writes a file-less entry; M1 task 8 verifies the loader replaces by load-then-remove or one `setFiles`, and fixes it if not |
| `git fetch` needs credentials | plan 04's prompt path through the core's askpass; 300 s timeout, cancel, `git.fetchFailed` with git's first stderr line; depends on plan 01's askpass spike (UNVERIFIED there); M0 task 3 re-checks on this plan's fetch |
| Fetching writes a ref and objects into the user's `.git` | accepted by the owner (D5 amendment, `00-overview-and-decisions.md` section 7); only on an explicit click; private namespace; cleanup action in M6 |
| A working-tree or imported side has no commit | `SideKind` and `snapshot_id`; no merge base, no git list, metrics-based Changes tab (section 4) |
| Fake `gh` / `glab` executables on Windows in cargo tests | plan 01's test support decides the mechanism (a small helper binary is the candidate); M5 task 2 does not start before it exists |
| Core process dies or is restarting while a comparison is being prepared | `coreUnavailable` error state with retry; the resolve call is idempotent and side-effect free |
| Two-map delta exhausts the heap | preflight guard, thresholds from M0 task 4; unload on exit; pruning in `FileSelectionModeService` |
| Thousands of changed paths in the filter | paths are held once in the store and turned into a `Set` inside the memoized selector; the list is virtualised; verified with a 20 000-file diff in M4 |
| The reconcile effect (`load/effects/reconcileAfterLoad`) reacts to the selection change after `setDelta` and resets focus or metrics | covered by the `LoadInitialFileStore.setRenderState` precedent (same dispatch order); e2e assertion in M1 task 11 |
| Different analysis profiles on the two sides produce misleading deltas | `profiles_differ` in `Preflight`; the preparation dialog warns (M3 task 1) |

## Decisions taken by the owner

1. **Missing analysis:** ask each time, "Analyse missing" primary, "Use nearest" alternative; never auto-analyse.
2. **PR heads:** the app may fetch them into `refs/codecharta/pr/<n>` (GitLab `refs/codecharta/mr/<n>`), only after an explicit click; credentials come through plan 04's prompt and are never stored.
3. **After leaving a comparison:** the head side alone.
4. **Which PRs are listed:** open ones, newest first, up to 100, with a filter for merged and all; listing uses the user's own `gh` / `glab` login.
5. **Branch comparison default:** merge base (three-dot), last toggle remembered per project.
6. **Restore the active comparison on restart:** no; one click in Recent.
7. **GitLab:** full merge-request support is wanted; if `glab` has no JSON list output (M0 task 2) the list falls back to the number entry until a parser exists, and that gap is recorded in Notes.
8. **Staleness:** non-modal banner plus a persistent chip (the chip of section 9).
9. **Working tree / imported snapshot** can be compared against a commit snapshot where both exist (section 4).

## Notes

(Implementer: record spike results, renamed APIs and deviations here.)
