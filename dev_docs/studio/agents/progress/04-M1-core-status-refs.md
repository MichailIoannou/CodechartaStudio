---
name: 04-M1 core - fixtures, contract, runner, repository, status, refs
state: progress
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
- [ ] 3. Runner and failures
- [ ] 4. Repository
- [ ] 5. Status
- [ ] 6. Refs and remotes
- [ ] 7. RPC and CLI
- [ ] Fake-bridge git seed (after 01-M4.1)

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
