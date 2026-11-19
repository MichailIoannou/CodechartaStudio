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
- [x] 5. Folder operations
- [x] 6. JSON-RPC
- [x] 7. CLI
- [x] 8. Shell (part B)
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

### 5. Folder operations
- New error codes (appended; `ErrorCode::ALL` now 20): `DUPLICATE_FOLDER`, `DUPLICATE_LABEL`,
  `FOLDER_UNAVAILABLE`, `DIFFERENT_HISTORY`; contract regenerated. `NOT_A_COMMIT` and `TOO_LARGE` join with
  their first user (03-M3 bind-to-commit, task 6). Api `FolderRef { projectId, folderId }`.
- `projects/folder_operations.rs` (a second `impl ProjectRepository`): `add_folder`, `update_folder(FolderRef,
  FolderChanges { label, role })`, `remove_folder(FolderRef, permanently)`, `relink_folder(FolderRef, Relink
  { path, accept_different_history })`, `refresh_folder`, `resolve_folder -> ResolvedFolder { path, kind,
  status }` (for plans 04/05/06), `set_view(project, ProjectView)`, `resolve_commit(FolderRef, &CommitHash)`.
- Rules as built: duplicate paths compare canonicalised when the folder exists (else the stored text without
  a trailing separator), case-insensitive on Windows; labels case-insensitive. Making a folder primary
  demotes the old one to helper; turning the primary folder into another role is `BAD_REQUEST` (a project
  keeps one primary). Removing a folder recycles `snapshots/<folderId>/` first (or deletes it), drops its
  `shownSnapshotIdByFolder` entry, promotes the first remaining folder when the primary left and moves the
  working folder to the primary (or null). Relink: `DIFFERENT_HISTORY` when both old and new facts have root
  commits and they share none (shallow clones and repositories without commits have none, so they pass);
  the folder id, and with it the snapshots, stays. `refresh_folder` on a missing folder and
  `resolve_commit` outside an `ok` git folder are `FOLDER_UNAVAILABLE`. `set_view` refuses (`NOT_FOUND`) a
  working folder or a shown snapshot that is not in the project (snapshot = its directory exists).
- Tests: the plan's six plus `should_refuse_to_leave_a_project_without_a_primary_folder`,
  `should_recycle_the_snapshots_of_a_removed_folder`, `should_refuse_a_view_naming_a_folder_outside_the_project`,
  `should_resolve_commits_only_in_git_folders`.

### 6. JSON-RPC
- Structural commit first: the protocol tests' `ServingCore` moved to `codecharta-cored/tests/support/mod.rs`
  (`refactor(core): share the serving core helper of the protocol tests`), so `tests/projects_protocol.rs`
  can use it.
- Api (`methods/projects.rs`): params `ProjectIdParams`, `InspectFolderParams`, `CreateProjectParams`,
  `DeleteProjectParams`, `AddFolderParams`, `UpdateFolderParams`, `RemoveFolderParams`, `RelinkFolderParams`
  (`acceptDifferentHistory?: boolean`), `SetActiveProjectParams { projectId | null }`, `SetViewParams { projectId,
  view }`, `ResolveCommitParams`, `SourceFileParams`; results `ProjectList`, `PickedFolder`, `ActiveProject`,
  `ResolveCommitResult`, `FolderPath`, `SourceFileLocation`, `SourceFileLookup`. Every request type has
  `deny_unknown_fields`; `FolderRef` & `{ .. }` are written out as flat structs because serde's `flatten`
  does not work with `deny_unknown_fields`. 17 methods registered with a local `method!` macro.
- **Deviation: three results are wrapped** (`ProjectList { projects }`, `ResolveCommitResult { commit }`,
  `SourceFileLookup { location }`) instead of the plan's `ProjectSummary[]`, `ResolvedCommit | null`,
  `SourceFileLocation | null`: the export (`export-contract`, `referenced_types`) only exports and imports
  named types, and `Vec<T>` / `Option<T>` are unnamed, so the element types would be missing from the
  contract. Plan text corrected.
- `projects.setView` takes `{ projectId, view: { workingFolderId, shownSnapshotIdByFolder } }` (OD1; no
  separate `setWorkingFolder`). `projects.setActive` refuses an unknown project (`NOT_FOUND`);
  `projects.getActive` answers null for a remembered project that no longer exists (03-M1 left both to M2).
- New error code `TOO_LARGE` (appended, `ErrorCode::ALL` now 21; `details.limitBytes` like
  `OUTPUT_TOO_LARGE`). `projects/source_files.rs`: `source_file_location` (folder `ok` else
  `FOLDER_UNAVAILABLE`; `confine_to_folder`; missing file `null`; a directory `BAD_REQUEST`; above
  `MAX_SOURCE_FILE_BYTES` = 16 MiB `TOO_LARGE`; `path` and `folderRoot` are canonical, so the shell can
  check `path` starts with `folderRoot`).
- Core facade: `Core::projects() -> CoreResult<ProjectRepository>` (goes through `Core::store()`, so a store
  that failed at start-up answers its problem), `Core::pick_tokens()`; `Core` owns `PickTokens` and a
  `SystemRecycler`. `projects/active.rs`: `active_project`, `set_active_project`, `pick_folder(git, tokens,
  path)` (absolute existing folder, else `BAD_REQUEST` / `NOT_FOUND`).
- Routes: `codecharta-cored/src/serve/projects_routes.rs` (the plan's `rpc/projects.rs` does not match the
  layout as built). Token-using routes take the tokens, run the library call and `settle` them.
- Shell-only (`Audience::Shell`, absent from `rendererMethods`): `projects.inspectFolder`,
  `projects.folderPath`, `projects.sourceFileLocation`. The plan's shell-composed `projects.pickFolder` and
  `projects.readSourceFile` are not core methods (every `METHODS` entry needs a route; 03-M0 item 0); they
  belong to the shell (task 8). The 03-M0 suggestion to use `ShellPathTarget` variants instead of
  `projects.folderPath` was not taken: it keeps the plan's names and needs no store access in `Paths`.
- Tests (`tests/projects_protocol.rs`, hermetic `HOME` / `GIT_CONFIG_NOSYSTEM` for the served core): the
  plan's seven plus `should_create_list_and_activate_a_picked_project`,
  `should_answer_the_folder_path_to_the_shell`. The symlink test is `cfg(unix)`; the large file is sparse.

### Pick token contract for the shell (task 8; to settle with 01-M3)
Plan 01's preload `pickFolder({ title })` resolves to a path string in the renderer; plan 03 decision 1
forbids paths from the renderer. The core side is built for tokens; the shell must do this:
1. `projects.pickFolder()` is composed in the main process: native `dialog.showOpenDialog` with
   `openDirectory`; cancelled -> `null`; else core request `projects.inspectFolder { path }` with the
   absolute picked path, and the `PickedFolder { pickToken, path, suggestedLabel, kind, git }` goes to the
   renderer as it is. `path` is for display only.
2. The renderer sends only the token: `projects.create { name, description?, folders: [{ pickToken, label,
   role }] }`, `projects.addFolder { projectId, folder: { pickToken, label, role } }`,
   `projects.relinkFolder { projectId, folderId, pickToken, acceptDifferentHistory? }`. No renderer-callable
   method accepts a path.
3. A token is 32 lowercase hex, lives 15 minutes in the serving core's memory, and works for one successful
   use; a failed use (for example `DUPLICATE_LABEL`) leaves it usable. Unknown, used, expired or
   wrong-kind tokens (and every token after a core restart) answer `TOKEN_EXPIRED`: the renderer asks the
   user to pick again.
4. The relay never forwards `projects.inspectFolder`, `projects.folderPath` or `projects.sourceFileLocation`
   from the renderer (they are not in `coreMethods.generated.json`). Reveal-in-explorer resolves
   `(projectId, folderId)` with `projects.folderPath`. `projects.readSourceFile({ projectId, folderId,
   relativePath })` asks `projects.sourceFileLocation`; `location: null` -> `null`; otherwise it checks that
   `location.path` lies inside `location.folderRoot` and reads at most `sizeBytes`.
5. Settling with plan 01: keep plan 01's generic path-returning picker only for the shell's own uses (tool
   executable, store root); the project flows use `projects.pickFolder` above. The `DesktopBridge` type
   declares the two composed methods by hand over the generated `PickedFolder` (they are not in
   `CoreMethods`).

### 7. CLI
- `codecharta-cored/src/cli/projects.rs`: `codecharta-core [--data-dir D] projects list [--json]`,
  `projects create --name <n> [--description <d>] --folder <path>[=<label>[:<role>]] … [--json]`,
  `projects add-folder --project <id> --path <dir> [--label <l>] [--role primary|fork|helper] [--json]`.
  `--data-dir` instead of the plan's `--store-root` (03-M0 item 0; plan text corrected in task 6's commit),
  and `--json` per command (as `doctor` has it), not global.
- Names, labels, ids and roles are parsed by clap value parsers over the api newtypes, so an invalid one is a
  usage error (exit 2) like a missing argument; `--folder` is required at least once; the label defaults
  to the folder name of the absolute path (so `--folder .` works), the role to helper (the first folder is
  primary anyway). Exit 1 = `CoreError`, message on stderr. Text output: `list` one line per project
  (`<id>  <name>  <n> folders[  (<problem>)]`, nothing for an empty store); `create` / `add-folder` print
  the new project / folder id.
- `list` opens the store read-only (no lock, nothing written); `create` and `add-folder` take the store lock
  through `Store::open`, so they answer `STORE_LOCKED` while the app runs.
- Library change in this commit: `new_folder_record` and `relink_folder` make the path absolute and refuse
  a path that is not a folder (`NOT_FOUND`) before git or the store sees it (`existing_directory`); a relative
  `cwd` would have made the runner refuse git and the folder look plain.
- Tests (`codecharta-cored/tests/cli_projects.rs`, hermetic `HOME`): the plan's five plus
  `should_exit_1_when_the_core_refuses_the_command`; unit tests for the `--folder` syntax.
- Acceptance (core half): `codecharta-core --data-dir <tmp> projects create --name demo --folder .` printed the
  id; `projects list` showed `demo  1 folders`; `project.json` held the worktree as a `git` repository root
  with label `agent-…` (the folder name) and `workingFolderId` set. The DevTools half needs task 8.
- Docs: `core/README.md` and the root `CLAUDE.md` core command list.

### State at the end of part A
- Tasks 1-7 done; 8 (shell) and 9 (fake bridge) wait for 01-M3 and 01-M4.1, so `state` stays `progress`.
- Gates (final run, Linux): `core/`: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D
  warnings` (also `--target x86_64-pc-windows-gnu`), `cargo test --all-features` green; `npm run contract`
  leaves no diff; root `npm run format:check` green; `visualization/`: `npm run lint`, `npx tsc --noEmit -p
  tsconfig.json`, `npm test` (636 suites, 4861 passed, 2 todo) green. Only generated `model/coreApi/` files
  changed in `visualization/`. No changelog entry: nothing user-visible ships until the shell and UI exist.
- Not verified: anything on Windows (canonical path comparison, `trash` into the recycle bin, case-insensitive
  duplicates); `cargo deny` is not installed here.

### For 03-M3 (snapshots)
- Error code `NOT_A_COMMIT` is still to be appended (bind-to-commit). `resolve_commit` reads only
  `%H %h %s %an %aI`; binding needs `%cI` and `%P` added to `SHOW_COMMIT_FORMAT` and to `ResolvedCommit`
  or an internal type.
- Reuse: `Core::projects()`, `ProjectRepository::resolve_folder(&FolderRef) -> ResolvedFolder { path, kind,
  status }`, `read_record` / `modify` (`pub(crate)`, under the project lock) to update
  `view.shownSnapshotIdByFolder`, `PickTokens::issue_file` / `take_file` / `settle` for `importToken`,
  `pick_folder` for the containing folder of an import, `existing_directory`, `timestamps::now()`.
  `set_view` already checks that a shown snapshot's directory exists; `remove_folder` already recycles
  `snapshots/<folderId>/`; snapshot counts are directories named like a snapshot id.
- `ShellPathTarget::SnapshotMap` still answers `NOT_FOUND` in `Paths::resolve` (03-M0 item 0, 03-M3 fills it).
- Result wrappers: a method answering a list or `T | null` needs a named wrapper struct (see task 6).

### 8. Shell (part B)
- Branch `feature/studio-03-shell` from `feature/studio-stack` (integration + the verified core of plans
  03-06). Verified before starting: `electron/{main,preload,shellActions,shellPolicy}.js` as 01-M3 and
  02-M6 left them; `coreMethods.generated.json` lists none of the shell-only names; the core answers
  `projects.inspectFolder`, `projects.folderPath`, `projects.sourceFileLocation` as described above.
- **Call shape (settles the 01/03 question):** the composed methods are reached through the existing
  `bridge.request(method, params)`, not new bridge keys or namespace groups (`bridge.projects.pickFolder()`
  in the plan's examples; overview section 10, plan 01 wins). The relay in `main.js` runs a name found in
  the shell's composed-method table in the main process (`shellPolicy.isComposedMethod`, own properties
  only) before the allow-list check; everything else is forwarded only when it is in `rendererMethods`.
  So **the preload is unchanged** and the bridge keys stay the 01-M3/02-M6 set. Each composed module has a
  test that none of its names is a renderer method of the contract (a composed name can never shadow a
  core method).
- Structural commit first: `pickPath`, `showInFileManager`, `failure`, `NOTHING_CHOSEN` and the picker
  property lists are module exports of `shellActions.js`; `shellPolicy.isInsideFolder` (taken out of
  `isReadableMapPath`).
- `electron/projectsShell.js` (`createProjectsShell({ dialog, shell, fs, getWindow, requestCore, platform })`
  → a table keyed by method name) and `electron/shellFiles.js` (`readRange`, `realPathOrNull`); both in
  `script/copyElectron.js`.
  - `projects.pickFolder({ title })` → `{ ok, value: PickedFolder | null }`: malformed options
    `BAD_REQUEST` without a dialog (the generic pickers answer `null` there); cancelled `null` without a
    core call; else `projects.inspectFolder { path }`, answered as it is. **No shell wording:** the design
    specifies no dialog titles, so the title comes from the caller.
  - `projects.readSourceFile({ projectId, folderId, relativePath })` → `{ ok, value: { bytes } | null }`:
    only these three fields are passed to `projects.sourceFileLocation`; `location: null` → `null`; the
    realpath of `path` must lie inside the realpath of `folderRoot` (`NOT_ALLOWED`, so a symlink swapped
    in after the core's check is refused too; a path that vanished is `IO`); reads at most `sizeBytes`.
  - **Addition: `projects.revealFolder({ projectId, folderId })`** → `{ ok, value: null }`: the plan's
    "reveal-in-explorer over `projects.folderPath`" needed a renderer-callable name; `shell.resolvePath`
    has no folder target (03-M2 task 6 kept `projects.folderPath`), so `reveal(target)` could not do it.
- Renderer: `DesktopBridge.request` is typed over `BridgeMethods = Pick<CoreMethods, RendererMethod> &
  ShellMethods`; `ShellMethods` and `SourceFileBytes` are declared by hand in `desktopBridge.ts` (the
  plan's `codecharta-core-api/src/shell.rs` does not exist, 03-M0 item 0; no core or contract change).
  Fake: `FakeAnswerKey` covers the composed names; unseeded, the three answer `{ ok: true, value: null }`
  (nothing picked or found) instead of `NOT_FOUND` (task 9 replaces this with the backend).
- Tests: `projectsShell.test.js` (12), `shellPolicy` "should compose only the methods the shell itself
  offers"; Jest "should answer the project methods of the shell as if nothing was picked or found";
  smoke (stubbed `dialog.showOpenDialog` and `shell.openPath` in main) "should create and list a project
  from a picked folder" (pick → create → list → read a source file → reveal) and "should refuse the
  shell-only project methods from the page".
- Plan text corrected: "Required from plan 01" (call shape, composed methods), the shell types block,
  the method table rows (`projects.pickFolder { title }`, `projects.revealFolder`) and the M2 acceptance
  call.
