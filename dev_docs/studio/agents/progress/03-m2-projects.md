---
name: 03-M2 projects - core, RPC, CLI, shell, fake
state: progress
version: 1
---

## Goal

Projects with their folders in the managed store: folder inspection with git, pick tokens, the project
repository, folder operations, `projects.*` over JSON-RPC, the `projects` CLI, then the shell and the
fake bridge (plan 03, Milestones, M2).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M2 (tests to write first are listed there).
Split by orchestration: part A (tasks 1–7, core only) now; part B (tasks 8–9, shell and fake bridge)
after 01-M3 (shell) and 01-M4.1 (fake bridge) are merged.

Applies throughout: owner decision OD1 (`design/owner-decisions.md`) — `project.json.view` holds
`workingFolderId: FolderId | null`, not `visibleFolderIds`; `projects.setView` takes `{ workingFolderId }`
(a `projects.setWorkingFolder` method is acceptable). Reconciliation of `03-m0-spikes.md` item 0 and the
store API of `03-m1-store-core.md` apply. Git fixtures go in `tests/support/git_fixture.rs` re-exported from
`tests/support/mod.rs` (overview section 10 overrides the plan's `fixture_repo.rs`).

### Part A
1. Folder relationships (pure)
2. Hermetic git fixture, folder inspector (credentials stripped from remote URLs; shallow clones report a
   graft point from `rev-list --max-parents=0`; root commits are a set; canonicalise before comparing with
   `--show-toplevel`; empty repo: `rev-parse --abbrev-ref HEAD` exits 128)
3. Pick tokens and validated project requests
4. Project repository
5. Folder operations
6. `projects.*` over JSON-RPC, `projects.sourceFileLocation`, contract regeneration
7. CLI `projects list|create|add-folder` (the plan's `--store-root` does not exist; use `--data-dir`)

### Part B (blocked on 01-M3, 01-M4.1)
8. Shell: `projectsShell.js`, preload exposure, stubs in the fake bridge
9. In-memory projects backend in the fake bridge

## Steps

- [x] 1. Relationships
- [x] 2. Fixture and inspector
- [x] 3. Pick tokens
- [x] 4. Repository
- [ ] 5. Folder operations
- [ ] 6. JSON-RPC
- [ ] 7. CLI
- [ ] 8. Shell (part B)
- [ ] 9. Fake bridge backend (part B)

## Notes

Environment (2026-11-18): Arch Linux x86_64, rustc/cargo 1.95.0, git 2.56.0, node 26.13.0. Part A was done on
`feature/studio-03-m2` from `feature/studio-integration` (01-M1, 01-M2, 03-M1; no shell).

### 1. Relationships
- Api: `FolderGitFacts`, `GitRemote`, `FolderRelationship`, `RelationshipKind` live in
  `codecharta-core-api/src/methods/projects.rs` (the pattern as built: one `methods/<domain>.rs` per domain,
  not the plan's `src/projects.rs`). Validated text newtypes other than store ids go in a new
  `codecharta-core-api/src/values.rs` (`validated_text!` macro; the error names the rule, never the value);
  `FullCommit` arrives here, the others with their first user.
- `folders/relationships.rs`: `normalise_remote_url` gives `host/path` (host lowercase, no user, password,
  port, trailing slash or `.git`) for scheme and scp-like urls; `file://` urls and local paths (also
  `C:\...`) only lose the trailing slash and `.git`. `derive_relationships(&[GitFolder { id, git }])`
  takes only folders that have git facts (plain folders have no relationships) and returns an entry, maybe
  empty, for each. Per ordered pair: `forkOf`, else `sharesHistoryWith` (neither shallow), else
  `sameRemote` (both have `origin`). The upstream of a fork therefore sees `sharesHistoryWith`, the fork
  sees `forkOf`. Extra tests: `should_keep_local_paths_apart_from_hosts`,
  `should_report_same_remote_for_equal_origins`.

### 2. Fixture and inspector
- `git/runner.rs` (new module `git/`, plan 04 extends it): `GitRunner` trait, object-safe through a boxed
  future (`fn run(&self, cwd, args: &[&str]) -> GitFuture`), `GitOutput { exit_code, stdout }` (a non-zero
  exit is an answer), `GIT_TIMEOUT` = 15 s. `Tools` implements it over `Tools::run(ToolId::Git, ..)`; git
  missing is `TOOL_NOT_FOUND`, which the inspector turns into `plain`.
- `tests/support/git_fixture.rs` extended (not a new `fixture_repo.rs`): `TempRepo::clone_full`,
  `clone_shallow` (`--depth 1` over a `file://` url), `add_remote`, `subfolder`, `runner()` -> `FixtureGit`,
  a `GitRunner` over the core's own `ProcessRunner` with the system git and the repository's hermetic
  variables. The plan's `create()` / `commit(message, files)` are the existing `new()` / `commit_file`.
- `folders/inspector.rs`: `inspect_folder(&dyn GitRunner, path) -> FolderInspection { kind, git }` (async)
  and `resolve_commit(.., &CommitHash) -> CoreResult<Option<ResolvedCommit>>`. `kind` comes from
  `--show-toplevel` alone; `is_repository_root` canonicalises both sides (case-insensitive on Windows, no
  `dunce`). Shallow: `rootCommits` stays empty (03-M0 item 3.5 finding 1). Default branch: `origin/HEAD`,
  else the current branch from `rev-parse --abbrev-ref HEAD` whatever its exit code; empty or `HEAD` is
  none. Remotes: first url per name, credentials stripped before anything else sees them
  (`strip_credentials`: http/https lose the whole user part, since a token is often the user name; other
  scheme urls lose only the password; scp-like urls are unchanged). `resolve_commit` uses
  `rev-parse --verify --quiet <hash>^{commit}` (any non-zero exit, including an ambiguous short hash, is
  `None`) and `show -s --format=%H%x00%h%x00%s%x00%an%x00%aI`; the plan's `%cI` and `%P` fields are for
  binding imports (03-M3), which adds them. Note: git 2.56 writes `%aI` for UTC as `...Z`.
- Api additions: `FolderKind`, `ResolvedCommit`, `CommitHash` (7-40 lowercase hex). `timestamps::now()`
  (RFC 3339 UTC seconds) is shared by the inspector and the repository.
- Extra tests: `should_report_no_root_commits_for_a_shallow_clone`, `should_read_the_fields_of_a_shown_commit`,
  `should_refuse_a_commit_hash_that_could_be_an_option`. The stub-runner test is a unit test.


### 3. Pick tokens
- Api `values.rs`: `PickToken` (32 lowercase hex), `Label` (1-60 characters, none of `/ \ :` or control
  characters), `ProjectName` (1-80, not blank, no control characters), `Description` (0-500; empty clears
  it), `ExcludePattern` (1-200, no line breaks). `methods/projects.rs`: `FolderRole`, `AnalyserName`
  (lowercase, the six of the plan), `AnalysisProfile` (`deny_unknown_fields`, at most 50 patterns through
  `deserialize_with`, default `{ exclude: [], without: [], parallel: true }`), `NewFolder`.
- New error code `TOKEN_EXPIRED` (appended; `ErrorCode::ALL` now 16; `CoreError::TokenExpired { what }`,
  "folder" or "file"); contract regenerated (`ErrorCode.ts`, `CORE_ERROR_CODES`).
- `ids.rs`: `new_token()` (16 random bytes as hex). `projects/tokens.rs`: `PickTokens` with
  `issue_folder`, `issue_file`, `take_folder`, `take_file`, `take_folders` (all or nothing) and
  `give_back`. **Deviation in shape, not in rule:** the plan's "consumed on first successful use" is
  `take_*` before the use and `give_back` after a failed one, so two concurrent uses of one token can never
  both succeed. A token of the wrong kind, an unknown or an expired one is `TOKEN_EXPIRED`. Lifetime
  `PICK_TOKEN_LIFETIME` = 15 min (`with_lifetime` for tests); expired entries are dropped whenever a new
  token is issued. Tokens live only in the serving process's memory.

### 4. Repository
- Crate `trash` 5.4.0 (MIT; its transitive packages passed the licence check in 03-M0 item 3.1; `cargo deny`
  itself is not installed here). `recycle.rs`: `Recycler`, `SystemRecycler` (a missing path is `NOT_FOUND`
  before `trash` is asked, 03-M0 item 3.2), `delete_permanently` (`remove_dir_all`).
- Api: `FolderStatus`, `ProjectFolder`, `ProjectView { workingFolderId, shownSnapshotIdByFolder }` (OD1),
  `Project`, `ProjectSummary`, `UpdateProjectParams` (optional fields are `field?: T` in TypeScript through
  `#[ts(optional)]`).
- Core: `projects/record.rs` (`ProjectRecord`, `FolderRecord`: `project.json` as stored, without the derived
  fields; `PROJECT_SCHEMA_VERSION` = 1), `projects/derived.rs` (`to_project`, `to_summary`: status from
  `is_dir`, relationships, snapshot counts = directories named like a snapshot id under
  `snapshots/<folderId>/`), `projects/folders.rs` (`FolderToAdd { path, label, role }`, `suggested_label`,
  `attach_folder`: first folder primary, a new primary demotes the old one to helper, the working folder
  defaults to the first folder), `projects/repository.rs` (`ProjectRepository::new(&Store, &dyn GitRunner,
  &dyn Recycler)`: `list`, `get`, `create(NewProject)`, `update(UpdateProjectParams)`, `delete(id,
  permanently)`).
- Rules: every write holds `ProjectLocks` and needs a writable store; folder paths are stored absolute
  (`std::path::absolute`, not canonicalised, so no `\\?\` prefix on Windows). `get` re-inspects every
  folder that exists and writes `project.json` only when a fact other than `detectedAt` changed and the
  store is writable; an inspection that finds no git keeps the cached facts. A `project.json` with a newer
  `schemaVersion` is `CONFLICT` for `get` and a `problem` in `list` (name taken from the raw file when
  possible); the list is sorted by name, case-insensitive. An empty description is stored as none.
  `delete` recycles `projects/<id>/` (or deletes it when `permanently`) and clears `session.json` when it
  named this project. A project may have no folders (`workingFolderId` is then null).
- Tests (`tests/projects.rs`, real git through `FixtureGit`, `RecordingRecycler` in `tests/support`): the plan's
  five plus `should_derive_kind_status_and_counts_when_getting_a_project`,
  `should_update_name_description_and_profile`, unit `should_suggest_the_folder_name_as_label`.
