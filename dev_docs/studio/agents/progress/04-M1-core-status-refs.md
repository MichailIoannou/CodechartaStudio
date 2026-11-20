---
name: 04-M1 core - fixtures, contract, runner, repository, status, refs
state: complete
version: 1
---

## Goal

Read-only git in the core: deterministic fixtures, git contract types and validation, git through the
process runner, repository detection, status summary, branches/tags/remotes, and `git.*` over JSON-RPC
and the CLI (plan 04, section 5, M1).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M1 (tests to write first are listed there).
Branched from `feature/studio-03-m3` (plan 03 core verified, merge into integration pending).

Orchestration notes: the shared fixture already exists as `TempRepo` in `tests/support/git_fixture.rs`
(overview section 10) — extend it rather than add a second one. The git 2.31 spike needs a git 2.31
binary; do not install one globally — if none can be obtained inside the project or a scratch folder,
record it as open for the owner. Task 7's fake-bridge `git` seed lives in the renderer and waits for
01-M4.1: leave it out and note it. Plan 03's async `GitRunner` (`git/runner.rs`) exists; reconcile.

1. Reconcile and fixtures
2. Contract and helpers
3. Runner and failures
4. Repository
5. Status
6. Refs and remotes
7. RPC and CLI (without the fake-bridge seed)

## Steps

- [x] 1. Reconcile and fixtures
- [x] 2. Contract and helpers
- [x] 3. Runner and failures
- [x] 4. Repository
- [x] 5. Status
- [x] 6. Refs and remotes
- [x] 7. RPC and CLI
- [ ] Fake-bridge git seed (after 01-M4.1; not part of this run)

## Notes

Environment (2026-11-18): Arch Linux x86_64, rustc/cargo 1.95.0, git 2.56.0. Branched from
`feature/studio-03-m3`.

### 1. Reconcile and fixtures
- Reconciled names are in plan 04 section 9 (process runner, tools, dispatcher layout, contract layout,
  error transport, plan 03's folder lookup). Plan text corrected where it named `FixtureRepo`.
- `TempRepo` extended in place (no second fixture): empty `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` file,
  `GIT_CONFIG_NOSYSTEM=1`, `HOME` / `USERPROFILE` / `XDG_CONFIG_HOME` = temp home, the plan's author and
  committer, dates `@<1700000000 + 60·n> +0000` (n = commits made so far, counted per fixture; clones go on
  counting where the source stopped). The three fixed settings travel as `GIT_CONFIG_COUNT` /
  `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n` (git >= 2.31) instead of `-c`, so `env()` hands them to the core's
  runner too. API: `commit(message, files)`, `commit_file` (kept), `write_file`, `branch`, `checkout`,
  `merge(names, message)`, `tag(name, is_annotated)`, `with_bare_origin()` (builder, `push --set-upstream
  origin HEAD`), `origin_path()`, `clone_of_origin()`, `linear_history(n)` (fast-import, then `reset --hard`),
  `try_git`, `git_without_identity`, `path()`, `env()`.
- Existing tests that asserted the old identity / date (`Ada Tester`, 2026-01-02) now assert the new ones.
- **Deviation: no `FolderResolver` fake.** `GitService` methods take a resolved `GitFolder { path, repo }`;
  `FolderRef` → path is plan 03's `resolve_folder`, used by the RPC routes and covered by the protocol tests.
- Captured outputs (git 2.56, `LC_ALL=C`, the section 4.5 argument lists) are in
  `core/crates/codecharta-core/src/git/parse/testdata/`, made by `testdata/capture.sh` (paths rewritten to
  `/fixture`). M1 captures rev-parse, status, for-each-ref and the remote-url config; M2 adds its commands.
  Findings vs section 4.5: as described. Details: `rev-parse` in a bare repository prints the first four
  values (`true`, `false`, git dir, common dir), an empty prefix line, then fails at `--show-toplevel` with
  exit 128 "fatal: this operation must be run in a work tree" (so `bareRepository` is "exit != 0 and first
  line `true`", as planned); outside a repository exit 128 "not a git repository"; `config -z
  --get-regexp` with no remotes exits 1 with empty output; `%(worktreepath)` is set for the current
  worktree; a remote named `team/fork` gives `refs/remotes/team/fork/<branch>`; `%(upstream:track,nobracket)`
  gives `ahead 2, behind 1` and `gone`.
- Plan 01's tools test for the minimum already exists (`tests/tools.rs` `should_report_too_old_below_minimum`,
  2.30.9 is `tooOld` against `2.31.0`); no new test.
- Tests: `tests/git_fixture.rs` with the plan's three names.
- **Spike (git 2.31): open for the owner.** No git 2.31 binary could be obtained without installing
  anything globally: no other git on this machine, `docker` is present but the socket refuses this user, and
  downloading a portable git was not done (no permission for downloads in this run). Unverified on 2.31:
  `--end-of-options` on `switch` / `branch` / `push` / `rev-parse`, and `rev-parse --path-format=absolute`
  (release notes place `--path-format` in 2.31.0 and `rev-parse --end-of-options` in 2.30.0; that is reading,
  not a run). The minimum stays 2.31.0. To close it: run `testdata/capture.sh` and the M1 tests with a git
  2.31.x first on `PATH` (for example a container `git` 2.31 image or a self-built `git-2.31.8` in a scratch
  prefix).

### 2. Contract and helpers
- Api `methods/git.rs` (plan's `src/git.rs`; one module per domain as built): `GitRepositoryInfo`, `GitHead`
  (`kind` tag, camelCase fields), `GitUpstream`, `OperationInProgress`, `StatusCounts`, `GitStatus`,
  `GitLastCommit`, `GitLocalBranch`, `GitRemoteBranch`, `GitTag`, `GitRefs` (remotes reuse plan 03's
  `GitRemote`), `ChangedPart`. Params, method markers and `RepositoryChanged` arrive with task 7 (every
  `METHODS` entry needs a route), so the regenerated contract only gains the error codes now.
- **Deviation: git error codes are `ErrorCode` values** (overview section 10: plan 01's transport wins), not
  a camelCase `GitErrorCode`. Appended (`ErrorCode::ALL` now 29): `GIT_TOO_OLD`, `NOT_A_REPOSITORY`,
  `DUBIOUS_OWNERSHIP`, `BARE_REPOSITORY`, `INDEX_LOCKED`, `PARSE_FAILED`, `COMMAND_FAILED` (the codes M1's reads
  can produce). Existing codes cover the rest: `gitNotFound` = `TOOL_NOT_FOUND` (details.tool `git`),
  `timeout` / `outputTooLarge` / `cancelled` = `TIMEOUT` / `OUTPUT_TOO_LARGE` / `CANCELLED`, `invalidArgument`
  = `BAD_REQUEST`, `folderNotFound` = `NOT_FOUND` (unknown) or `FOLDER_UNAVAILABLE` (detached). Later
  milestones append theirs. Test renamed `should_serialize_git_error_codes_as_stable_screaming_snake_case_strings`.
- **Deviation: `CommitSha` and `FullRefName` live in the api's `values.rs`** (validated while deserialised,
  like plan 03's `FullCommit`), not in a core `revisions.rs`; `validate_new_branch_name` comes with M8.
  `FullRefName`: starts with `refs/`, at most 1024 bytes, no character below U+0020 or U+007F.
- Core `git/nul.rs` (`split_nul_fields`, `chunk_records` -> `Option`, `None` for a count that is not a
  multiple), `git/cache.rs` (`LruCache`, linear lookups, most recent first).
- Tests: the plan's six names (the error code one renamed as above) plus
  `should_tag_heads_by_kind_with_camel_case_fields`, `should_replace_the_value_of_a_known_key`.

### 3. Runner and failures
- Plan 01 runner change (test first, in `process/env.rs`): `RunRequest.env_remove` / `ToolRunOptions.env_remove`;
  `child_env(base, removed, overrides, askpass)` drops `removed` from the base before the overrides and the
  askpass variables (so a removal never takes the askpass helper away). `ASKPASS_TOKEN_VARIABLE` constant
  added next to the endpoint one. Test `should_remove_listed_variables_before_adding_askpass_ones`.
- `git/command.rs`: `GLOBAL_ARGS`, `READ_ARGS` (`--no-optional-locks -c core.fsmonitor=false`), base / read /
  mutating environments, removed variables, `Limits { timeout, max_stdout_bytes }` with
  `REPOSITORY_LIMITS` / `STATUS_LIMITS` / `REFS_LIMITS` / `QUERY_LIMITS` (the others with their milestone),
  `CommandKind { Read, Mutating }` (`Network` comes with askpass in M7), `GitCommand::read`,
  `invocation_of(command, data_dir) -> GitInvocation`.
- **Naming deviation:** plan 03 already owns `git::GitRunner` (the simple `run(cwd, args)` trait of the folder
  inspector), so the plan's `GitRunner` struct is `git::GitCli` (`run` = must succeed, classified error
  otherwise; `run_raw` = exit code is the caller's; `version`). It runs through the port
  `git::GitProcess { version(), execute(GitInvocation, &cancel) }`, implemented by `Tools` (real; `version`
  answers a too-old version too, so the locator can say `GIT_TOO_OLD`) and by the fixture's `FixtureGit`
  (system git with the hermetic variables underneath the core's). Output stays `String` (the runner decodes
  UTF-8 lossily), not bytes. `OperationContext` / progress / `stream_lines` arrive with M2 / M7.
- `git/error.rs`: `GitError { code: ErrorCode, message, detail, repository_path }`, `with_detail` (trimmed,
  at most 2000 characters, empty = none), `command_failed(&RunOutput)`, `parse_failed(what)`;
  `CoreError::Git(GitError)` whose payload carries `details.detail` and `details.repositoryPath`.
  `git/failure.rs` `classify(stderr) -> ErrorCode` with the read-relevant rules: dubious ownership, not a git
  repository, index.lock, else `COMMAND_FAILED`. Runner errors (`TOOL_NOT_FOUND`, `TIMEOUT`, `CANCELLED`,
  `OUTPUT_TOO_LARGE`) pass through unchanged.
- Tests: the plan's names (unit tests in `git/runner.rs` over a recording `GitProcess`; one per rule in
  `git/failure.rs`, two from captured stderr), plus `should_classify_a_non_zero_exit`,
  `should_carry_git_text_and_repository_path_in_the_details`.

### 4. Repository
- `git/parse/repository.rs`: `REV_PARSE_ARGS`, `parse_rev_parse -> RevParseFacts` (exactly six lines, flags
  must be `true` / `false`, else `PARSE_FAILED`), `reports_bare` (first line `true`).
- `git/locator.rs`: `checked_version` (`GIT_TOO_OLD` below the `tools::definitions` git minimum; the version
  itself is cached by plan 01's tools report, so no extra cache here), `locate(git, folder, cancel) ->
  Repository { info: GitRepositoryInfo, git_dir }`. Non-zero exit: `BARE_REPOSITORY` when the partial answer
  says bare, else classified (`DUBIOUS_OWNERSHIP` gets `repositoryPath` = the folder). `repository_id` =
  canonical common git dir through `normalise_repository_id(path, PathStyle)` (Windows: `/` to `\`,
  verbatim prefix dropped, lower case; Unix unchanged); `root_path` = `normalise_path(--show-toplevel)` (not
  canonicalised, so it is git's spelling); `is_linked_worktree` = canonical git dir != canonical common dir.
  No `dunce` crate: the prefix handling is the few lines in `normalise_path`.
- `git/service.rs`: `GitFolder { path, repo: Option<FolderRef> }` (`GitFolder::at(path)` for the CLI),
  `GitService::new(&dyn GitProcess, data_dir)` with `repository_info(&GitFolder, &cancel)`. Every service read
  takes a cancellation token (the request's), which the plan's signatures leave out.
- Fixture: `TempRepo::data_dir()` (the temp home) stands in for the core's data folder.
- Tests: the plan's names (`should_parse_root_prefix_shallow_and_worktree` captured; the fixture ones in
  `tests/git_repository.rs`; `should_reject_git_below_2_31` and the Windows normalisation as unit tests), plus
  `should_report_a_bare_repository`, `should_recognise_a_bare_repository_from_the_partial_answer`,
  `should_keep_case_and_separators_on_unix`, `should_turn_a_verbatim_unc_path_into_a_share_path`.

### 5. Status
- `git/parse/status.rs`: `STATUS_ARGS`, `parse_status -> StatusSummary { head, upstream: StatusUpstream { name,
  ahead_behind }, counts }` over the NUL tokens (`1` / `2` count `X != .` staged and `Y != .` unstaged, `2`
  consumes the original path, `u` conflicted, `?` untracked, `!` ignored, other `# ` headers skipped, any
  other entry `PARSE_FAILED`; detached without an oid is `PARSE_FAILED`), `operation_in_progress(has_marker)`
  in the plan's order.
- `GitService::status(&GitFolder, &cancel)`: locate (for the worktree git dir), status, and — only when there is
  an upstream on a branch — `for-each-ref --format=%(upstream) refs/heads/<branch>` for the upstream's full ref
  name. **Deviation:** porcelain v2 names the upstream only briefly (`origin/main`), which cannot tell a local
  upstream from a remote one, so `GitUpstream.refName` costs this one extra read; without a configured value
  it falls back to `refs/remotes/<name>`. A gone upstream has `ahead` / `behind` null and `isGone`.
- Tests: the plan's captured cases (branch / upstream / ahead-behind, gone upstream, detached, no commits,
  counts of all four kinds, rename original path) and fixture cases (`tests/git_status.rs`: clean after
  commit, merge in progress), plus `should_report_the_upstream_with_its_full_ref_name`,
  `should_fail_on_an_unknown_entry`, `should_find_a_rebase_before_a_merge`.

### 6. Refs and remotes
- `git/parse/refs.rs`: `REFS_ARGS` (the plan's 12-field format), `parse_refs -> Vec<RefRecord>` (exactly 12
  fields, ref name under `refs/`, numeric date, else `PARSE_FAILED`), `sort_refs(records, RefContext
  { remote_names, root_path, style }) -> SortedRefs` (symbolic refs skipped; tags peeled, tags not leading to a
  commit skipped; `parse_track`: empty = in step `0/0`, `gone` = `isGone` with null counts;
  `checked_out_in_other_worktree` compares through `normalise_repository_id`; `split_remote` picks the longest
  configured remote name, else the first path segment). `GitLastCommit.committedAt` is
  `%(creatordate:unix)` (the committer date for branches).
- `git/parse/remotes.rs`: `REMOTE_URLS_ARGS`, `parse_remote_urls` (first url per remote; exit 1 with empty
  output = no remotes, read in `git/read.rs`). **Deviation:** credentials go through plan 03's
  `folders::inspector::strip_credentials` (http/https drop the whole user part; other schemes keep the user
  and drop a password; scp-like unchanged) instead of a second rule, so both plans strip alike.
- `git/fingerprint.rs`: `fingerprint_of(records, head)` = SHA-256 hex over the sorted `refname object` lines of
  the non-symbolic refs (the unpeeled object, so moving an annotated tag counts) plus `branch:<name>:<sha>` /
  `detached:<sha>`.
- `git/read.rs` (shared reads): `status_summary`, `read_refs` (status header, for-each-ref and remote urls in
  parallel with `tokio::join!`). `GitService::refs` and `refs_fingerprint` (the latter reads the same three
  commands; no cheaper path in M1, no cache yet — the plan's refs cache by fingerprint comes with the log
  sessions in M2).
- Tests: the plan's captured cases (`git/parse/refs.rs`, `git/parse/remotes.rs`) and fixture cases
  (`tests/git_refs.rs`), plus `should_name_the_other_worktree_of_a_branch`, `should_fail_on_a_line_with_missing_fields`,
  `should_keep_the_first_url_of_a_remote`, `should_read_no_remotes_from_empty_output`,
  `should_not_depend_on_the_order_of_the_refs`, `should_change_when_the_head_moves`,
  `should_list_no_refs_in_a_repository_without_commits`.

### 7. RPC and CLI
- Structural commit first: `refactor(core): share the id arguments of the command line` (`cli/arguments.rs`
  with `parse_project_id` / `parse_folder_id`, used by `projects`, `snapshots` and `git`).
- Api (`methods/git.rs`): `GitRepoParams { repo: FolderRef }` (`deny_unknown_fields`, so no path or other
  field rides along), `RepositoryChanged { repo, repositoryId, parts, fingerprint }`; methods (all
  **renderer**): `git.repositoryInfo` -> `GitRepositoryInfo`, `git.status` -> `GitStatus`, `git.branches` ->
  `GitRefs`, `git.refsFingerprint` -> `string`; event `repository.changed` (renderer). Markers carry a
  `Method` / `Event` suffix (`GitStatusMethod`, `RepositoryChangedEvent`) because the result types already
  own the plain names. Contract regenerated (14 new type files, `coreApi.ts`, `coreMethods.generated.json`).
- Core: `git/changes.rs` `RepositoryChanges` (last fingerprint per `repositoryId`; the first read only
  remembers, a different later one is broadcast with `parts: ["refs"]`); `GitService::with_changes`, and
  `refs` / `refs_fingerprint` of a `GitFolder` with a `repo` report through it. `Core::git()` (creates the data
  folder, which is git's cwd, when missing), `Core::git_folder(&FolderRef)` via the new
  `ProjectRepository::git_folder` (unknown project / folder `NOT_FOUND`, folder missing on disk
  `FOLDER_UNAVAILABLE` — the plan's `folderNotFound`), `Core::subscribe_repository_changes()`.
- Routes: `serve/git_routes.rs` (plan's `rpc/git.rs`); `serve()` spawns `forward_repository_changes`, which
  turns every broadcast into a `repository.changed` notification and is aborted at shutdown. A notification may
  arrive before the answer of the request that caused it.
- CLI `cli/git.rs`: `codecharta-core [--data-dir D] git status|branches (--project <id> --folder <id> | --path
  <dir>) [--json]`. A project folder is resolved in a read-only store (works while the app runs). Text:
  `status` -> `main ↑1 ↓0 · 2 staged, 1 unstaged, 0 untracked` (no upstream: no arrows; gone: `(upstream
  gone)`; plus `, N conflicted` and `· merge in progress` when they apply; detached: `(detached at
  1a2b3c4)`); `branches` -> `* main  1a2b3c4`, remote branches as `remotes/<remote>/<branch>`, tags as
  `tags/<name>`. Exit 0 / 1 with `<ERROR_CODE>: <message>` / 2 usage. `git log` comes with M2.
- Tests (`codecharta-cored/tests/git_protocol.rs`, reusing the core's `git_fixture.rs` through `#[path]` so
  there is still one fixture): the plan's five names. `should_reject_malformed_params_without_running_git`
  runs the core with an empty `PATH` (no git at all) and checks 5 malformed params x 4 methods all answer
  `BAD_REQUEST`. `should_return_folder_not_found_...` asserts `NOT_FOUND` (unknown) and
  `FOLDER_UNAVAILABLE` (moved away). Unit tests: `should_announce_only_a_different_fingerprint_after_the_first`,
  `should_refuse_unknown_fields_next_to_the_repo`, two CLI line tests.
- **Left out on purpose:** task 7's fake-bridge `git` seed (renderer) waits for 01-M4.1.
- Acceptance: `codecharta-core --data-dir <tmp> git branches --path <this worktree>` listed its 26 refs with
  `* feature/studio-04-m1`; `git status --path` printed `feature/studio-04-m1 · 0 staged, 9 unstaged, 3
  untracked` (the uncommitted work of that moment).

### Gates at the end of M1 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` (also
  `--target x86_64-pc-windows-gnu`), `cargo test --all-features` green; `npm run contract` leaves no diff; root
  `npm run format:check` green; `visualization/`: `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npm
  test` (636 suites, 4861 passed, 2 todo; coverage 96.71 / 90.1 / 95.33 / 96.62) green. Only generated
  `model/coreApi/` files and `electron/coreMethods.generated.json` changed in `visualization/`. No changelog
  entry: nothing user-visible until the History UI.

### For 04-M2 and the History UI milestones
- Methods: `git.repositoryInfo`, `git.status`, `git.branches`, `git.refsFingerprint` with `{ repo: { projectId,
  folderId } }`; event `repository.changed`. Errors: `GIT_TOO_OLD`, `NOT_A_REPOSITORY`, `DUBIOUS_OWNERSHIP`
  (`details.repositoryPath`), `BARE_REPOSITORY`, `INDEX_LOCKED`, `PARSE_FAILED`, `COMMAND_FAILED`, plus existing
  `TOOL_NOT_FOUND` (git missing), `NOT_FOUND`, `FOLDER_UNAVAILABLE`, `BAD_REQUEST`, `TIMEOUT`, `CANCELLED`,
  `OUTPUT_TOO_LARGE`; git's own text in `details.detail` (always show it).
- Rust: `GitService` (`core.git()?`), `GitFolder`, `GitCli` over `GitProcess`, `GitCommand::read` +
  `Limits` constants, `git::read::{status_summary, read_refs}`, `nul::{split_nul_fields, chunk_records}`,
  `cache::LruCache`, api values `CommitSha` / `FullRefName`. M2 needs: runner stdin and stdout line streaming
  (not in plan 01's runner yet), log / show / diff-tree captures (extend `testdata/capture.sh`), and should add
  its own `*_LIMITS`.
- Still open: the git 2.31 spike (see task 1); nothing ran on Windows.
