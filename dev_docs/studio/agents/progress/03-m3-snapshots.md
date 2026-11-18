---
name: 03-M3 snapshots - core, RPC, CLI, shell
state: progress
version: 1
---

## Goal

Snapshots of a folder in the managed store: list and manage them, import cc.json files, open a cc.json
file into a project, `snapshots.*` over JSON-RPC, the `snapshots` CLI, then the shell (plan 03,
Milestones, M3).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M3 (tests to write first are listed there).
Split by orchestration: part A (tasks 1–5, core) now, branched from `feature/studio-03-m2` because that
branch is verified but not yet merged; part B (task 6, shell and fake bridge) after 03-M2 and 01-M4.1
are merged.

From `03-m2-projects.md`: append `NOT_A_COMMIT`; `resolve_commit` must also read `%cI` and `%P`; reuse
`Core::projects()`, `resolve_folder`, `read_record`/`modify` (project lock), `PickTokens::issue_file`/
`take_file`/`settle` for import tokens, `pick_folder` for the containing folder;
`ShellPathTarget::SnapshotMap` replaces its `NOT_FOUND` stub. OD1 applies (`workingFolderId`).

### Part A
1. Snapshot repository
2. Import
3. Open a file into a project, move
4. `snapshots.*` over JSON-RPC, `snapshots.mapLocation`, contract regeneration
5. CLI `snapshots list|import` (`--data-dir`, not `--store-root`)

### Part B (blocked on 03-M2 merge, 01-M4.1)
6. Shell: `snapshotsShell.js`, preload, fake bridge

## Steps

- [x] 1. Repository
- [x] 2. Import
- [ ] 3. Open file and move
- [ ] 4. JSON-RPC
- [ ] 5. CLI
- [ ] 6. Shell (part B)

## Notes

Environment (2026-11-18): Arch Linux x86_64, rustc/cargo 1.95.0, git 2.56.0, node 26.13.0, npm 12.2.2. Part A
on `feature/studio-03-m3`, branched from `feature/studio-03-m2` (verified, not yet merged). Every task also
ran `cargo clippy --all-targets --all-features --target x86_64-pc-windows-gnu -- -D warnings`; nothing ran on
Windows.

Verified before starting: `core/` holds 03-M2's `projects/`, `git/runner.rs`, `serve/projects_routes.rs`;
the hand-over names (`Core::projects()`, `resolve_folder`, `read_record`/`modify`, `PickTokens::issue_file`/
`take_file`/`settle`, `pick_folder`, `ShellPathTarget::SnapshotMap` stub in `Paths::resolve`) exist as
described.

### 1. Repository
- Api: `methods/snapshots.rs` (the pattern as built, not the plan's `src/snapshots.rs`) with
  `SnapshotSource { analysed, imported }`, `SnapshotRef`, `SnapshotSummary` (the Rust field is
  `snapshot_ref`, written as `ref`). `values.rs`: `MapChecksum` (1-128 ASCII letters or digits) and
  `RootName` (1-255 characters, no `/` or control characters) for `recordMapFacts`.
- Core: `snapshots/record.rs` (`SnapshotRecord`, `SNAPSHOT_SCHEMA_VERSION` = 1, with typed `git`, `hosting`,
  `analysis`, `imported`, `map` blocks after overview section 5; plan 05 fills `analysis`/`hosting` and may
  refine those two). **Addition to section 5: `createdAt`**, the time the snapshot entered the store, because
  `SnapshotSummary.createdAt` and "newest first" need it for analysed and imported snapshots alike (for an
  imported one it equals `imported.at`). `imported` is left out of an analysed record rather than written as
  null.
- `snapshots/repository.rs`: `SnapshotRepository::new(&Store, &dyn GitRunner, &dyn Recycler)` (also
  `Core::snapshots()`), `list` (newest first by `createdAt`, then id), `find_by_commit`, `map_location`,
  `delete(ref, permanently)` (through `ProjectRepository::modify`, so under the project lock; a folder that
  showed the snapshot forgets it), `record_map_facts(ref, MapFacts)`, `begin_snapshot`, `commit_snapshot`,
  `abort_snapshot`. A directory is a snapshot only when its name is a snapshot id and its `snapshot.json` is
  readable, not newer than this core and names that same project, folder and id; anything else is skipped
  with a warning. An unknown project or folder is `NOT_FOUND`.
- **Deviation in shape:** `commit_snapshot` is `async` (it takes the tokio project lock) and removes the
  staging directory itself when it fails, since it consumes the `StagedSnapshot`; a target that exists
  already is `CONFLICT`. `StorePaths` gained `snapshot_file`, `staging_dir` and the `snapshot.json` /
  `run.log` names; `ids::new_staging_suffix` (8 hex). `folder_operations::existing_folder` is now
  `pub(crate)`.
- Tests (`tests/snapshots.rs`, shared `tests/support/store_workspace.rs`): the plan's five plus
  `should_refuse_to_commit_over_an_existing_snapshot_and_remove_the_staging_directory`,
  `should_answer_the_map_location_and_not_found_for_an_unknown_snapshot`,
  `should_record_the_map_facts_the_renderer_reports`, `should_find_the_snapshots_of_a_commit`,
  `should_answer_not_found_for_a_folder_outside_the_project`.

### 2. Import
- Crates `flate2` 1.1.11 and `sha2` 0.10.9 (both MIT OR Apache-2.0). New lockfile packages: adler2, block-buffer,
  cpufeatures, crc32fast, crypto-common, digest, flate2, generic-array, miniz_oxide, sha2, simd-adler32, typenum,
  version_check, zlib-rs (licences MIT / Apache-2.0 / 0BSD / Zlib, all allowed by `deny.toml`; `cargo deny`
  itself is not installed here).
- New error code `NOT_A_COMMIT` (appended; `ErrorCode::ALL` now 22; `CoreError::NotACommit { commit }`);
  contract regenerated (`ErrorCode.ts`, `CORE_ERROR_CODES`).
- `folders/inspector.rs`: `SHOW_COMMIT_FORMAT` now reads `%cI` and `%P`; new `commit_details` returns
  `CommitDetails { resolved, commit_date, parents }`; `resolve_commit` keeps its signature and the api type
  `ResolvedCommit` is unchanged. `ProjectRepository::reachable_git_folder` (extracted from `resolve_commit`)
  is the one `FOLDER_UNAVAILABLE` check. `ids::imported_snapshot_id`, `timestamps::of`,
  `projects::folders::suggested_project_name` (folder name, control characters removed, at most 80, else
  "Project"); `location_key` and `project_ids` are now `pub(crate)`.
- Api: `CommitHint`, `ContainingFolder` (`suggestedName` is a `ProjectName`), `ExistingTarget`,
  `PickedImportFile`.
- **Deviation in layout:** `snapshots/content.rs` (`ImportFile`: absolute path, regular file else
  `BAD_REQUEST`, missing `NOT_FOUND`, gzip by magic bytes, `content_sha256` streamed through
  `MultiGzDecoder` for gzip, `copy_as_gzip`; `commit_hint_of`: the part before the first `.` must be a
  `CommitHash`) and `snapshots/import.rs` (`inspect_import_file(tokens, path)`, `import_file(ImportRequest
  { target, file, bind_to_commit }) -> ImportOutcome { snapshot, was_already_imported }`, `bound_git`,
  `imported_duplicate`, `existing_target`). Plan module table corrected.
- Rules as built: a broken gzip is `BAD_REQUEST`. The duplicate search runs before anything is written and
  covers every folder of the target project; a hit returns that snapshot with `was_already_imported`.
  Binding re-verifies in the folder (`FOLDER_UNAVAILABLE` unless an `ok` git folder, `NOT_A_COMMIT` unless
  `rev-parse --verify` names exactly that commit) and records the folder's cached (credential-free) remotes.
  `inspect_import_file` needs an absolute path, issues a folder token for the containing folder (through
  `pick_folder`) and the file token last; `existing_target` is the most recently updated project with a
  folder at the containing folder's path (same `location_key` as the duplicate-folder check); `duplicate_of`
  is looked up in that project; the hint is resolved only when the containing folder is `git`.
- Tests: hash and hint tests are unit tests in `content.rs` (plus `should_refuse_a_folder_and_a_broken_gzip_file`);
  the rest in `tests/snapshot_import.rs` plus `should_answer_folder_unavailable_when_binding_in_a_plain_folder`,
  `should_inspect_a_file_in_a_repository_that_is_already_a_project_folder`,
  `should_refuse_a_relative_path_to_inspect`; unit `should_read_a_root_commit_without_parents`,
  `should_build_imported_ids_from_the_content_hash_and_the_commit`,
  `should_suggest_the_folder_name_as_project_name`.
- Not done: no size limit on imports (the plan names none); hashing and copying run on the request's task,
  not `spawn_blocking`.

