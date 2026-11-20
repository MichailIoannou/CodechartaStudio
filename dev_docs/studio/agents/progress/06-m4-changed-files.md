---
name: 06-M4 changed files
state: progress
version: 1
---

## Goal

List the files changed between the two commits of a comparison (paths relative to the project folder),
then filter the map to them and summarise in the renderer (plan 06, Milestones, M4).

## Tasks

Copied from `06-compare-commits-and-prs.md`, Milestones, M4. Split by orchestration: core task 1 now,
branched from `feature/studio-06-m1` (verified, merge pending); renderer tasks later with
`design/06-compare.md`.

From `06-m1-compare-core.md`: changed files should reuse plan 04's `git.changedFiles` / `changed_files`
(`04-M2-core-log-details.md`) — the plan's `git/compare.rs::diff_name_status` and `parse_name_status` may
already exist there as `parse/changed_files.rs`; reconcile, do not duplicate. `SideLookup` takes each side's
folder (two clones). Error codes SCREAMING_SNAKE_CASE. Gates with and without `--all-features`.

1. (core) changed files, `compare.changedFiles`, CLI `compare changed-files`
2+. Renderer (later)

## Steps

- [x] 1. Core
- [ ] 2+. Renderer (later)

## Notes

### 1. Core (done)
Branched from `feature/studio-06-m1`. Environment: the disk was full during the work (`ENOSPC`); gates ran with
`CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0` after deleting this worktree's `core/target`.

**Reconciliation with plan 04** (nothing duplicated):
- Reused: `git/parse/changed_files.rs` (`parse_name_status`, `NameStatus`, `DIFF_TREE_ARGS`, `NAME_STATUS_ARG`),
  `GitFileChange` as the status type (the plan's own `ChangedFileStatus` is not written), `GitService::resolve_commit`
  (`UNKNOWN_REVISION` = "not in this clone", the plan's `has_commit`), `ProjectRepository::git_folder` /
  `compared_folder` for the folders.
- Added: `git/details.rs::changed_paths` / `GitService::changed_paths` (name-status only, `--relative` so paths are
  relative to the project folder that is the git working directory, no numstat, **no 5000-file cut**: the map filter
  needs every path; stdout limit stays `DETAILS_LIMITS` = 8 MiB, roughly 80 000 paths);
  `compare/changed_files.rs::ChangedFilesSearch::list` (first folder whose repository has both commits, base folder
  first, then head folder; none = `source: unavailable`); `compare/project_folder.rs::changed_files_in_project`.
- Not added: `git/compare.rs::diff_name_status`, a similarity score (`ChangedFile` has no `similarity`, plan 04's
  parser drops it), a memory cache.
- Plan 06 text corrected (types, module layout, git command, task 1 test names, CLI flags).

**`compare.changedFiles`** (renderer): `{ baseFolder: FolderRef, headFolder: FolderRef, base: CommitSha, head: CommitSha }`
(full lower-case 40/64-hex shas; unknown fields refused) -> `{ source: "git" | "unavailable", files: [{ change:
"added"|"modified"|"deleted"|"renamed"|"copied"|"typeChanged"|"unknown", path, previousPath | null }] }`. Errors:
`NOT_FOUND` (unknown project / folder), `NOT_A_REPOSITORY` (plain folder), `FOLDER_UNAVAILABLE` (folder missing),
`BAD_REQUEST` (malformed params), git codes (`GIT_TOO_OLD`, `TOOL_NOT_FOUND`, `COMMAND_FAILED`, ...). No new code.
Both folders must exist even when the first has both commits. `unavailable` also when the commits are in neither clone.

CLI: `compare changed-files --project <id> --folder <id> [--head-folder <id>] --base <sha> --head <sha> [--json]`
(read-only store; text: source line, then `A  path`, `R  old -> new`).

Tests: unit `should_keep_paths_with_spaces_and_non_ascii_characters`, api `should_write_an_unavailable_source_without_files`,
`should_refuse_changed_files_params_with_an_unknown_field`; `tests/changed_files.rs`
`should_report_paths_relative_to_a_subfolder`, `should_report_a_rename_with_both_paths`,
`should_list_more_files_than_a_commit_view_shows` (5001), `should_return_unavailable_when_no_clone_has_both_commits`,
`should_use_the_head_folder_clone_when_only_it_has_both`; cored `serve_compare.rs`: RPC result, typed errors, CLI JSON equals RPC and text lines.
No changelog entry (nothing user-visible before the renderer tasks).

### For the renderer tasks
Call `compare.changedFiles` with the resolved sides' folders and `requested.commit`s; map `path` to
`/${rootName}/${path}`; `unavailable` -> fall back to metric changes. A rename lists the new path in `path`.
