# 05 — Commit analyses, snapshot records and "stale by N commits"

- **Status:** draft
- **Depends on:** `01-core-and-desktop-shell.md` (core process, JSON-RPC, process runner, tools check, contract generation, fake bridge), `03-projects-and-managed-store.md` (store, project/folder model, analysis profile, project map loading), `04-git-branches-and-history.md` (git service, commit list, selected commit, badge ports). See "Required from other plans".
- **Unlocks:** `06-compare-commits-and-prs.md` (needs `snapshots.*`, `analysis.enqueueBatch`, `snapshots::nearest`, `SnapshotViewService`, `LoadedSnapshotRegistry`).
- **Estimated size:** M0 S · M1 M · M2 M · M3 M · M4 M · M5 L · M6 M · M7 S

## Goal

The user can analyse the current checkout or any commit of a project folder, from the app or from the command line; every run lands in the managed store as a snapshot that records the git and hosting state it was taken at. Selecting a commit or switching branch shows that commit's snapshot when it exists, and otherwise the nearest analysed commit with a visible, dismissible notice ("stale by N commits") and a one-click "Analyse now". Running analyses show progress, can be cancelled, can be queued in batches, and the store can be inspected and cleaned up. All of this logic lives in the headless Rust core (`core/`); the Angular app only presents it.

## Current state

All paths are repo-relative. Everything below was confirmed by opening the file, unless marked UNVERIFIED.

### The two unknowns, resolved

**(a) `ccsh analyse --commit` does NOT write `meta.commitHash` (ccsh 2.4.0).**
- `analysis/analysers/tools/AnalyseTool/src/main/kotlin/de/maibornwolff/codecharta/analysers/tools/analyse/AnalyseTool.kt` l.135-148 `requestFor` puts `checkout.shortHash` into `AnalyseRequest.commitHash`. Its only reader is `HistoryFinder.kt` l.24 (`request.commitHash != null && versionControl == VersionControl.SVN` → skip svn); `CodebaseAnalysis.kt` never reads it.
- `CodebaseAnalysis.writeMap` (l.89-99) → `ProjectSerializer.serializeToFileOrStream` → `ProjectToCcJsonV2Mapper.writeProject(project, out)` whose `commitHash` defaults to `project.commitHash` (`analysis/model/.../serialization/ProjectToCcJsonV2Mapper.kt` l.49). `project.commitHash` can only be non-null if an input project had one (`ProjectMerger.kt` l.74); the per-parser maps are produced in-process without `--commit`, and no parser calls `withCommitHash` (grep over `analysis/**/main` finds only `ProjectBuilder.kt` and `ProjectMerger.kt`).
- Consequence: the commit is recorded **only** in the output file name prefix. The core records the commit itself in `snapshot.json` and never reads `meta.commitHash`.

**(b) Root node name and `meta.projectName` are identical for `--commit` and plain runs: root is always `root`, `projectName` is always the empty string.**
- `analysis/model/src/main/kotlin/de/maibornwolff/codecharta/model/ProjectBuilder.kt` l.9 default nodes `listOf(MutableNode("root", NodeType.Folder))`; l.146 `projectName = DUMMY_PROJECT_NAME` (`""`). Parsers insert files by path relative to the analysed folder (`UnifiedParser/.../ProjectScanner.kt` → `projectBuilder.insertByPath`), so neither the folder name nor `codecharta-worktree-XXXX` appears in the tree. `ProjectToCcJsonV2Mapper.buildMeta` writes `projectName = project.projectName`.
- Visualization: `visualization/app/codeCharta/stores/fileStore/loaders/ccJson/util/ccJson2/ccJson2ToCCFile.ts` `mapCcJson2ToCCFile` builds the map from `file.files[0]`, so `CCFile.map.name === "root"` for every ccsh map; the delta requirement `reference.file.map.name === comparison.file.map.name` (`visualization/app/codeCharta/lenses/structure/store/structureTree.selector.ts`) holds for any two ccsh snapshots. Only imported third-party maps can differ. Display names come from the folder label (D7), not `meta.projectName`.

### ccsh process contract

- **Arguments** (`AnalyseTool.kt`): `analyse [FOLDER] -o/--output-file <file> -e/--exclude <csv> --without <csv> --local-changes --commit <REF> --author-ownership --with-author-names --commit-changes-since <date> -p/--parallel -nc/--not-compressed -q/--quiet`. `--commit` and `--local-changes` are mutually exclusive. `-e` and `--without` split on commas (`CommaSeparatedParameterPreprocessor`).
- **Output file name** (`AnalyseTool.outputFileFor`, `CommitAnalysisContext.resolveOutputFile`, `OutputFileHandler.checkAndFixFileExtension`): with `--commit` the file **name** (not the directory) is prefixed `<shortHash>.`; then `.gz`, `.json`, `.cc` suffixes are stripped and `.cc.json` + `.gz` appended. `-o D:\x\map` → `D:\x\map.cc.json.gz`; with `--commit` → `D:\x\<short>.map.cc.json.gz`. `shortHash` is `git rev-parse --short <fullHash>` (`GitWorktreeManager.shortCommitHash`), length chosen by git.
- **`Map:` line** (`CodebaseAnalysis.run` l.35): exactly `Map: ${request.outputFile.path}` on **stdout**, after a blank line, a 72-character `─` separator, `Analysis done: <N> files with <sources>` and a blank line. The path is as given to `-o` (absolute if absolute) with prefix and extension applied. An optional `Not in the map:` block of `  <source>: <reason>` lines follows.
- **Exit codes**: `AnalyseTool` `SUCCESS = 0`, `FAILURE = 1`; failure text goes to **stdout** (`guarded`/`failure`): the `AnalysisException` message verbatim (`The folder X does not exist.`, `No parser applies to X, so there is nothing to map.`, `--commit and --local-changes are mutually exclusive.`, `--without does not know X. …`) or `ccsh analyse failed: <message>`. Exit 2 is picocli's argument error (UNVERIFIED by running).
- **Java too old** (`analysis/ccsh/src/launcher/java/.../CcshLauncher.java`): prints `ccsh needs Java 22 or newer, but was started with Java N from <java.home>.` + a second line to **stderr**, exit **1**. Below Java 17 the JVM rejects `--enable-native-access` first (comment in `analysis/ccsh/build.gradle.kts`).
- **Interactive trap** (`analysis/ccsh/src/main/kotlin/de/maibornwolff/codecharta/ccsh/Ccsh.kt` `executeCommandLine`): interactive mode starts when args are empty, when **any** argument equals `-i` / `--interactive`, or when the first argument is not a known subcommand and does not start with `-`. `sanitizeArgs` rewrites upper-case letters before `=` in `--long` options into `-<lower>`.
- **Progress** (`analysis/model/src/main/kotlin/de/maibornwolff/codecharta/progresstracker/ProgressTracker.kt`): `System.err.print`, no newline, per update: `\r` + padding + ` <pct>% [` + `=`×pct + `>` + spaces×(100−pct) + `]` + padding + ` <parsed>/<total> <unit>, ETA: <HH:MM:SS|N/A>` + optional ` parsed file: <name>` + clearing spaces. Redrawn at most every 100 ms and always for the last item; nothing when `total == 0`. Under `-p` each analyser has its own tracker and they interleave on stderr; there is no tracker id.
- **`-q`** (`AnalysisConsole.whileAnalysing`) nulls `System.out`/`System.err` while analysers run: no progress at all. Without `-q` parser chatter (e.g. `Created Project with N leaves.` on stderr) appears.
- **Worktree** (`analysis/analysers/AnalyserInterface/.../commit/GitWorktreeManager.kt`): `Files.createTempDirectory("codecharta-worktree-")` (system temp), `git worktree add <tmp> <fullHash> --detach` in the repo root; cleanup is `git worktree remove <path>` without `--force` in a `finally` and a JVM shutdown hook. `CommitAnalysisContext.at` walks up to the first folder containing `.git` and analyses the same relative sub-path inside the worktree. Ref resolution: `git rev-parse <ref>`, falling back to `git log --before=<ref> -1 --format=%H`.
- **Git timeout** (`.../localchanges/GitCommandRunner.kt`): `git -c core.quotepath=off …`, stderr discarded, `GIT_TIMEOUT_MINUTES = 3`, but stdout is read to EOF **before** `waitFor`, so a hung git holding stdout is never timed out. The core needs its own watchdog.
- **History needs the repo root** (`VersionControl.isRootOf` = `File(folder, ".git").exists()`, `HistoryFinder.lookUp`); otherwise the reason is listed under `Not in the map:`.
- **Windows install** (`analysis/node-wrapper/`): `binScripts/global/ccsh.cmd` ends in `"%dp0%\node_modules\codecharta-analysis\public\bin\ccsh.bat" %*`; the local variant uses `"%dp0%\..\codecharta-analysis\public\bin\ccsh.bat" %*`. `ccsh.bat` is the Gradle `application` start script: `mainClass = "de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher"`, `applicationDefaultJvmArgs = ["--enable-native-access=ALL-UNNAMED"]`, patched to `set CLASSPATH=%APP_HOME%/lib/*` (`analysis/ccsh/build.gradle.kts`). The installed layout `public\lib\*.jar` is UNVERIFIED — spike M0.
- cc.json 2.x is written `meta` first (`writeProject` emits `{"meta":<metaJson>,` then the body; `FileDto` field order `id, name, type, …`, `analysis/model/.../serialization/dto/CcJsonV2.kt`). `meta.checksum` is the MD5 of the `{"files":…,"lenses":…}` body (`serializeBody`), independent of the commit.

### Visualization

- `visualization/app/codeCharta/model/domain.model.ts` l.128 `FileMeta { fileName; fileChecksum; apiVersion; projectName; exportedFileSize; repoCreationDate? }` is built in four places (`mapCcJson2ToCCFile`, `DeltaGenerator.getFileMetaData` in `util/deltaGenerator.ts` l.131, `AggregationGenerator` in `util/aggregationGenerator.ts` l.34) and flattened by `getExportCCFile` (`stores/fileStore/loaders/ccJson/util/fileParser.ts` l.17).
- `fileParser.ts` `addFile`: a file whose checksum is already loaded is **not added**; the existing entry is renamed. A name clash with a different checksum gets `_1`, `_2` before the first `.`.
- `stores/fileStore/store/files.reducer.ts` `removeFilesFromState` writes `newState[0] = { ...newState[0], selectedAs: Partial }` when nothing is selected and does not guard an empty list.
- `load/loadFiles.useCase.ts`: `loadFromUpload(readNameDataPairs)` is the only programmatic entry; `commit()` is private and must stay synchronous up to `filesLoaded`. `FilesLoadedSource = "url" | "indexedDB" | "sample" | "upload" | "reset"` (`stores/fileStore/store/filesLoaded/filesLoaded.actions.ts`).
- `features/shared/services/toast.service.ts` `ToastService.show(text, severity)` auto-dismisses after 5000 ms and carries no actions — it cannot host the stale notice.
- Shell template `views/codeCharta.component.html`: `<cc-error-dialog>`, `<cc-toast>`, then `<cc-nav-bar>`, `<router-outlet>`, `<cc-changelog-dialog>` inside `@if (isInitialized())`. Nav bar template `features/navBar/components/navBar/navBar.component.html`: `navbar-start` (logo, divider, folder button, delta/map selector), `navbar-center` (view switcher), `navbar-end` (settings button).
- Effect pattern for removed files: `features/localSource/effects/forgetFoldersOfRemovedMaps/forgetFoldersOfRemovedMaps.effect.ts` (`ofType(removeFiles)`), exported through `localSourceEffects` and spread into `provideEffects` in `visualization/app/app.config.ts`.
- Jest (`visualization/conf/jestUnit.config.json`) has `roots: ["<rootDir>/app"]` and the 80 % gate over `app/**/*.ts`; knip (`visualization/knip.jsonc`) analyses `app/**/*.ts` only.

## Design

### Required from other plans

The names below are the contract this plan assumes. If a delivered name differs, use the delivered one and record the mapping in Notes; if a piece is missing, implement it as specified here in the first milestone that needs it.

| From | Needed | Used for |
|---|---|---|
| 01 | Core: JSON-RPC router (register a handler per dotted method; params/results are `codecharta-core-api` types), `EventSink::emit(CoreEvent)` for notifications, `CoreError` with stable codes, graceful shutdown (stdin EOF / `core.shutdown`) | all RPC here |
| 01 | Core: `process::ProcessRunner::run(RunSpec { program, args, cwd, env, timeout, max_output_bytes, cancel: CancellationToken, on_stdout, on_stderr }) -> Result<RunOutput, RunError>` (no shell, stdin closed, process-tree kill on cancel/timeout, `RunError::{Timeout, Cancelled, ToolNotFound, Io}`; with callbacks the stream is NOT collected), `launch::plan_launch` for `.cmd`/`.bat` on Windows (refuses `"`, `%`, CR, LF), `hardened_env()` (`GIT_TERMINAL_PROMPT=0`) | every `git`, `gh`, `glab`, `ccsh` call |
| 01 | Core: `tools::ToolsService::{check, resolve}` → `ToolsReport { tools: Vec<ToolStatus>, can_use_git, can_analyse }` (states `ok`, `missing`, `failed`, `too_old`; minimums ccsh 2.2.1, java 22), honouring user-set paths and an override for tests (UNVERIFIED name: env `CODECHARTA_CCSH_PATH`) | preflight, launcher |
| 01 | Contract generation into `visualization/app/codeCharta/model/coreApi/` and its drift check; the Electron relay (method allow-list from the generated contract); `DesktopBridge` port (`DESKTOP_BRIDGE`, `null` on the web) with a generic typed `request(method, params)`, `onNotification(name, listener) → unsubscribe`, and the shell-side `readSnapshotMap(ref)` (resolves the path through core method `snapshots.mapLocation`, reads the file); `createFakeDesktopBridge` in `app/codeCharta/util/desktop/desktopBridge.mocks.ts`; cargo workspace gates; `core` in `commitlint.config.js` | UI, tests |
| 03 | Core: `store::StorePaths` (the only module that builds store paths), `ProjectStore::resolve_folder_path(project_id, folder_id)`, `Project`, `ProjectFolder` (label, kind git/plain, detached folders without path), `AnalysisProfile { exclude: Vec<ExcludePattern>, without: Vec<AnalyserName>, parallel }` (as built: no `extra_args`), `store::write_json_atomic`, `SnapshotRecord` (section 5 of the shared decisions; this plan adds the optional fields `analysis.target`, `git.tree`, `analysis.reused_from`), `FolderRef` / `SnapshotRef`, imported-snapshot records (`source: "imported"`, `analysis: null`, `imported: { at, originalFileName }`, optional commit binding) | records, argv |
| 03 | Renderer: `ProjectsFacade.activeProject` / `activeFolder`; `FilesLoadedSource` `"project"`; `FileMeta.projectSnapshot?: ProjectSnapshotOrigin`; `LoadFilesUseCase.loadProjectSnapshots(snapshots: ProjectSnapshotToLoad[], options?)` (loads the new map before dropping the old one, normalises the root name, reports `loaded` / `identicalContent` / `unreadable`); `features/projects/util/snapshotDisplayName.ts` (D7) | showing a snapshot |
| 04 | Core: `git::GitService` (`resolve_commit`, `count_commits`, `merge_base`, `is_ancestor`, `refs_pointing_at`, `status`, `refs`) plus a raw `run(repo, args)` and a streaming `rev_list`. UNVERIFIED: the streaming call and a raw `show --format` may be missing; add them to `GitService` in M2/M5 (test first) rather than spawning git elsewhere | git state, nearest |
| 04 | Renderer: `CommitSelectionService.selection` (exported from the `gitHistory` facade by the first plan that needs it, i.e. this one), a "working tree" selection (UNVERIFIED, add in M5 if absent), the repository-changed signal (HEAD / refs after fetch, switch, commit, pull, push), and the ports in `features/gitHistory/ports/`: `ANALYSED_COMMITS` (`markersFor(repo)` → `AnalysedCommitMarker { state: "analysed" \| "running" \| "failed"; isLoadedInMap }`), `COMMIT_ACTIONS` (`CommitAction { id; label; icon; hoverHint; isPrimary; isOfferedFor(selection); run(selection) }`), `LOADED_MAP_LOCATOR` (`nodePathOf(repo, repositoryRelativePath)`) | notice, badges |

`SelectedTarget` is this plan's view model over plan 04's selection: `{ folderId; kind: "commit"; sha; shortSha; subject } | { folderId; kind: "workingTree" }`. This plan never removes maps itself; `loadProjectSnapshots` loads before it drops.

### Decisions

1. **Which snapshot a loaded map is comes from plan 03's `FileMeta.projectSnapshot`; this plan adds only a feature-side registry for the extra facts.** `LoadedSnapshotRegistry` (signal service in `features/snapshots`) maps `snapshotId → { fileName, checksum, commit, shortCommit, dirty, imported }`, filled from the `loaded` list. Commit/dirty/imported facts are store-derived, not file source data (`visualization/LENS_DATA_RULES.md` rule 1), and `FileMeta` has four construction sites this plan does not touch.
2. **The notice is a non-modal banner plus a persistent nav-bar chip.**
3. **ccsh runs without `-q`** so progress is available; stdout and stderr are captured to `run.log`. The core parses only the `Map:` line, the `Not in the map:` block, failure lines and progress lines.
4. **On Windows the core starts Java directly instead of going through `ccsh.cmd` → `ccsh.bat`** (see "Launching ccsh"); plan 01's batch-file launch is the fallback.
5. **Analysis is never started implicitly.** Selecting a commit, switching branch, or committing / pulling / pushing only resolves and shows; analysing needs a click (or the CLI command).
6. **"Nearest" considers snapshots of every profile**; one whose `profileHash` differs from the project's current profile is flagged.
7. **Imported snapshots** have an unknown analysis time and possibly no commit. Staleness is measured in commits, so unknown time does not matter. A commit-bound import participates like any snapshot of that commit, flagged "imported". An unbound import never counts as nearest; the panel lists it under "Imported — analysis time unknown". Imports are never proposed by clean-up.
8. **After a commit, pull, push, fetch or branch switch the notice re-evaluates for the new HEAD**; nothing is analysed automatically.
9. **The core runs standalone.** The same `AnalysisService` backs `analysis.*` RPC and the CLI subcommands `analyse` and `snapshots`; the renderer is not required for any of it.

### Files

Core (Rust; crate `codecharta-core`, module paths relative to `core/crates/codecharta-core/src/`):

```
analysis/
  mod.rs  profile.rs  argv.rs  launcher.rs  output.rs  progress.rs
  runner.rs  janitor.rs  preflight.rs  queue.rs  service.rs  batch.rs
snapshots/
  mod.rs  repository.rs  map_head.rs  git_state.rs  hosting.rs  nearest.rs  retention.rs
```

Contract (crate `codecharta-core-api`, `core/crates/codecharta-core-api/src/`): `analysis.rs`, `snapshots.rs` (all types below, `serde` + `ts-rs` derives, `#[serde(rename_all = "camelCase")]`).

Binary (crate `codecharta-cored`, `core/crates/codecharta-cored/src/`): `serve/analysis_routes.rs`, `serve/snapshots_routes.rs` (handler registration; the plan's `rpc/` folder does not exist), `cli/analyse.rs`, `cli/snapshots.rs`.

Tests: unit tests in `#[cfg(test)] mod tests` beside each module; integration tests in `core/crates/codecharta-core/tests/` (`analysis_run.rs`, `snapshot_record.rs`, `nearest.rs`, `queue.rs`, `janitor.rs`, `ccsh_launch_windows.rs`) with `tests/common/` (temporary-repository builders `linear(n)`, `branchy()`, `unrelated()`, deterministic `GIT_AUTHOR_*` / `GIT_COMMITTER_*` dates and names, `GIT_CONFIG_NOSYSTEM=1`; reuse plan 04's if it exists); protocol test `core/crates/codecharta-cored/tests/serve_analysis.rs`.

Fake ccsh: a workspace crate `core/crates/fake-ccsh` (`publish = false`, binary `fake-ccsh`, no dependencies beyond `serde_json` and `flate2`). `tests/common` locates it as `fake-ccsh[.exe]` next to the test executable's `deps/` folder (`target/<profile>/`), and runs `cargo build -p fake-ccsh` once (`std::sync::Once`) when it is missing; works the same on Windows and unix. UNVERIFIED: whether `cargo test` at the workspace root already builds it (then the fallback never fires). It reads a scenario from the JSON file named by `FAKE_CCSH_SCENARIO` (`stdout[]`, `stderr_chunks[]`, `delay_ms`, `exit_code`, `write_map`, `hang`); with `write_map` it derives the output name exactly like ccsh (`-o` value, `<short>.` prefix with the first 7 characters when `--commit=` is present, `.cc.json.gz`), writes a tiny valid gzipped 2.1 map and prints the summary block with the `Map:` line. Tests inject it through `LaunchOverride::Executable(path)`; the protocol test uses the tools override from plan 01.

Renderer (all under `visualization/app/codeCharta/`):

```
features/snapshots/
  facade.ts
  model/snapshotView.model.ts
  services/analysisJobs.service.ts  snapshotCatalog.service.ts  loadedSnapshotRegistry.service.ts
  services/snapshotView.service.ts  snapshotBadgeProvider.service.ts  noticeText.ts
  effects/snapshots.effects.ts  effects/forgetRemovedSnapshots/forgetRemovedSnapshots.effect.ts
  components/snapshotChip/  snapshotNotice/  analysisJobsIndicator/  snapshotsDialog/  batchAnalysisDialog/  cleanupDialog/
  e2e/snapshots.e2e.ts  snapshots.po.ts
model/coreApi/            # generated; this plan's types arrive through plan 01's generation
```

### Contract (`codecharta-core-api`)

Types (signatures only; `Sha` and `SnapshotId` are newtypes that validate on deserialisation, so a malformed value is rejected at the RPC boundary):

```rust
pub struct Sha(String);            // ^[0-9a-f]{40}$|^[0-9a-f]{64}$ — as built: api `values::CommitSha`
pub struct SnapshotId(String);     // ^[0-9a-f]{40,64}-[0-9a-f]{8}$ | ^worktree-\d{8}T\d{9}Z-[0-9a-f]{8}$ | plan 03's ^imported-[0-9a-f]{16}$

#[serde(tag = "kind")] pub enum AnalysisTarget { Commit { sha: Sha }, WorkingTree }
pub enum JobState { Queued, Running, Done, Failed, Cancelled }
#[serde(tag = "mode")] pub enum JobProgress { Indeterminate, Determinate { percent: u8 } }

#[serde(rename_all = "kebab-case")]
pub enum AnalysisErrorCode {
    CcshNotFound, JavaNotFound, JavaTooOld, CcshTooOld, GitNotFound, FolderMissing, NotARepository,
    UnknownCommit, InvalidProfile, InvalidArguments, WorktreeFailed, GitTimeout, InteractiveTrap,
    AnalysisFailed, NoOutput, HeadMoved, Timeout, DiskFull, StoreWriteFailed,
}
pub struct JobError { pub code: AnalysisErrorCode, pub message: String, pub hint: Option<String> }

pub struct AnalysisJob {
    pub id: String, pub batch_id: Option<String>, pub project_id: String, pub folder_id: String,
    pub target: AnalysisTarget, pub profile_hash: String, pub state: JobState, pub progress: JobProgress,
    pub queued_at: String, pub started_at: Option<String>, pub finished_at: Option<String>,
    pub snapshot_id: Option<SnapshotId>, pub error: Option<JobError>,
}

#[serde(rename_all = "kebab-case")]
pub enum ProblemCode { /* every AnalysisErrorCode variant, plus */ NotRepoRoot, ShallowClone, LowDiskSpace }
pub enum Severity { Error, Warning }
pub struct PreflightProblem { pub code: ProblemCode, pub severity: Severity, pub message: String, pub hint: Option<String> }
pub struct PreflightResult { pub ok: bool, pub problems: Vec<PreflightProblem> }

#[serde(tag = "status")]
pub enum EnqueueResult { Queued { job }, AlreadyQueued { job }, AlreadyAnalysed { snapshot_id }, Rejected { problems } }

#[serde(tag = "kind")]
pub enum BatchSelection { Commits { shas: Vec<Sha> }, LastCommits { tip_sha: Sha, count: u16, first_parent_only: bool }, Tags }
pub struct BatchResult { batch_id: Option<String>, to_analyse: Vec<Sha>, already_analysed: Vec<Sha>, jobs: Vec<AnalysisJob>, estimated_duration_ms: Option<u64>, problems: Vec<PreflightProblem> }

pub struct SnapshotEntry {          // list/resolve item; carries plan 03's summary fields plus the analysis fields
    pub id: SnapshotId, pub project_id: String, pub folder_id: String,
    pub source: SnapshotSource,                  // Analysed | Imported
    pub target: Option<TargetKind>,              // None: imported without a commit
    pub commit: Option<Sha>, pub short_commit: Option<String>, pub subject: Option<String>, pub commit_date: Option<String>,
    pub dirty: bool, pub profile_hash: Option<String>,        // None: imported
    pub created_at: String, pub finished_at: Option<String>, pub duration_ms: Option<u64>,   // finished_at None: analysis time unknown
    pub original_file_name: Option<String>, pub map_bytes: u64, pub map_checksum: Option<String>, pub not_in_map: Vec<String>,
}

#[serde(tag = "kind")]
pub enum SnapshotResolution {
    Exact { snapshot: SnapshotEntry },
    Nearest { snapshot: SnapshotEntry, relation: Relation, behind: u32, ahead: u32 },   // Relation: Ancestor | Descendant | Diverged
    Latest { snapshot: SnapshotEntry },                                                  // non-git folder
    None,
}
pub struct StoreUsage { total_bytes: u64, folders: Vec<FolderUsage> }
pub struct PrunePolicy { keep_newest_commit_snapshots: u32, keep_newest_working_tree_snapshots: u32, keep_branch_tips_and_tags: bool }
pub struct PrunePlan { delete: Vec<SnapshotEntry>, keep: u32, freed_bytes: u64 }
// as built (05-M6): FolderUsage { folder_id, snapshot_count, bytes }; PrunePlan.delete: Vec<SnapshotSummary>;
// PruneResult { deleted: u32, freed_bytes: u64 }; BatchResult also has left_out: u32
```

`ancestor` is `behind = N, ahead = 0`; `descendant` is `behind = 0, ahead = N`; `diverged` carries both. The renderer words them accordingly.

JSON-RPC methods (params and result are `codecharta-core-api` types; `folder` = `{ projectId, folderId }`):

| Method | Params | Result |
|---|---|---|
| `analysis.preflight` | `folder`, `target` | `PreflightResult` |
| `analysis.enqueue` | `folder`, `target`, `force?` | `EnqueueResult` |
| `analysis.enqueueBatch` | `folder`, `selection`, `dryRun?` | `BatchResult` |
| `analysis.cancel` / `analysis.cancelBatch` | `{ jobId }` / `{ batchId }` | `null` |
| `analysis.list` | — | `AnalysisJob[]` |
| `analysis.clearFinished` | — | `null` |
| `snapshots.list` | `folder` | `SnapshotEntry[]` |
| `snapshots.resolveForCommit` | `folder`, `target` | `SnapshotResolution` |
| `snapshots.mapLocation` | `SnapshotRef` | `{ path }` (consumed by the Electron shell's map read only, never exposed to the renderer) |
| `snapshots.readLog` | `SnapshotRef` | `string` |
| `snapshots.delete` | `SnapshotRef`, `permanently` | `null` |
| `snapshots.usage` | `{ projectId }` | `StoreUsage` |
| `snapshots.planPrune` / `snapshots.prune` | `folder`, `policy` / `folder`, `snapshotIds`, `permanently` | `PrunePlan` / `PruneResult { deleted, freedBytes }` |

Notifications (core → renderer; payload `{ job: AnalysisJob }` unless noted): `analysis.queued`, `analysis.started`, `analysis.progress` (`{ jobId, progress }`, at most every 250 ms), `analysis.finished` (`snapshotId` set), `analysis.failed` (`error` set), `analysis.cancelled`; `snapshots.changed` (`{ projectId, folderId }`). Errors that are not job outcomes (unknown project, malformed id) are JSON-RPC errors with plan 01's `CoreError` codes. The renderer never sends a path, a ref name or an argv: ids resolve through the stores, `sha` is a validated `Sha`, counts are `1..=500` (`LastCommits.count` is capped at `MAX_BATCH_JOBS = 200`).

As built (05-M3): methods `analysis.preflight { projectId, folderId, target } -> PreflightResult`, `analysis.enqueue { projectId, folderId, target, force? } -> EnqueueResult`, `analysis.cancel { jobId } -> null`, `analysis.list {} -> { jobs }` (named wrapper, like `SnapshotList`), `analysis.clearFinished {} -> null`, `snapshots.readLog SnapshotRef -> { log }` — all renderer-callable; `snapshots.mapLocation` stays shell-only (03-M3). As built (05-M6): `analysis.enqueueBatch { projectId, folderId, selection, dryRun? } -> BatchResult { batchId, toAnalyse, alreadyAnalysed, leftOut, jobs, estimatedDurationMs, problems }` (params `EnqueueBatchParams`; `selection` tag `kind`: `commits { shas }`, `lastCommits { tipSha, count, firstParentOnly }`, `tags`) and `analysis.cancelBatch { batchId } -> null` (`BatchRefParams`), both renderer-callable. Notification payloads as above; `snapshots.changed` carries a `FolderRef`. Analysis progress uses its own `analysis.progress`, not plan 01's `core.progress`: a job outlives the `analysis.enqueue` request whose id `core.progress` would name. As built (05-M4): `analysis.readLog { jobId } -> { log }` (`JobRefParams`, `SnapshotLog`), renderer-callable, reads the log a failed job left in `.failed-<jobId>/run.log`; `NOT_FOUND` for an unknown job, one that did not fail, or after `analysis.clearFinished`. As built (05-M5): `snapshots.resolveForCommit { projectId, folderId, target } -> SnapshotResolution` (params `ResolveForCommitParams`), renderer-callable; an unknown project or folder is `NOT_FOUND`, a malformed sha `BAD_REQUEST`; it never enqueues.

### Building the argv (`analysis/argv.rs`, `analysis/profile.rs`)

```rust
pub struct ValidProfile { /* normalised, validated */ }
pub fn validate_profile(profile: &AnalysisProfile) -> Result<ValidProfile, AnalysisError>;
pub fn profile_hash(profile: &ValidProfile) -> String;   // first 8 hex of SHA-256 over JSON {exclude: sorted+deduped, extraArgs: [], without: sorted+deduped}; `parallel` is not hashed

pub struct AnalyseArgvInput<'a> { pub folder_path: &'a Path, pub output_base: &'a Path, pub profile: &'a ValidProfile, pub commit: Option<&'a Sha> }
pub fn build_analyse_argv(input: &AnalyseArgvInput<'_>) -> Result<Vec<OsString>, AnalysisError>;
```

Result, in order: `analyse <folder_path> -o <output_base> -p [--without=<csv>] [--exclude=<pattern>]… [extra_args…] [--commit=<sha>]`. Rules (error `InvalidProfile` / `InvalidArguments`, each with a test):
- `folder_path` and `output_base` are absolute; `output_base` is `<jobTempDir>/map` (no extension; ccsh appends `.cc.json.gz`).
- `commit` is a full lower-case sha that `git cat-file -e <sha>^{commit}` confirmed. Branch names, tags, `HEAD~n` and dates are resolved to a sha by the caller and never reach ccsh.
- `without` entries ⊆ `rawtextparser, unifiedparser, dependencyparser, domainlanguageparser, git, svn` — as built this is the closed enum `AnalyserName`, so an unknown entry (including `gitlogparser`) is rejected on deserialisation and there is nothing to normalise.
- `exclude` entries are non-empty, contain no comma (ccsh splits on commas), no NUL, no line break.
- (Not built: plan 03's `AnalysisProfile` has no `extra_args`; `parallel` decides `-p`.) `extra_args` entries must match `^--author-ownership$`, `^--with-author-names$` or `^--commit-changes-since=\d{4}-\d{2}-\d{2}$`. Everything else is rejected — in particular `-i`, `--interactive`, `-o`, `-q`, `-nc`, `--commit`, `--local-changes`, `-h`. No element may equal `-i` / `--interactive` (belt and braces for the interactive trap).

### Launching ccsh (`analysis/launcher.rs`)

```rust
pub enum LaunchMode { JavaDirect, Executable, CmdShim }
pub struct CcshLaunch { pub command: PathBuf, pub prefix_args: Vec<OsString>, pub env: BTreeMap<String, String>, pub mode: LaunchMode }
pub struct LaunchOptions { pub worktree_temp_dir: Option<PathBuf>, pub override_: Option<LaunchOverride> }
pub enum TargetOs { Windows, Unix }   // explicit so the Windows logic is unit-testable everywhere
pub fn resolve_ccsh_launch(tools: &ToolsReport, os: TargetOs, options: &LaunchOptions) -> Result<CcshLaunch, AnalysisError>;
```

1. **`JavaDirect` (default on Windows).** From the resolved ccsh path: if it ends in `.cmd`, read it and take the quoted `…\ccsh.bat` path, substituting `%dp0%` / `%~dp0` with the script's folder; if `.bat`, use it. `APP_HOME` = parent of the `.bat`'s `bin` folder; require `APP_HOME\lib` to contain at least one `.jar`. `command` = `%JAVA_HOME%\bin\java.exe` when `JAVA_HOME` is set and the file exists, else the path from `ToolsService`; `prefix_args` = `--enable-native-access=ALL-UNNAMED`, `-Dstdout.encoding=UTF-8`, `-Dstderr.encoding=UTF-8`, `-Djava.io.tmpdir=<worktree_temp_dir>` when set, `-classpath`, `<APP_HOME>\lib\*`, `de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher`. No shell is involved, so spaces, `&`, `%`, `^` and quotes in paths need no escaping.
2. **`Executable`** (macOS/Linux, or a user-set ccsh that is neither `.cmd` nor `.bat`): run the file itself with `CCSH_OPTS="-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8"`.
3. **`CmdShim` (Windows fallback when the layout cannot be resolved).** Run the shim through plan 01's `plan_launch` (`cmd.exe /d /s /v:off /c "…"`), which refuses `"`, `%`, CR and LF in any argument; no second quoting routine here. A refused argument fails the job with `InvalidArguments` and the hint "set the ccsh path to the ccsh.bat inside codecharta-analysis, or rename the folder". UNVERIFIED: how Rust's `std::process::Command` treats `.cmd`/`.bat` arguments on the installed toolchain — spike M0.

As built (05-M1): `LaunchOptions { worktree_temp_dir, launch_override }`; java-direct is used on unix too when `bin/ccsh` (symlinks resolved) sits in a Gradle install whose `lib/` holds a `ccsh*.jar`, because `-Djava.io.tmpdir` cannot pass through `CCSH_OPTS` word splitting safely; the java command is the tools report's java (which already ranks custom > `JAVA_HOME` > `PATH`); there is no `plan_launch` — `CmdShim` runs the shim through `ProcessRunner`, which applies `check_batch_args`.

All modes run through `ProcessRunner` (no shell, stdin closed, hardened environment, tree kill on cancel). `cwd` is the job temp dir so a stray default output can never land in the repository.

### Running, progress, cancellation (`analysis/runner.rs`, `progress.rs`, `output.rs`, `janitor.rs`)

```rust
pub struct CcshRunResult { pub exit_code: Option<i32>, pub stdout: String, pub stderr: String, pub cancelled: bool, pub timed_out: bool, pub interactive_trap: bool }
pub struct RunHooks { pub on_progress: Box<dyn Fn(JobProgress) + Send + Sync>, pub log: LogSink }
pub async fn run_ccsh(launch: &CcshLaunch, argv: &[OsString], cwd: &Path, hooks: RunHooks, cancel: CancellationToken) -> Result<CcshRunResult, AnalysisError>;

pub struct ProgressParser { /* per-tracker state */ }
impl ProgressParser { pub fn new() -> Self; pub fn push(&mut self, chunk: &[u8]) -> Option<u8>; }

pub fn parse_map_line(stdout: &str) -> Option<PathBuf>;        // last "Map: <path>" line
pub fn parse_not_in_map(stdout: &str) -> Vec<String>;
pub fn classify_failure(result: &CcshRunResult, spawn_error: Option<&io::Error>) -> JobError;

pub struct Worktree { pub path: PathBuf, pub head: Sha }
pub async fn list_codecharta_worktrees(git: &GitService, repo: &Path) -> Result<Vec<Worktree>, GitError>;
pub async fn remove_orphans(git: &GitService, repo: &Path, before: &[Worktree], sha: &Sha) -> Result<(), GitError>;
```

As built (05-M1): `run_ccsh(&ProcessRunner, &CcshRun { launch, argv, cwd, log_file, timeout }, &RunHooks { on_progress }, &CancellationToken) -> Result<CcshRunResult { end: RunEnd, stdout, stderr }, JobError>`; `ProgressParser::push(&str)`; `classify_failure(&CcshRunResult) -> Option<JobError>` (`None` for a cancel) plus `classify_start_failure(&CoreError)`; progress follows only the `Files` unit (most advanced bar, 05-M0 finding 5), not the `unit:total` sum below.

- stdout/stderr are decoded as UTF-8 (lossy), appended to `run.log` as they arrive (stderr `\r` replaced by `\n`, consecutive progress lines of one tracker collapsed to the last) and kept in memory capped at the last 256 KiB each (`MAX_CAPTURED_BYTES`).
- **Progress**: buffer stderr; split on `\r` and `\n`; match `(\d{1,3})% \[=*> *\] *(\d+)/(\d+) (.+?), ETA: (?:N/A|\d{2,}:\d{2}:\d{2})` (`regex` crate). Trackers are keyed by `unit:total`. Overall percent = `floor(100 * Σparsed / Σtotal)` over all trackers seen, never decreasing, capped at 99 until the process exits. Before the first match, and for any phase without a bar (git log, checkout, merge, write), the job is `Indeterminate`.
- **Watchdogs**: total run time 30 min (`ANALYSIS_TIMEOUT`); if stdout ever contains `Select an analyser to execute` or `Unknown command:` the run is killed and fails with `InteractiveTrap`.
- **Cancellation**: cancel the `CancellationToken`; plan 01's runner kills the whole tree (Windows `taskkill /pid <pid> /t /f` or a job object; unix process-group `SIGTERM`, `SIGKILL` after 3 s — plan 01 decides). The runner returns `RunError::Cancelled` / `Timeout`; `run_ccsh` maps them to the flags. After exit: `remove_orphans`, delete the job temp dir, state → `Cancelled`.
- **Worktree janitor** (as built, 05-M2: `analysis::janitor::{list_codecharta_worktrees(&GitService, &GitFolder), remove_orphans(&GitService, &GitFolder, before, &CommitSha) -> usize}` over the new `GitService::{worktrees, remove_worktree, prune_worktrees}`; removal is `git worktree remove -f -f`, per 05-M0): before a `--commit` run record `git worktree list --porcelain` entries whose path base name starts with `codecharta-worktree-`. After a cancelled, timed-out or crashed run, list again; for every such entry that is new and whose `HEAD` equals the job's sha run `git worktree remove --force <path>` (retry 3 times at 500 ms), then `git worktree prune`. (`prune` alone does nothing while the folder still exists.) Entries that existed before are never touched.
- **Crash recovery**: each job temp dir holds `job.json` `{ repoPath, sha, worktreesBefore, pid }`. `AnalysisService::recover()` runs at core start: for every `.tmp-*` folder whose `pid` is not a live process (candidate crate `sysinfo`, UNVERIFIED) it runs the janitor and deletes the folder; folders of a live pid (a CLI run beside a serving core) are left alone. On shutdown a running job is cancelled the same way.
  As built (05-M3): `analysis::recovery::{JobFile { repositoryPath, sha, worktreesBefore, pid }, JobMarker, recover(&StorePaths, &GitService)}`. `execute` writes `job.json` into plan 03's `.incoming-<8hex>` staging directory right before ccsh starts and holds an exclusive lock on `job.lock` beside it until ccsh ended and the janitor ran, then removes both. Liveness is that lock, not the pid (no `sysinfo`; the OS drops the lock with the process, and a reused pid cannot fool it); `pid` is kept for the log. The store's open-time sweep leaves staging directories with a `job.json` to `recover()`, which the serving core runs in the background at start (and the `analyse` command before its job). Because the store lock admits one writing process, a live foreign job directory can only appear when a store is shared by other means.

### Preflight (`analysis/preflight.rs`)

```rust
pub struct PreflightContext<'a> { pub tools: &'a ToolsReport, pub git: &'a GitService, pub store: &'a StorePaths, pub disk: &'a dyn DiskSpace }
pub trait DiskSpace: Send + Sync { fn available(&self, path: &Path) -> io::Result<u64>; }   // candidate impl: fs4 (UNVERIFIED), stubbed in tests
pub async fn run_preflight(ctx: &PreflightContext<'_>, project: &Project, folder: &ProjectFolder, target: &AnalysisTarget) -> PreflightResult;
```

Errors block, warnings are shown and do not block.

| Check | Code | Severity |
|---|---|---|
| ccsh found | `ccsh-not-found` | error |
| ccsh version ≥ 2.2.1 (state `too_old`) | `ccsh-too-old` | error |
| Java found / major ≥ 22 (states `missing` / `too_old`) | `java-not-found` / `java-too-old` | error |
| git found (git folders only) | `git-not-found` | error |
| folder path exists and is a directory | `folder-missing` | error |
| commit target: `git rev-parse --show-toplevel` succeeds in the folder | `not-a-repository` | error |
| commit target: `git cat-file -e <sha>^{commit}` | `unknown-commit` | error |
| profile passes `validate_profile` | `invalid-profile` | error |
| folder is not the repository root (`--show-toplevel` ≠ folder) | `not-repo-root` ("history metrics will be missing") | warning |
| `git rev-parse --is-shallow-repository` = `true` | `shallow-clone` | warning |
| free space on the store < max(200 MiB, 3 × largest snapshot of the folder) | `disk-full` | error |
| commit target: free space in the temp dir < 1 GiB | `low-disk-space` | warning |

As built (05-M3): `run_preflight(&PreflightContext { tools, git, disk, places: &DiskPlaces { store, temp } }, &PreflightSubject { folder: &GitFolder, kind, profile, target, largest_snapshot_bytes }) -> PreflightResult`; `SystemDiskSpace` uses `fs4::available_space`. Codes are SCREAMING_SNAKE_CASE like every built code: a blocking problem carries its `AnalysisErrorCode`, a warning a `WarningCode` (`NOT_REPO_ROOT`, `SHALLOW_CLONE`, `LOW_DISK_SPACE`); `ProblemCode` is the untagged union of both. A git folder that is no repository is `NOT_A_REPOSITORY` for a working-tree target too (the run would fail with it); a commit target in a plain folder is `NOT_A_REPOSITORY`. Unreadable free space does not block.

### Failure classification

`classify_failure`, first match wins:

| Evidence | Code | Hint shown |
|---|---|---|
| spawn `NotFound` on java / on ccsh | `java-not-found` / `ccsh-not-found` | open Tools settings |
| stderr contains `ccsh needs Java` or `Unrecognized option: --enable-native-access` | `java-too-old` | the two stderr lines |
| stdout matched the interactive markers | `interactive-trap` | report a bug, attach log |
| watchdog fired | `timeout` | — |
| exit 2 | `invalid-arguments` | report a bug, attach log |
| stdout contains `No commit found for` | `unknown-commit` | fetch the commit |
| stdout contains `Failed to create git worktree` | `worktree-failed` | "paths may exceed 260 characters: run `git config --global core.longpaths true`, or set a short worktree temp folder in Tools settings" |
| stdout contains `Git command timed out` | `git-timeout` | — |
| exit 1 | `analysis-failed` | message = last non-empty stdout line |
| exit 0 but no map file | `no-output` | — |

"Show log" is offered on every failed job: the temp dir of a failed job is renamed to `.failed-<jobId>` (keeping `run.log`) and deleted on `analysis.clearFinished` or at next start.

### Collecting the snapshot record (`analysis/service.rs`, `snapshots/`)

```rust
pub struct AnalysisService { /* store, tools, git, queue, event sink, config */ }
impl AnalysisService {
    pub fn new(deps: AnalysisDeps, config: AnalysisConfig) -> Self;       // config: concurrency, timeout, LaunchOverride
    pub async fn recover(&self) -> Result<(), AnalysisError>;
    pub async fn preflight(&self, folder: &FolderRef, target: &AnalysisTarget) -> Result<PreflightResult, AnalysisError>;
    pub async fn enqueue(&self, folder: &FolderRef, target: AnalysisTarget, force: bool) -> Result<EnqueueResult, AnalysisError>;
    pub async fn enqueue_batch(&self, folder: &FolderRef, selection: BatchSelection, dry_run: bool) -> Result<BatchResult, AnalysisError>;
    pub async fn cancel(&self, job_id: &str) -> Result<(), AnalysisError>;
    pub async fn cancel_batch(&self, batch_id: &str) -> Result<(), AnalysisError>;
    pub fn list(&self) -> Vec<AnalysisJob>;
    pub fn clear_finished(&self);
    pub async fn wait_for(&self, job_id: &str) -> AnalysisJob;            // used by the CLI
}
impl JobExecutor for AnalysisService { /* execute(job, hooks): steps below */ }
```

As built (05-M2), `execute` lives on `AnalysisService::new(AnalysisDeps { snapshots, git, runner, hosting }, AnalysisConfig { tools, os, launch_override, timeout, hosting_budget })` and is `execute(&JobRequest { id: JobId, folder, target, force }, &RunHooks, &cancel) -> Result<SnapshotId, JobFailure>` with `JobFailure::{Cancelled, Failed(JobError)}`; the queue, preflight, `recover` and the remaining methods come with M3. The staging directory is plan 03's `.incoming-<8hex>` (not `.tmp-<jobId>`), without `job.json` (crash recovery is M3); a failed run keeps only `run.log` as `.failed-<jobId>` (`SnapshotRepository::{keep_failed, read_failed_log}`), deleted at the next writable store open.

Order inside `execute`:

1. Preflight (errors → `failed`).
2. Create `<snapshotsDir>/.tmp-<jobId>`; write `job.json`.
3. `collect_git_state(git, repo, target) -> Result<GitState, GitError>` (git folders only), all through `GitService`, argument arrays:
   - working-tree target: `sha = git rev-parse HEAD`; `dirty = git status --porcelain=v1 --untracked-files=normal` non-empty.
   - `git show -s --format=%H%x00%h%x00%P%x00%an%x00%aI%x00%cI%x00%s <sha>` → commit, short commit, parents, author name, author date, commit date, subject.
   - `git rev-parse <sha>^{tree}` → `tree`.
   - `git for-each-ref --points-at <sha> --format=%(refname:short) refs/heads refs/remotes` → `branches_at_run`; same with `refs/tags` → `tags_at_run`.
   - HEAD: `git symbolic-ref --quiet --short HEAD` (exit 1 → detached), `git rev-parse HEAD`, `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` (failure → no upstream, ahead/behind 0), `git rev-list --left-right --count @{upstream}...HEAD` → `<behind>\t<ahead>`.
   - `git remote` then `git remote get-url <name>` → remotes; **strip userinfo** from every URL (`https://user:token@host/…` → `https://host/…`) before it is stored or logged.
   - As built (05-M2): `snapshots::git_state::collect_git_state(&GitReads { service, runner }, &GitFolder, &AnalysisTarget, &cancel) -> CoreResult<GitRecord>`. HEAD, upstream, ahead/behind and dirty come from one `GitService::status`; the commit description from plan 03's `folders::inspector::commit_details` (the same `show -s` format as bound imports, ISO dates with offset); `GitService::tree_of` (new) for `git.tree`; `GitService::refs_at` for branches and tags (local branches only: `refs/remotes` are not listed); `GitService::remotes` (new; `config --get-regexp remote.*.url` with `strip_credentials`).
4. In parallel with the run, `probe_hosting(runner, remotes, sha, budget) -> Option<Hosting>` with a 10 s budget (`HOSTING_BUDGET`); any failure yields what the URL alone gives. Provider/repository from `origin` (else the first remote): host `github.com` → `github`; host containing `gitlab` → `gitlab`; `owner/repo` from the path without `.git`; otherwise `None`. GitHub with `gh` on PATH: `gh pr list --state all --search <sha> --json number,title,state,baseRefName,headRefName --limit 20` with `cwd` = repo (UNVERIFIED flags — spike M0). GitLab with `glab`: `glab api projects/:id/repository/commits/<sha>/merge_requests` (UNVERIFIED). State lower-cased. No CLI, non-zero exit or timeout → empty list. No tokens are read or stored (D10). As built (05-M2): `snapshots::hosting::{HostingCli (port; implemented by `Tools`), HostingProbe { repository_path, remotes, commit, budget }, probe_hosting(&dyn HostingCli, &HostingProbe, &cancel) -> Option<HostingRecord>, hosting_of(remotes)}`; github needs exactly `owner/repo`, gitlab keeps subgroups (`group/sub/repo`); an unreadable answer also yields an empty list.
5. `run_ccsh(...)`.
6. On exit 0: map path = the `Map:` line's path if that file exists, else the single `*.cc.json.gz` in the temp dir, else `NoOutput`. Rename it to `map.cc.json.gz`.
7. Working-tree target: re-read `git rev-parse HEAD`; if it differs from step 3 → `HeadMoved` ("the checkout changed during the analysis; run it again").
8. `read_map_head(path) -> io::Result<MapHead { checksum: Option<String>, root_name: Option<String> }>`: gunzip-stream the first 64 KiB (`MAP_HEAD_BYTES`), match `^\{"meta":(\{[^{}]*\})` → `serde_json` → `checksum`; match `"files":\[\{"id":"[^"]*","name":"((?:[^"\\]|\\.)*)"` → `root_name`. Either may be `None`; nothing depends on it at write time.
9. Write `snapshot.json` with `SnapshotRepository` (`write_json_atomic`) per section 5 of the shared decisions: `source: "analysed"`, `analysis.exit_code: 0`, `analysis.not_in_map` from the `Not in the map:` block, tool versions from `ToolsService`, plus the optional `analysis.target: "commit" | "workingTree"`, `git.tree`, `analysis.reused_from`.
10. Rename `.tmp-<jobId>` → `<snapshotId>` (same volume, atomic). When `force` replaces an existing snapshot: rename the old folder to `.old-<jobId>`, the new one in, then delete the old. Emit `snapshots.changed`; job → `Done` with `snapshot_id`.

```rust
pub struct SnapshotRepository { /* StorePaths + per-folder cache */ }
impl SnapshotRepository {
    pub fn list(&self, folder: &FolderRef) -> Result<Vec<SnapshotEntry>, SnapshotError>;
    pub fn read(&self, r: &SnapshotRef) -> Result<SnapshotRecord, SnapshotError>;
    pub fn commit_new(&self, folder: &FolderRef, tmp_dir: &Path, record: &SnapshotRecord, replace: bool) -> Result<SnapshotId, SnapshotError>;
    pub fn read_log(&self, r: &SnapshotRef) -> Result<String, SnapshotError>;
    pub fn map_path(&self, r: &SnapshotRef) -> Result<PathBuf, SnapshotError>;
    pub fn delete(&self, r: &SnapshotRef) -> Result<(), SnapshotError>;   // OS recycle bin via the `trash` crate, fs::remove_dir_all fallback
}
```

As built (05-M2), plan 03's `SnapshotRepository` was extended instead: `list` / `find_by_commit` answer `SnapshotSummary` (the plan's `SnapshotEntry`: plan 03's summary plus `target`, `finishedAt`, `durationMs`, `notInMap`; `checksum` is the map checksum), `read`, `read_log`, `map_location`, `begin_snapshot` + `commit_snapshot` / `commit_snapshot_replacing` (instead of `commit_new(…, replace)`), `delete(ref, permanently)`. Ids come from `ids::commit_snapshot_id` / `ids::working_tree_snapshot_id`.

Snapshot ids: commit target `<fullSha>-<profileHash>`; working-tree and non-git targets `worktree-<YYYYMMDD>T<HHmmssSSS>Z-<profileHash>` in UTC (no `:`, which is illegal in Windows file names). `list` ignores folders whose name starts with `.` and folders without a readable `snapshot.json` with `schemaVersion == 1`; imported records are read too and map to a `SnapshotEntry` with `finished_at`, `duration_ms` and `profile_hash` `None` and `created_at` = `imported.at`. If plan 03 already ships a lister, extend it instead of writing a second one (record the choice in Notes). Results are cached per folder and invalidated on write/delete.

Target kinds:
- **Commit**: `dirty: false`; the user's checkout is not touched.
- **Working tree ("current checkout")**: no `--commit`; bound to the HEAD commit read in step 3; `dirty` as measured; several may exist per commit, each with its own timestamp id.
- **Non-git folder** (`kind: plain`): only working-tree targets are offered; `git: null`, `hosting: null`.

### Job queue (`analysis/queue.rs`)

```rust
#[async_trait] pub trait JobExecutor: Send + Sync { async fn execute(&self, job: &AnalysisJob, hooks: JobHooks, cancel: CancellationToken) -> Result<SnapshotId, JobError>; }
pub struct AnalysisQueue { /* state machine over an injected executor and EventSink */ }
impl AnalysisQueue {
    pub fn new(executor: Arc<dyn JobExecutor>, sink: Arc<dyn EventSink>, concurrency: usize) -> Self;
    pub fn enqueue(&self, request: NewJob, priority: Priority) -> EnqueueOutcome;   // Queued | AlreadyQueued(job)
    pub fn cancel(&self, job_id: &str) -> bool;
    pub fn cancel_batch(&self, batch_id: &str) -> usize;
    pub fn list(&self) -> Vec<AnalysisJob>;
    pub fn clear_finished(&self);
}
```

The queue lives in the core, so jobs survive a renderer reload (the renderer calls `analysis.list` on start and listens to the notifications). Jobs are not persisted across core restarts.

```
enqueue ─► queued ──start──► running ──exit 0 + record written──► done
              │                 ├──────────── failure ──────────► failed
              └──cancel──► cancelled ◄──cancel (kill, janitor)───┘
```

- Concurrency 1 (`ANALYSIS_CONCURRENCY`). FIFO, except that a job from a direct user action (`analysis.enqueue`) goes ahead of queued batch jobs.
- Dedupe key `folderId + targetKey + profileHash` (`targetKey` = sha or `workingTree`). A key that is queued or running returns `AlreadyQueued`; a commit key that already has a snapshot returns `AlreadyAnalysed` unless `force`. Working-tree targets always create a new snapshot.
- Terminal jobs stay listed until `clear_finished`; at most the 100 newest are kept. Every transition emits the matching `analysis.*` notification with the whole job.

As built (05-M3): `AnalysisQueue::{new, subscribe, enqueue(NewJob { folder, target, profile_hash, batch_id, force }, existing: Option<SnapshotId>) -> CoreResult<EnqueueOutcome>, cancel(&JobId) -> CoreResult<()>, list, clear_finished -> Vec<AnalysisJob>, shutdown, drive(&impl JobExecutor), wait_for(&JobId)>}`. No `concurrency` parameter and no `Priority`: one `drive` loop runs one job at a time, and a job without `batch_id` is the direct one. The queue does not hold the executor; whoever owns it calls `drive` (the serving core in a task, the CLI beside its wait), so the executor may borrow the core. `JobExecutor::execute(&JobRequest, &RunHooks, &cancel) -> impl Future<Output = Result<SnapshotId, JobFailure>> + Send` (no `async_trait`). The caller looks up the existing snapshot and passes it as `existing`. Events are `AnalysisEvent` on a `tokio::sync::broadcast` channel (`Queued`, `Started`, `Progress { job_id, progress }` at most every 250 ms per job, `Finished`, `Failed`, `Cancelled`, then `SnapshotsChanged(folder)` after `Finished`); the serving core turns them into notifications.

### Identical trees and profiles

- Two commits can produce the same `meta.checksum`. Each still gets its own snapshot; the store does not deduplicate bytes.
- When the profile's `without` contains `git` (no history lens, so the map depends on the tree alone) and a snapshot with the same `git.tree` and `profileHash` exists, the job copies that snapshot's `map.cc.json.gz` instead of running ccsh and records `analysis.reused_from`, `duration_ms` of the copy. With history metrics in the profile this shortcut is not taken.
- Viewing switches one map at a time (D6), so equal checksums never meet in `state.files` through this plan. For plan 06: `SnapshotEntry.map_checksum` lets it detect "identical content" before loading two snapshots.
- Changing the profile changes `profileHash`, hence the id: a re-analysis creates a second snapshot. Lists show the profile hash with a tooltip listing `without` / `exclude` / `extraArgs` and mark rows that do not match the current profile.

### Resolving what to show (`snapshots/nearest.rs`)

```rust
pub async fn resolve_snapshot(git: &GitService, repo: Option<&Path>, target: &AnalysisTarget, snapshots: &[SnapshotEntry], current_profile_hash: &str) -> Result<SnapshotResolution, SnapshotError>;
pub struct ResolutionCache { /* keyed by repo + commit + snapshot-set version */ }
```

`A` = snapshots of the folder bound to a commit (all profiles): analysed commit-target snapshots **and imported snapshots whose `commit` is set**, as a `HashMap<Sha, Vec<SnapshotEntry>>`. Imported snapshots without a commit are never in `A` and never returned for a git target. When several snapshots share a sha, prefer the current profile (an import has no profile and never matches), then analysed over imported, then the newest `finished_at ?? created_at`. Working-tree snapshots bound to a commit are looked up only in step 3.

1. **`A` empty and no working-tree snapshot bound to HEAD** → `None` (unbound imports do not change this; the banner adds "Imported maps without a commit are listed under Snapshots").
2. **Non-git folder (no repository)** → `Latest` = newest analysed working-tree snapshot by `finished_at`; if none, the newest imported snapshot by `created_at`.
3. **Working-tree target** → `C = git rev-parse HEAD`. A working-tree snapshot bound to `C` → `Exact` with the newest. Otherwise continue with `C` as a commit target (the notice says "current checkout").
4. **Exact**: `C ∈ A` → `Exact`.
5. **Nearest analysed ancestor** — among analysed commits that are ancestors of `C`, the one with the smallest `git rev-list --count S..C`; ties go to the one met first.
   a. Stream `git rev-list C` (one sha per line) through `GitService`'s streaming call. Collect shas in `A` as candidates. Stop at 10 candidates (`MAX_CANDIDATES`), or 20 000 commits after the first candidate (`WALK_LIMIT_AFTER_FIRST_HIT`), or end of stream.
   b. For each candidate run `git rev-list --count S..C`; the smallest wins → `Nearest { relation: Ancestor, behind: count, ahead: 0 }`.
   This is the strategy `git describe` uses for tags. Cost: O(commits walked) for the stream plus at most 10 counts, each O(|S..C|). On linear history the first hit is the answer and its count equals its stream position, so the count call is skipped when no merge commit was seen before the hit (use `git rev-list --parents C` and check for lines with more than two fields).
6. **No analysed ancestor**: take the 50 snapshots with the newest `commit_date` (`MAX_FALLBACK_CANDIDATES`). For each, `git merge-base C S` (exit 1 → unrelated history, skip) and `git rev-list --left-right --count C...S` → `<left>\t<right>`: `left` = commits of `C` the snapshot lacks, `right` = commits the snapshot has beyond `C`. Run four at a time.
   - Any with `left == 0` → **descendant**: smallest `right` wins → `Nearest { relation: Descendant, behind: 0, ahead: right }`.
   - Otherwise smallest `left + right` wins, ties to smaller `left`, then newer `commit_date` → `Nearest { relation: Diverged, behind: left, ahead: right }`.
   - Nothing related → `None`.
7. Results are cached by `repo + C + snapshot-set version` (incremented on every `snapshots.changed` of the folder).

CLI `codecharta-core snapshots resolve` and the RPC method call this same function.

As built (05-M5): `resolve_snapshot(git: &GitService, cache: &ResolutionCache, request: &ResolutionRequest, cancel) -> CoreResult<SnapshotResolution>` with `ResolutionRequest { folder: ResolutionFolder (Plain | Git(&GitFolder) | MissingGit), target, snapshots: &[SnapshotSummary], current_profile_hash: Option<&str> }` (`SnapshotEntry` is the built `SnapshotSummary`, `Sha` the built `CommitSha`; no `SnapshotError`). The walk of step 5 is `GitService::rev_list_with_parents` (`rev-list --parents --stdin`, git's default order): `--date-order` makes git walk the whole history before the first line (0.37 s on 100 000 commits), so the walk runs without it, which also drops the topological promise; a hit met before any merge is the answer at its stream position (one line of parents, whatever the dates), otherwise every candidate is counted. `Exact` and `Nearest` carry `isCurrentProfile`; `Latest` a `reason` (`PLAIN_FOLDER`, `GIT_UNAVAILABLE`, `REPOSITORY_UNAVAILABLE`); `None` a `reason` (`NO_SNAPSHOTS`, `NO_COMMITS`, `UNKNOWN_COMMIT`, `UNRELATED`) instead of an `errorMessage`. The cache key is repository path + target kind + `C` + a fingerprint of the snapshot set + current profile hash, so imports, moves and deletions (which emit no `snapshots.changed`) invalidate it too; an `UNKNOWN_COMMIT` answer is not cached. The git fallback (`GIT_UNAVAILABLE`, `REPOSITORY_UNAVAILABLE`) never shows an unbound import; a plain folder's `Latest` may, when it has no analysed snapshot.

### Renderer: state and flow

```ts
// features/snapshots/model/snapshotView.model.ts (SnapshotEntry, SnapshotResolution, AnalysisJob, AnalysisTarget come from model/coreApi/)
export interface LoadedSnapshotRef { projectId: string; folderId: string; snapshotId: string; fileName: string; checksum: string | null; commit: string | null; shortCommit: string | null; dirty: boolean }
export type SnapshotViewStatus = "idle" | "resolving" | "loading" | "shown" | "empty" | "error"
export interface SnapshotViewState {
    folderId: string | null
    target: SelectedTarget | null
    resolution: SnapshotResolution | null
    shown: LoadedSnapshotRef | null
    status: SnapshotViewStatus
    pendingJob: AnalysisJob | null      // queued/running job for exactly this target and profile
    dismissedNoticeKey: string | null   // folderId|targetKey|shownSnapshotId
    errorMessage: string | null
}
```

`SnapshotViewService` (root-provided, one `signal<SnapshotViewState>`; desktop-only — without `DESKTOP_BRIDGE` it stays `idle` and every component renders nothing):

1. An `effect` on the selected target, on `ProjectsFacade.activeFolder()` and on plan 04's repository-changed signal starts a resolution (a new HEAD is a new resolution and never starts an analysis): increment a request counter, `status: "resolving"`, request `snapshots.resolveForCommit`. A response whose counter is no longer current is dropped.
2. `None` → `status: "empty"`, nothing is loaded, the previously shown map stays until the user acts.
3. Otherwise, if `resolution.snapshot.id !== shown?.snapshotId`: `status: "loading"`; `LoadFilesUseCase.loadProjectSnapshots([{ origin, displayName, readBytes: () => bridge.readSnapshotMap(ref) }])`, with `displayName` from plan 03's `snapshotDisplayName` (D7: `<folderLabel>@<shortCommit>`, `+dirty` for dirty working-tree snapshots, a date form for non-git folders, an "imported" form showing the original file name and no analysis time; extend that util with a test if a variant is missing). Register the ref in `LoadedSnapshotRegistry` from `loaded`, set `shown`, `status: "shown"`. An `unreadable` result → `status: "error"` with "The stored map could not be read" and "Re-analyse" (for an imported snapshot "Delete" instead).
4. `pendingJob` is derived from `AnalysisJobsService.jobs()` (match on folder, target key, current profile hash).
5. **Auto-switch**: when `analysis.finished` arrives for the current folder and target key, resolve again (it now returns `Exact`). If the user has selected something else, only a toast "Analysis of <short> finished" (`ToastService.show`, `success`).
6. `analyseSelected()` requests `analysis.enqueue` for the current target; `Rejected` problems are shown in the notice area as an error list with hints.
7. `LoadedSnapshotRegistry`: `signal<ReadonlyMap<string, LoadedSnapshotRef>>` keyed by `snapshotId`, with `refOfFile(fileName)`; `ForgetRemovedSnapshotsEffect` (`ofType(removeFiles)`) drops refs whose `fileName` was removed. Nothing is persisted; after a restart plan 03's project restore re-selects the target and step 1 repopulates it.

`AnalysisJobsService` and `SnapshotCatalogService` are signal services over `analysis.list` / `snapshots.list` and the notifications; every bridge callback ends in a `signal.set/update` (zoneless).

### Notice wording

Built by the pure function `noticeText(state): { tone: "info" | "warning"; text: string; chip: string | null; action: string | null }` (`<t>` = target short sha, `<s>` = shown short sha):

| Resolution | Banner text | Chip | Action |
|---|---|---|---|
| `exact`, commit | none | `imported` when the snapshot is imported, else none | — |
| `exact`, working tree | none | `dirty` when dirty | "Analyse current checkout again" in the chip menu |
| `nearest`/`ancestor` | "No analysis for `<t>` — showing `<s>` (`<subject>`), stale by N commit(s)." | `stale by N` | "Analyse `<t>` now" |
| `nearest`/`descendant` | "No analysis for `<t>` — showing `<s>` (`<subject>`), which is ahead by N commit(s)." | `ahead by N` | same |
| `nearest`/`diverged` | "No analysis for `<t>` — showing `<s>` (`<subject>`) from a diverged line: N behind / M ahead." | `diverged N↓ M↑` | same |
| working tree, no snapshot at HEAD | prefix "No analysis of the current checkout — …" with the matching sentence above | as above | "Analyse current checkout" |
| `latest` (non-git) | none | `snapshot from <date>`; imported: `imported — analysis time unknown` | "Analyse now" in the chip menu (not offered when the folder has no path) |
| shown snapshot is imported | sentence unchanged, `<s>` followed by "(imported, analysis time unknown)" | `imported` added | as in the row |
| `none` | "No analysis yet for `<folderLabel>`." (not dismissible) | `not analysed` | "Analyse now" |
| snapshot of another profile | append " Analysed with a different profile." | suffix `·profile` | — |
| `pendingJob` queued/running | replaces the action with a progress bar (`<progress class="progress">`, indeterminate when `Indeterminate`), "Analysing `<t>`… NN %" and "Cancel" | `analysing…` | "Cancel" |
| `pendingJob` failed | "Analysis of `<t>` failed: <message>" + hint | `failed` | "Show log", "Retry" |

### UI placement

- **`cc-snapshot-notice`** — mounted in `views/codeCharta.component.html` directly after `<cc-nav-bar>`. Host classes `fixed left-1/2 -translate-x-1/2 top-[calc(var(--cc-bars-height)+0.5rem)] z-[70]`; body is a daisyUI `alert` (`alert-warning` or `alert-info`, `role="status"`, `aria-live="polite"`) with the text, the action button (`btn btn-sm btn-primary`) and a dismiss button (`btn btn-sm btn-ghost`, `fa-xmark`). Dismissing stores `folderId|targetKey|shownSnapshotId` in `dismissedNoticeKey` (session only); a different target or shown snapshot brings it back. The chip is never dismissed.
- **`cc-snapshot-chip`** — in `navBar.component.html`, `navbar-start`, immediately after the map/delta selector (or whatever plan 03 put there). Shows the shown snapshot's name and a daisyUI `badge` (`badge-warning` for stale/ahead/diverged/dirty, `badge-ghost` otherwise). Clicking opens the snapshots dialog.
- **`cc-analysis-jobs-indicator`** — same template, first child of `navbar-end`, before `<cc-settings-button>`. Hidden without jobs. Spinner and "n" while anything is queued or running; opens a native popover listing jobs (target, state, progress, Cancel / Show log / Retry) and "Clear finished".
- **`cc-snapshots-dialog`** — native `<dialog class="modal">`, hosted by the nav bar component next to the existing `@if (isExportDialogOpen())` host at the end of `navBar.component.html`. One table per folder of the active project: commit (short sha + subject), commit date, analysed at, profile, size, flags (dirty / imported / not in map); row actions Open, Re-analyse, Show log, Delete. "Analysed at" shows "unknown (imported <date>)" for imports and the profile column "unknown"; imports have no Re-analyse. Unbound imports are not in the folder table: a section "Imported — analysis time unknown" lists them (original file name, import date, size; Open, Delete). Header buttons: "Analyse current checkout", "Analyse HEAD commit", "Analyse several…". Footer: project store size and "Clean up…".
- Components are standalone, OnPush, signal inputs, external `templateUrl`, no stylesheet, `data-testid` on every interactive element.

### Badge provider (consumed by plan 04)

Plan 04 owns the ports; this plan implements them (the dependency points from `snapshots` to `gitHistory` only, keeping `feature-no-circular-dependencies-between-features` green) and exports `provideSnapshotsForGitHistory()` from `features/snapshots/facade.ts`, added to `providers` in `app/app.config.ts`:
- `ANALYSED_COMMITS`: marker from `SnapshotCatalogService.snapshots(folderId)` and `AnalysisJobsService.jobs()`; job state wins over snapshot state (`analysed` / `running` / `failed`); "other profile" and "imported" go into the tooltip text if the port has one. A commit-bound import gives that commit `analysed` with the tooltip "Imported map, analysis time unknown"; unbound imports give no marker.
- `COMMIT_ACTIONS`: "Analyse this commit" (offered only for unanalysed commits), "Analyse the last N commits from here…".
- `LOADED_MAP_LOCATOR`: `nodePathOf(repo, relativePath)` returns `/root/<relative path>` (prefixed by the folder's offset inside the repository for a sub-folder; root name is plan 03's `PROJECT_ROOT_NAME`) when a snapshot of that repository is loaded and the node exists, else `null`.

### Batch actions (`analysis/batch.rs`)

```rust
pub async fn expand_batch(git: &GitService, repo: &Path, selection: &BatchSelection) -> Result<Vec<Sha>, GitError>;
```

Then one preflight for the batch and one job per sha without a snapshot for the current profile:
- `LastCommits`: `git rev-list -n <count> [--first-parent] <tip_sha>` (first-parent is the dialog default).
- `Tags`: `git for-each-ref --format=%(objectname)%00%(*objectname) refs/tags`; the peeled id when present; de-duplicated.
- `Commits`: the given shas, each validated (plan 06 uses this for both ends of a comparison).

`dry_run` returns `to_analyse`, `already_analysed` and `estimated_duration_ms` (mean `duration_ms` of the folder's commit snapshots × count, `None` when there are none) without enqueueing; the dialog shows that as its confirmation step. Batches are capped at `MAX_BATCH_JOBS = 200`. `cancel_batch` cancels every queued and running job of the batch.

As built (05-M6): `analysis::batch::{expand_batch(git: &GitService, folder: &GitFolder, selection, cancel) -> CoreResult<Vec<CommitSha>>, validate_selection, preflight_target, plan_batch(expanded, snapshots, profile_hash) -> BatchPlan, MAX_BATCH_JOBS}`; `Analyses::{enqueue_batch(folder, selection, dry_run) -> BatchResult, cancel_batch(batch_id)}`; `AnalysisQueue::cancel_batch(&BatchId) -> CoreResult<usize>` (`NOT_FOUND` when no job of the batch is known). `Tags` reads plan 04's `GitService::refs` (the same `for-each-ref` with peeled objects; tags of non-commits are left out), newest tag first, each commit once; `LastCommits` is `rev_list` with `max_count`; `Commits` resolves each sha (`rev-parse --verify`), an unknown one is a blocking `UNKNOWN_COMMIT` problem in the result. `LastCommits.count` and `Commits.shas` outside `1..=200` are `BAD_REQUEST`; a plain folder is `BAD_REQUEST`. One preflight runs before expanding (target: the tip, the first named commit, or the working tree for `Tags`); a blocking problem answers `problems` with nothing else. Only `Tags` can expand beyond 200 commits to analyse: the newest 200 are kept and `BatchResult.leftOut` counts the rest (addition to the plan's struct). The estimate is returned for dry and real runs; `batchId` and `jobs` only when something was queued. Batch jobs never `force`.

### Retention and cleanup (`snapshots/retention.rs`)

```rust
pub fn store_usage(repo: &SnapshotRepository, project_id: &str) -> Result<StoreUsage, SnapshotError>;   // per folder: map bytes + run.log size
pub async fn plan_prune(git: &GitService, repo_path: Option<&Path>, snapshots: &[SnapshotEntry], policy: &PrunePolicy, shown: Option<&SnapshotId>) -> Result<PrunePlan, SnapshotError>;
```

- `snapshots.delete` refuses while a job for that id is running, then moves the snapshot folder to the OS recycle bin (crate `trash`, in use since 03-M3). When the recycle bin fails (e.g. a headless Linux session) nothing is removed and the request answers `RECYCLE_FAILED`; the renderer may then ask the user and send the request again with `permanently: true` (owner decision: deletions go to the recycle bin — the core never falls back to deleting for good on its own). If the snapshot is currently shown, the renderer keeps the map on screen and re-resolves on `snapshots.changed`.
- Imported snapshots are never part of a prune plan; they can only be deleted one by one.
- Default policy `{ keep_newest_commit_snapshots: 50, keep_newest_working_tree_snapshots: 3, keep_branch_tips_and_tags: true }`. Kept: snapshots whose commit is a current branch tip or tag (`git for-each-ref --format=%(objectname)%00%(*objectname) refs/heads refs/remotes refs/tags`), the newest N commit snapshots by `commit_date`, the newest K working-tree snapshots, and the snapshot currently shown. The rest is listed in the plan. Nothing is deleted without the user confirming the list in `cc-cleanup-dialog`. There is no automatic pruning.

As built (05-M6): `snapshots::retention::{Retention { projects, snapshots, git, queue }, Protected, select_for_pruning}` (the plan's two free functions with 5 parameters became a struct like `FolderResolver` plus a pure selection): `usage(project_id) -> StoreUsage` (per folder of the project, in its order: `snapshotCount` and the bytes of `map.cc.json.gz` + `run.log`), `delete(snapshot, permanently)`, `plan_prune(folder, policy, cancel) -> PrunePlan` (shown snapshot read from the project's `view`, branch tips and tags from plan 04's `GitService::refs`, none for a plain or missing folder; snapshots a running job writes are protected too; `freedBytes` measured like `usage`; `keep` counts every snapshot not listed, imports included), `prune(folder, snapshot_ids, permanently) -> PruneResult { deleted, freedBytes }` (checks every id first: unknown `NOT_FOUND`, imported `BAD_REQUEST`, being written `SNAPSHOT_BEING_WRITTEN`; then removes them in order and stops at the first failure — those removed before stay removed). Working-tree snapshots are told apart by `target` (or a `worktree-` id) and are never kept as branch tips. "Being written" = a running job whose commit target and profile give that snapshot id (`AnalysisQueue::snapshots_being_written`); a working-tree snapshot is invisible until written. `delete` and `prune` emit `snapshots.changed` (`AnalysisQueue::announce_snapshots_changed`). New error codes `SNAPSHOT_BEING_WRITTEN`, `RECYCLE_FAILED` (the system recycler answers it instead of `IO`, for project deletion and discarded files too).

### Headless CLI (`codecharta-cored/src/cli/`)

- `codecharta-core analyse --project <id> --folder <id> [--commit <sha>] [--force] [--json]`: runs `AnalysisService` in-process (no `serve`), prints progress lines on stderr and the snapshot id (or a JSON object with `--json`) on stdout. Without `--commit` it analyses the working tree. Exit codes: 0 done, 1 failed (the job error code on stderr), 2 invalid arguments, 130 cancelled by Ctrl-C (cancels the job and runs the janitor).
- `codecharta-core snapshots list --project <id> --folder <id> [--json]` and `codecharta-core snapshots resolve --project <id> --folder <id> [--commit <sha>] [--json]` print `SnapshotEntry[]` / `SnapshotResolution`.
- As built (05-M3): global `--data-dir` as for every command. `analyse` opens the store for writing (`STORE_LOCKED` while the app runs), runs `recover()`, then the same `Analyses::enqueue` as `analysis.enqueue` (a blocking preflight problem exits 1 with each problem as `<CODE>: <message>` on stderr), drives the queue in-process until its job ended and prints determinate progress as `<n>%` lines on stderr. A commit that already has a snapshot of the current profile prints that id and exits 0 (a note on stderr). `--json` prints `{ snapshotId, wasAlreadyAnalysed, job }`. `snapshots resolve` checks the folder (read-only store) and answers `none` / `{ "kind": "none" }` until M5. As built (05-M5): `snapshots resolve` reads the store only (works while the app runs), resolves through the same `FolderResolver` as the RPC method, prints the `SnapshotResolution` with `--json`, otherwise one line (`exact <id>`, `nearest <id> <relation> behind <n> ahead <n>`, `latest <id> <REASON>`, `none <REASON>`; `other-profile` appended to an exact or nearest snapshot of another profile or an import); exit codes as `snapshots list`.

### Error and edge cases

- Repository moved or deleted since setup → `folder-missing` at preflight; the snapshot list still works (it only reads the store).
- Target commit no longer in the repository: git errors are caught per candidate; an unknown `C` yields `None` with `errorMessage` "This commit is not in the local repository".
- Snapshot whose commit is no longer in the repository: skipped as a candidate, still listed.
- Renderer reload during a run: jobs continue in the core; the notice re-attaches through `analysis.list`. Core crash or restart: running jobs are lost; `recover()` cleans up.
- Two project folders on the same repository: jobs are keyed per folder; janitor matching is by sha, and concurrency 1 rules out a parallel job.
- Submodules and LFS inside the temporary worktree are not initialised by ccsh; affected files are absent or pointer files. Stated in docs, no handling.
- `git` unavailable but a snapshot list exists (git folder): `resolve` falls back to `Latest` (newest `finished_at`) and the notice says "git is not available — showing the newest analysis".

### Optional analysis-side changes

Not required; the app must work with stock ccsh 2.4.0. Each would be a separate `feat(analysis)` change with its own plan and entry in `analysis/CHANGELOG.md`: (1) write `meta.commitHash` by passing `request.commitHash` to `ProjectToCcJsonV2Mapper.writeProject` in `CodebaseAnalysis.writeMap` (a short-hash hint only); (2) `--progress=json`, one JSON line per update on stderr, replacing the regex and giving a tracker id; (3) `--output-exact` to suppress the short-hash prefix (`CommitAnalysisContext.resolveOutputFile`); (4) `--worktree-dir <folder>` to place the temporary worktree on a short path (`GitWorktreeManager.createWorktree`).

## Milestones

Before each milestone, write a short working plan file `dev_docs/studio/agents/progress/05-M<n>-<slug>.md` (create the folder if missing; link back to this plan, list the tasks, keep a `state` line current) and commit it with the milestone. Do not use the repository's `plans/` folder and keep nothing in `.claude/` or local agent memory: work moves between machines through git only.

Every task: write the listed tests first (Rust test names start with `should_`, with `// Arrange` / `// Act` / `// Assert` comments; Jest names start with "should"), then the code, then run the gates: for core work `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` from `core/`; for UI work the checks in section 6 of the shared decisions. Core commits use scope `core`, UI commits `visualization`; a commit that changes a core-api type includes the regenerated `visualization/app/codeCharta/model/coreApi/` files.

### M0 — Spikes on a real Windows machine (S)

No production code; record the answers in Notes and adjust later tasks if an assumption fails.

1. Confirm the installed layout: `npm root -g` → `codecharta-analysis\public\bin\ccsh.bat` and `public\lib\*.jar`; start `java --enable-native-access=ALL-UNNAMED -classpath "<APP_HOME>\lib\*" de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher --version` by hand and from a throwaway Rust `Command` (outside the repository) without a shell.
2. Confirm what `std::process::Command::new("ccsh.cmd")` does on this toolchain (spawn works / refuses arguments needing escape), and that plan 01's `cmd.exe /d /s /v:off /c` launch works for a path with spaces.
3. Run `… analyse <repo> -o <tmp>\map -p --commit=<sha>` piped: capture raw stderr bytes (progress segments, interleaving), raw stdout (the `Map:` line, encoding of `─` with and without `-Dstdout.encoding=UTF-8`), exit code; run with a bad `--without=x` (expect exit 1 + message) and with an unknown option (expect exit 2).
4. Kill a `--commit` run mid-checkout (`taskkill /T /F`): confirm the orphan appears in `git worktree list --porcelain`, that `git worktree prune` alone does not remove it, and that `git worktree remove --force` does.
5. Run `gh pr list --state all --search <sha> --json number,title,state,baseRefName,headRefName` in a GitHub clone; note the output shape.
6. Confirm the candidate crates resolve offline-safely with `cargo search` / the implementer's registry (`regex`, `flate2`, `sha2`, `trash`, `fs4`, `sysinfo`, `async-trait`, `tokio-util`) and pick versions.
- Acceptance: Notes lists each result with the exact command and output excerpt.
- Commit: `docs(core): record ccsh process spike results`

### M1 — Run one analysis from the core (M)

1. `analysis/profile.rs`. Tests: should give the same hash for differently ordered lists; should give different hashes when a list differs; should normalise gitlogparser to git; should reject an unknown `without` entry, an exclude pattern with a comma, and each forbidden extra argument. Commit: `feat(core): hash and validate analysis profiles`
2. `analysis/argv.rs`. Tests: should build the working-tree argv in the documented order; should append `--commit=<sha>` last for a commit target; should reject a relative path; should never emit `-i`, `-q` or `-nc`. Commit: `feat(core): build the ccsh analyse argument list`
3. `analysis/output.rs`. Tests (fixtures are strings captured in M0): should read the map path from the last `Map:` line; should return none without one; should read the `Not in the map:` block; should classify each row of the failure table. Commit: `feat(core): parse ccsh analyse output and failures`
4. `analysis/progress.rs`. Tests: should report nothing before the first bar; should parse a single tracker; should aggregate two interleaved trackers; should survive a segment split across chunks; should never decrease; should cap at 99. Commit: `feat(core): derive progress from ccsh stderr`
5. `crates/fake-ccsh` and `tests/common` (locator, scenario writer). Tests: should write the prefixed file for a commit run; should exit with the scripted code; should hang until killed when scripted. Commit: `test(core): add a scripted ccsh stand-in`
6. `analysis/launcher.rs`. Unit tests (temporary folders mimicking the npm layout, run on every OS through `TargetOs`): should resolve java-direct from a global `ccsh.cmd`; from a local `ccsh.cmd`; from a `ccsh.bat`; should prefer `JAVA_HOME`; should fall back to cmd-shim when `lib` is missing; should reject a cmd-shim argument containing `%` or `"`; should use the executable itself on unix. Integration test `tests/ccsh_launch_windows.rs` (`#![cfg(windows)]`): should pass an argument with spaces through a `.cmd` shim in a folder with spaces; should refuse `%`. Commit: `feat(core): resolve how to start ccsh per platform`
7. `analysis/runner.rs` (on plan 01's `ProcessRunner`, no process-tree code of its own). Integration tests with fake-ccsh: should resolve with exit code and captured output; should stream progress to the hook; should write run.log; should kill a hanging run on cancel and report cancelled; should time out; should flag the interactive marker. Commit: `feat(core): run and cancel a ccsh process`
- Acceptance: all tests green on Windows and unix; a scratch integration test analyses a real repo into a temp folder when a real ccsh is configured (skipped otherwise).

### M2 — Snapshot records (M)

1. `snapshots/map_head.rs`. Tests: should read checksum and root name from a gzipped map; should return none for a truncated file; should not read past 64 KiB. Commit: `feat(core): read checksum and root from a stored map`
2. `snapshots/git_state.rs`. Integration tests on temporary repos: should describe a commit with its parents; should list branches and tags pointing at it; should report detached HEAD; should report upstream with ahead/behind; should report dirty for an untracked file; should strip credentials from remote URLs. Commit: `feat(core): collect git state for a snapshot`
3. `snapshots/hosting.rs`. Unit tests with a fake runner: should derive github owner/repo from https and ssh URLs; should derive gitlab; should return none for other hosts; should map gh output to pull requests; should return an empty list when gh is missing, fails or times out. Commit: `feat(core): record hosting info on a best-effort basis`
4. `snapshots/repository.rs`. Tests in a temp store: should write a record and list it; should ignore dot folders and folders without a record; should replace an existing snapshot atomically; should read the log; should reject a malformed snapshot id; should build the working-tree id without characters illegal on Windows; should list an imported record with no analysis time, duration or profile hash; should map a commit-bound import to its commit. Commit: `feat(core): store and list snapshot records`
5. `analysis/janitor.rs`. Integration tests with a hand-made `codecharta-worktree-*` worktree: should remove a worktree that appeared during the run at the job's commit; should leave one that existed before; should leave one at another commit. Commit: `feat(core): clean up worktrees of killed analyses`
6. `analysis/service.rs` `execute`. Integration tests with fake-ccsh and a temporary repo: should produce a complete commit snapshot; should produce a dirty working-tree snapshot bound to HEAD; should produce a snapshot with `git: null` for a plain folder; should fail with head-moved when HEAD changes during the run; should leave no temp folder after success, failure or cancel; should keep the log of a failed run; should reuse a map for an identical tree when git is left out. Commit: `feat(core): turn an analysis run into a stored snapshot`
- Acceptance: a snapshot folder with `snapshot.json`, `map.cc.json.gz`, `run.log` matches section 5 of the shared decisions for all three target kinds.

### M3 — Queue, preflight, RPC and CLI (M)

1. `analysis/preflight.rs`. Tests: one per table row (fake tools report, temporary repo, stub `DiskSpace`). Commit: `feat(core): check prerequisites before an analysis`
2. `analysis/queue.rs`. Tests: should run one job at a time; should start the next after done, failed and cancelled; should cancel a queued job without starting it; should dedupe a queued or running key; should report already-analysed unless forced; should put a direct job ahead of batch jobs; should emit a notification on every transition; should keep at most 100 finished jobs. Commit: `feat(core): queue analysis jobs`
3. Contract types in `codecharta-core-api`, handlers `rpc/analysis.rs` and `rpc/snapshots.rs` (list, mapLocation, readLog only), `recover()` at start, cancel on shutdown, regenerated TypeScript types. Tests (core and protocol): should reject a malformed sha, an unknown project and a path-like snapshot id; should emit `analysis.queued/started/finished` over `serve`; should clean a leftover temp folder of a dead pid on start and leave one of a live pid. Commit: `feat(core): expose analysis and snapshots over JSON-RPC`
4. `cli/analyse.rs`, `cli/snapshots.rs` (`list`, `resolve` stubbed to `none` until M5). Tests (run the built `codecharta-core` binary against a temp store): should print the snapshot id and exit 0; should exit 1 with the error code on failure; should exit 2 for a bad sha. Commit: `feat(core): analyse and list snapshots from the command line`
5. Extend `createFakeDesktopBridge` (plan 01) with scriptable handlers for the `analysis.*` / `snapshots.*` methods and notification emitters (`completeJob(id)`, `failJob(id, error)`, `setResolution(...)`). It must stay one self-contained function (no imports used as values, no module constants) because the web Playwright suite injects it as source text; keep plan 01's "rebuilt from its own source text" spec green. Tests: should deliver notifications to subscribers; should stop after unsubscribe. Commit: `test(visualization): script analyses in the fake desktop bridge`
- Acceptance: `codecharta-core analyse --project … --folder …` produces a snapshot; from DevTools in the desktop app, `window.codeChartaDesktop` requests for `analysis.enqueue` yield a snapshot and notifications.

### M4 — Analyse from the UI and browse snapshots (M)

1. `AnalysisJobsService`, `SnapshotCatalogService`. Tests: should load jobs on start; should apply notifications; should reload a folder's snapshots on `snapshots.changed`; should stay empty without a bridge. Commit: `feat(visualization): track analysis jobs and snapshots in the app`
2. `LoadedSnapshotRegistry` + `ForgetRemovedSnapshotsEffect`, registered in `app.config.ts`. Tests: should find a ref by file name; should forget refs of removed files. Commit: `feat(visualization): remember which snapshot a loaded map is`
3. `cc-analysis-jobs-indicator`. Tests: should render nothing without jobs; should show the running count; should list progress and cancel a job; should offer the log of a failed job. Commit: `feat(visualization): show running analyses in the nav bar`
4. `cc-snapshots-dialog` with list, Open, Show log, "Analyse current checkout", "Analyse HEAD commit"; `SnapshotViewService.open(ref)` loading through `loadProjectSnapshots`. Tests: should list snapshots per folder; should mark other-profile rows; should flag imported rows with "unknown" analysis time and offer no re-analyse; should list unbound imports in the separate section; should load a snapshot and register it; should show preflight problems with hints. Commit: `feat(visualization): list, open and create snapshots`
5. `SnapshotBadgeProvider` + `provideSnapshotsForGitHistory()` (exports added to plan 04's facade only now, because knip needs a consumer). Tests: should badge a commit-bound import as analysed with the imported tooltip; should not badge an unbound import; should resolve a repository-relative path to a node path and return null when no snapshot of the repository is loaded; should badge analysed commits; should let a running job win over an existing snapshot; should offer "Analyse this commit" only for unanalysed commits. Commit: `feat(visualization): badge analysed commits in the history`
6. Changelog under `[unreleased]` → Added: `- **Analyses in the app**: analyse the current checkout or any commit of a project folder from the desktop app and reopen the result later.` Commit: `docs(visualization): announce in-app analyses`
- Acceptance: in the desktop app, "Analyse HEAD commit" shows progress, the snapshot appears in the dialog, opens, and the commit carries a badge in the history.
- As built (05-M4, design `05-snapshots.md` over this plan's UI): task 3 is the workspace status W1 (`features/workspaceStatus`, `cc-workspace-status` in the nav bar map slot, with the ACTIVITY section that replaces `cc-analysis-jobs-indicator`); S4 `cc-snapshots-dialog`, S9 `cc-analysis-log-dialog` and S6 `cc-preflight-problems` live in `features/snapshots/components/`, S4 opened through `SnapshotsDialogService`; the catalog lists `SnapshotSummary` (not `SnapshotEntry`) through `ProjectsFacade`; `SnapshotViewService` here only analyses and opens (the resolution flow is M5). Task 2 is not built: 03-M5's `ProjectsService.shownSnapshot` already names the one loaded snapshot (OD1); task 5 waits for 04-M4. Details in `progress/05-m4-analyse-ui.md`.

### M5 — Nearest snapshot and the stale notice (L)

1. `snapshots/nearest.rs`. Integration tests on temporary repos (`linear(n)`, `branchy()`, `unrelated()`): should return exact; should return the first analysed ancestor on linear history with the right count and without a count call; should pick the smaller count when two analysed ancestors sit on both sides of a merge; should return descendant when only a later commit is analysed; should return diverged with behind and ahead for a sibling branch; should prefer a descendant over a closer diverged snapshot; should skip snapshots of unrelated or missing commits; should return none without snapshots; should resolve the working tree to its own snapshot, else through HEAD; should return latest for a plain folder; should prefer the current profile for equal commits; should treat a commit-bound import as exact and as nearest ancestor and prefer an analysed one at equal profile; should never return an unbound import for a commit or for the working tree of a git folder; should return latest for a plain folder with only imports; should stop the stream after ten candidates; should serve a repeated call from the cache and miss after the set changed. Measure on a 100k-commit repository and add `--max-count` to the stream if needed. Commit: `feat(core): resolve the nearest analysed commit`
2. `snapshots.resolveForCommit` handler, the CLI `snapshots resolve`, fake-bridge support. Tests: protocol call returns each resolution kind; CLI prints it as JSON. Commit: `feat(core): expose snapshot resolution over RPC and CLI`
3. `noticeText.ts`. Tests: one per row of the wording table (including imported rows), plus singular/plural. Commit: `feat(visualization): word the stale-analysis notice`
4. `SnapshotViewService` resolution flow. Tests with the fake bridge: should load the exact snapshot for a selected commit; should load the nearest and keep the resolution; should not reload when the shown snapshot is already the resolved one; should ignore a late response for an earlier selection; should go empty without snapshots; should re-resolve and switch when the pending job finishes for the current target; should only toast when the user moved on; should surface a rejected enqueue; should re-resolve without enqueueing when the repository-changed signal reports a new HEAD. Commit: `feat(visualization): show the nearest snapshot for a selection`
5. `cc-snapshot-notice` in the shell template. Tests: should show the stale text and action; should hide after dismiss and return for another target; should not offer dismiss in the empty state; should show progress and cancel while analysing; should show failure with retry. Commit: `feat(visualization): notify when the shown analysis is stale`
6. `cc-snapshot-chip`. Tests: should show name and "stale by N"; should stay after the banner is dismissed; should open the snapshots dialog. Commit: `feat(visualization): keep staleness visible in the nav bar`
7. Changelog → Added: `- **Nearest analysis**: selecting a commit without an analysis shows the closest analysed commit, says how many commits it is off, and offers to analyse the selected one.` Commit: `docs(visualization): announce the stale-analysis notice`
- Acceptance: manual checklist items 4–8.
- As built (05-M5 renderer, design `05-snapshots.md` over this plan's UI): `SelectedTarget` lives in `features/snapshots/model/snapshotTarget.ts` (`workingTree` | `commit` | `snapshot`; no `snapshotView.model.ts`); `noticeText({ folderLabel, target, resolution, job }) -> { notice, badge }` (text as parts so SHAs are `font-mono`); task 5's notice is a persistent toast projected into `cc-toast` (OD9), shown over map views only; task 6 is not a `cc-snapshot-chip` but W1's badge, title line and MAP section ("Asked for", "Show current checkout", "Analyse <short>"); the target follows the design's "What the map follows" table, not every selection. Details in `progress/05-m5-nearest-snapshot.md`.

### M6 — Batches, retention, cleanup (M)

1. `analysis/batch.rs` + `analysis.enqueueBatch` / `analysis.cancelBatch`. Tests: should expand the last N first-parent commits; should peel annotated tags; should skip analysed commits; should cap at 200; should only estimate on a dry run; should cancel all jobs of a batch. Commit: `feat(core): queue analyses for several commits`
2. `cc-batch-analysis-dialog` (last N of the current branch, every tag) with the dry-run confirmation. Tests: should show counts and estimate; should enqueue on confirm. Commit: `feat(visualization): analyse the last commits or all tags`
3. `snapshots/retention.rs` + `usage`, `delete`, `planPrune`, `prune` handlers. Tests: should sum sizes per folder; should refuse to delete a snapshot being written; should keep branch tips, tags, the newest N and the shown snapshot; should list the rest; should never list an imported snapshot; should report a failing recycle bin and delete permanently only when asked (was "should fall back to removal when the recycle bin fails", replaced by the owner decision that deletions go to the recycle bin). Commit: `feat(core): measure and prune the snapshot store`
4. Delete action, store size footer and `cc-cleanup-dialog`. Tests: should ask before deleting; should list what a clean-up removes and the space it frees. Commit: `feat(visualization): delete snapshots and clean up the store`
5. Changelog → Added: `- **Analysis batches and clean-up**: analyse the last commits of a branch or every tag in one go, see how much space analyses take, and remove old ones.` Commit: `docs(visualization): announce analysis batches and clean-up`
- Acceptance: manual checklist items 9–11.

### M7 — E2E and docs (S)

1. Web Playwright with the fake bridge (`features/snapshots/e2e/snapshots.e2e.ts`, selectors only in `snapshots.po.ts`): should show the stale notice for a scripted resolution; should switch to the exact snapshot when the scripted job completes; should keep the chip after dismissing. Commit: `test(visualization): cover the stale notice end to end`
2. One case in plan 01's `_electron` smoke suite using the fake-ccsh binary as the configured ccsh and a temporary repository: should create a snapshot folder in a temporary store. Commit: `test(visualization): smoke-test an analysis in the desktop shell`
3. User docs page under `gh-pages/src/content/docs/docs/visualization/` describing analyses, the notice, batches, clean-up, the `codecharta-core analyse` command, prerequisites (ccsh ≥ 2.2.1, Java ≥ 22, git) and limits (submodules, LFS, long paths). Commit: `docs(gh-pages): describe in-app analyses and snapshots`

## Repo rules that bite here

- **Core gates** (from `core/`): `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`; follow plan 01's lint configuration. No panics on external input; no magic numbers — name `MAX_CANDIDATES`, `WALK_LIMIT_AFTER_FIRST_HIT`, `MAX_FALLBACK_CANDIDATES`, `ANALYSIS_TIMEOUT`, `PROGRESS_EMIT_INTERVAL`, `MAP_HEAD_BYTES`, `MAX_BATCH_JOBS`, `MAX_CAPTURED_BYTES`, `HOSTING_BUDGET`. Methods stay short with request structs instead of long parameter lists (`CODE_QUALITY.md`). Tests must work on Windows and unix; Windows-only behaviour is tested under `cfg(windows)`.
- **Generated contract**: never edit `visualization/app/codeCharta/model/coreApi/` by hand; plan 01's drift check fails the build. Whether dependency-cruiser allows features to import that folder is UNVERIFIED — check `.dependency-cruiser.cjs` and extend it if needed in M3.
- **dependency-cruiser** (`npm run lint:architecture`): other code may import only `features/snapshots/facade.ts` and `features/snapshots/effects/snapshots.effects.ts`; `snapshots` may import `features/gitHistory/facade.ts`, `features/projects/facade.ts`, `features/shared/facade.ts`, `load/load.facade.ts`, `stores/fileStore/fileStore.facade.ts` — and `gitHistory` must not import `snapshots` (hence the ports). `@ngrx/store`/`@ngrx/effects` only under `features/snapshots/effects/`. `services/` must not import `components/`. `NameDataPair` comes from `stores/fileStore/fileStore.facade.ts` (`wire-dto-only-in-filestore-boundary`). Components must not import any `*.write.facade.ts`.
- **knip** (`npm run lint:deadcode`): every export from `facade.ts` needs a consumer in `app/` in the same commit; add facade exports only in the task that first uses them.
- **Styles**: no component stylesheet (`npm run lint:styles`); daisyUI/Tailwind classes and Font Awesome icons only; no `@angular/material|cdk`.
- **Biome** (root `npm run format:check`): no `forEach`, block statements, template literals instead of concatenation, `noConsole` (only `warn`/`error`), no non-null assertions, 140 columns, no semicolons.
- **Coverage**: the Jest 80 % global gate counts `app/**/*.ts`; every new Angular service and component needs its spec in the same commit. The core is gated by its own cargo checks.
- **Zoneless**: bridge callbacks and timers do not trigger change detection — every one must end in a `signal.set/update`. Tests use `await fixture.whenStable()`, no `fakeAsync`.
- **Persistence**: this plan adds nothing to `CcState`: no migration, no `DB_VERSION` bump, no `actionsRequiringSaveCcState.ts` entry. A later need to persist the dismissed notice or a prune policy goes into `store.json` / `project.json` in the managed store, owned by the core.
- **Changelog** (`visualization/CHANGELOG.md`, `[unreleased]`): one bold title plus one sentence per user-visible change, no file or symbol names; rewrite an existing entry rather than appending a second one.
- **Commits**: conventional, scope from `analysis, visualization, docker, gh-pages, docs, readme, stg, config, core` (plan 01 adds `core`), subject ≤ 72 characters, structural commits before behavioural ones.
- **Type check**: `npx tsc --noEmit -p tsconfig.json` covers specs; `strictNullChecks` is off, so `null` handling in generated types is not compiler-enforced — test it.

## Manual verification

Packaged or `npm start` desktop app on Windows, stock ccsh 2.4.0 installed with `npm i -g codecharta-analysis`, Java ≥ 22, a project with one git folder whose path contains a space.

1. Tools show ccsh, Java and git as found. "Analyse HEAD commit": progress moves, finishes; the store has `snapshots\<folderId>\<sha>-<hash>\` with the three files; `git worktree list` shows no `codecharta-worktree-*`; `git status` is unchanged.
2. Edit a file, "Analyse current checkout": the snapshot is named `…+dirty`, the chip shows `dirty`.
3. Start an analysis of a large repo and cancel at ~30 %: the job shows cancelled within a few seconds; no `java.exe` child remains; `git worktree list` is clean; no `.tmp-*` folder in the store.
4. Select the commit analysed in step 1 in the history: map shows, no notice.
5. Select a commit three commits newer: banner "No analysis for … — showing … stale by 3 commits", chip `stale by 3`. Dismiss: banner gone, chip stays.
6. Click "Analyse … now": banner turns into progress; on completion the map switches and banner and chip disappear.
7. Repeat 6 but select another commit while it runs: no switch, a toast announces completion, the history badge appears.
8. Select a commit older than every analysed one: wording "ahead by N". Select a commit on a sibling branch: "diverged: N behind / M ahead".
9. "Analyse several…" → last 5 commits: confirmation shows how many are new; jobs run one by one; "Cancel" on the batch stops the rest.
10. Snapshots dialog: sizes shown; delete one → it is in the recycle bin; "Clean up…" lists candidates and frees the stated space.
11. Reload the window (Ctrl+R) during a run: the jobs indicator and the banner come back with the running job.
12. Point the ccsh path at a non-existent file, and separately put Java 17 first on PATH: both give a readable error with a hint, not a hang.
13. Kill the core process (and then the whole app) during a `--commit` run, start the app again: the leftover temp folder and worktree are removed on start.
14. A helper folder that is not a git repository: only "Analyse now" is offered; snapshots are listed by date; no staleness wording.
15. Import a cc.json bound to a commit without an analysis and one without a commit (plan 03): the bound one shows an "imported" chip, is used as the nearest snapshot for newer commits and carries a history badge; the unbound one appears only under "Imported — analysis time unknown", never as nearest, and is never offered by "Clean up…".
16. Commit a change in the app (plan 04): the banner and chip re-evaluate to "stale by 1 commit" for the new HEAD without starting an analysis; the same after a pull.
17. With the app closed, run `codecharta-core analyse --project <id> --folder <id>` from a terminal: a snapshot appears in the store; start the app and it is listed.

## Out of scope

- Comparing two snapshots, PR/MR pickers, "no differences" handling for identical checksums (plan 06; this plan only exposes `map_checksum` and `analysis.enqueueBatch` with `Commits`).
- The commit list, branch switcher and ref resolution (plan 04); project and profile editors, store location, import of existing cc.json files (plan 03); tool discovery, paths UI, process runner, contract generation, packaging (plan 01).
- Incremental analysis (`--base-file`), `--local-changes` runs, scheduled or git-event-driven analysis, analysing remote commits that were not fetched.
- Changing cc.json or ccsh (see "Optional analysis-side changes").
- Deduplicating map bytes across snapshots, compressing or archiving the store, pinning snapshots.
- svn history for commit targets (ccsh skips it).

## Risks and unknowns

| Risk | Resolution |
|---|---|
| Installed ccsh layout or direct Java start differs from the build script reading | Spike M0.1; `CmdShim` fallback exists; record the layout in Notes |
| Rust `Command` behaviour for `.cmd`/`.bat` arguments differs from assumption | Spike M0.2; the fallback rejects rather than escapes unsafe characters |
| Progress segments are not parseable in practice (interleaving inside one write) | Spike M0.3 with raw bytes; the UI supports indeterminate — if parsing is unreliable ship indeterminate only and keep `ProgressParser` behind a constant |
| stdout encoding on Windows garbles the `Map:` path for non-ASCII folders | The single-file-in-temp-dir fallback does not depend on the line; M0.3 checks the encoding flags |
| Worktree checkout fails on long paths under `%TEMP%` | Classified `worktree-failed` with the `core.longpaths` hint; `worktree_temp_dir` (java-direct only) moves it to a short path — needs a Tools setting from plan 01, else unset |
| `gh pr list --search <sha>` / `glab api …/merge_requests` do not return what is assumed, or prompt for login | Spike M0.5 / M2.3; 10 s budget, stdin closed, any failure → empty list; plan 06 may replace the probe |
| Killing the JVM leaves a git child holding files so `worktree remove --force` fails | Janitor retries three times at 500 ms; the leftover is retried at next start via `job.json` |
| Very large histories make steps 5a/6 of the resolution slow | Stream stopped early; fallback capped at 50 candidates; cached; measured in M5.1 |
| The fake-ccsh binary is not built when an integration test needs it | `tests/common` builds it once with `cargo build -p fake-ccsh`; UNVERIFIED whether `cargo test` already does |
| A CLI analysis runs while the app serves the same store | Temp folders carry the pid and recovery skips live pids; snapshot commit is an atomic rename; dedupe is per process (a duplicate snapshot is harmless) |
| Plans 01/03/04 deliver different names or omit `loadProjectSnapshots`, a streaming `rev_list`, the badge ports | "Required from other plans" states the contract; implement the missing piece in the first milestone that needs it and note it |
| ccsh takes longer than 30 min on a huge repository | `ANALYSIS_TIMEOUT` is one constant; raise or make it a store setting if the owner hits it |
| A map changes between ccsh versions for the same commit and profile | `ccshVersion` is recorded; identity deliberately ignores it; "Re-analyse" (`force`) replaces the snapshot |
| `trash` crate unavailable on a platform (headless Linux) | Fallback to `remove_dir_all` after the same confirmation |

## Decisions taken (owner-settled, no open questions)

1. **Notice form:** a non-modal banner under the nav bar with "Analyse now" and "Dismiss", plus a permanent "stale by N" chip beside the snapshot name.
2. **Mixing profiles:** the nearest snapshot may come from a different analysis profile and is flagged.
3. **Auto-analyse:** never. Selecting an unanalysed commit, or a commit / pull / push / fetch / switch, only re-evaluates the notice for the new HEAD.
4. **Retention:** nothing is deleted automatically; "Clean up…" proposes keeping branch tips, tags, the newest 50 commit snapshots and the newest 3 checkout snapshots per folder, and never proposes imported snapshots.
5. **Deleting:** deleted snapshots go to the recycle bin.
6. **Hosting lookup:** when `gh`/`glab` is installed, each analysis makes one read-only call to list PRs/MRs containing the commit and stores number, title, state and branch names in the snapshot record; no tokens are stored.
7. **"Last N commits":** first-parent history of the branch, N capped at 200.
8. **Imported snapshots:** unknown analysis time; a commit-bound import counts like any snapshot of that commit (flagged "imported"), an unbound import is never "nearest" and is listed under "Imported — analysis time unknown".
9. **Backend:** all analysis and snapshot logic is in the Rust core and usable from the command line; Electron only relays and reads the map file.

## Notes

Facts checked against the repository when this plan was written:
- Confirmed present: all `analysis/**` and `visualization/**` files, line anchors and message strings cited under "Current state" (`requestFor`, `HistoryFinder` svn skip, `Map:` line, `DUMMY_PROJECT_NAME`, `mergedCommitHash`, `No commit found for`, `Failed to create git worktree`, `Git command timed out`, `GIT_TIMEOUT_MINUTES`, `Unknown command:` / `Select an analyser to execute`, `shouldStartInteractiveMode`, `ccsh needs Java`, `getFileMetaData`, `removeFilesFromState`, `loadFromUpload` / private `commit`, `FilesLoadedSource`, `ToastService.show`, nav bar `navbar-start/center/end`, shell `cc-toast` / `cc-nav-bar`, the dependency-cruiser rule names used above).
- Not present yet (created by earlier plans): `core/`, `visualization/app/codeCharta/model/coreApi/`, `loadProjectSnapshots`, `FileMeta.projectSnapshot`, the `gitHistory` ports. Names in "Required from other plans" are assumptions to reconcile with plans 01, 03 and 04 as delivered.
- `visualization/CHANGELOG.md` and `analysis/CHANGELOG.md` exist; the commitlint scope list is in the root `commitlint.config.js`.
- UNVERIFIED and covered by spikes or implementer checks: installed ccsh layout, Rust `Command` behaviour for `.cmd` arguments, picocli exit code 2, `gh pr list --search <sha>` shape, `glab api` merge-request lookup, a streaming `rev_list` in plan 04's `GitService`, a "working tree" selection in plan 04's facade, the exact crates and versions (`regex`, `flate2`, `sha2`, `trash`, `fs4`, `sysinfo`, `async-trait`, `tokio-util`, `ts-rs`), how `cargo test` builds the `fake-ccsh` workspace crate.

Spike results, renamed dependencies and deviations go below.
