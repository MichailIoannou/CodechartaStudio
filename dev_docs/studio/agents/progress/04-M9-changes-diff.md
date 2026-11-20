---
name: 04-M9 changes and diff
state: progress
version: 1
---

## Goal

Working-tree changes in the core (list, diff, stage, unstage, discard to the recycle bin), then the
renderer's changes panel and diff view (plan 04, section 5, M9).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M9. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m8` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M8-fetch-branches.md`: add mutations in the style of `git/operation.rs` (`locate` → `mutation()` →
`operate(&mutation, work)`); add `ChangedPart::WorkingTree` and a working-tree read. Discard goes to the
recycle bin through the existing `Recycler` (plan 03, `trash` crate). Error codes SCREAMING_SNAKE_CASE.
Gates with and without `--all-features`.

1. Core: status entries, working tree, `git.workingTree`, `git.diffFile`, `git.stage`, `git.unstage`, `git.discard`
2. Renderer (later, UI)

## Steps

- [x] 1. Core
- [ ] 2. Renderer (later)

## Notes

Environment (2026-11-19): Arch Linux x86_64, rustc/cargo 1.95, git 2.56.0. Branched from
`feature/studio-04-m8`. Throwaway git runs lived in the session scratch folder with a temporary `HOME` and
`GIT_CONFIG_GLOBAL=/dev/null`; no network.

### Spike (git 2.56)
- `status --porcelain=v2` prints paths relative to the repository root also with `-C <subfolder>`; the
  working tree is listed and changed at the root.
- **Staged rename (the UNVERIFIED item): decided for the fallback.** `restore --source=HEAD --staged
  --worktree -- <new>` deletes the new file from index and working tree and leaves the old path staged as
  deleted; with both paths the rename is undone but the new file — with any change made to it — is deleted for
  good, against the rule that discard never deletes permanently. Built: restore the old path from `HEAD`,
  unstage the new path, move it to the recycle bin (test
  `should_discard_a_staged_rename_restoring_the_old_path_and_recycling_the_new_one`).
- `restore --worktree` on an intent-to-add entry (`.A`) empties the file, so unstaged added / renamed / copied
  rows are unstaged and recycled instead of restored.
- `rm --cached` refuses a staged new file changed again since (`AM`) without `--force`; `--force` with
  `--cached` only skips that check. `restore --staged` fails without commits (`could not resolve 'HEAD'`).
- `add`, `restore` and `rm` take `--pathspec-from-file=- --pathspec-file-nul`, and `--literal-pathspecs` keeps
  `*.txt`, `:(top)d` and `-n` literal there.

### 1. Core (as built)
- **Api first.** `values.rs`: `WorkingTreePath` (1–4096 bytes, no NUL, not starting with `/` or `\`, no drive
  prefix `X:`, no `..` segment; the plan's rule, kept apart from `RepoRelativePath`, which also forbids `:`
  and caps at 1024). `methods/git.rs`: `GitEntryKind`, `GitWorkingTreeEntry`, `GitWorkingTree`, `GitDiff`,
  `DiscardEntry`, `GitDiffFileParams`, `GitStageTarget` (tagged), `GitStageParams`, `GitUnstageParams`,
  `GitDiscardParams` (all params `deny_unknown_fields`); methods `git.workingTree`, `git.diffFile`, `git.stage`,
  `git.unstage`, `git.discard` (`Renderer`); error code `CHANGED_SINCE_LISTED` appended (40 codes). Contract
  regenerated.
- **Core.** `git/parse/status_entries.rs` (`WORKING_TREE_STATUS_ARGS`, `parse_status_entries`,
  `MAX_LISTED_ENTRIES` 5000; `changed_files::change_of_letter` shared). `git/working_tree.rs`: reads
  `working_tree` (status + listing in parallel) and `diff_file` (the `(path, kind)` must be listed); mutations
  `stage`, `unstage`, `discard` in the `operation.rs` style (`locate` → `mutation` → `operate`, now
  `pub(super)`), each re-reading the listing inside the queue and answering the listing read after it with the
  status `operate` reads. 1–1000 paths / rows (`check_path_count`, `BAD_REQUEST`). Limits `WORKING_TREE_LIMITS`
  (60 s / 1 MiB) and `DIFF_LIMITS` (30 s / 4 MiB; cut to 2 MiB after the last whole line).
- `Operations { queue, prompts, recycler }` and `Mutation.recycler` (the recycle bin is injected; `Core` passes
  its `SystemRecycler`, tests a `RecordingRecycler`). `RepositoryChanges::announce_operation` now sends parts
  `status`, `refs`, `workingTree` for every operation (a switch changes the working tree too).
- `store::paths::confine_entry_to_folder`: like `confine_to_folder`, but only the parent is canonicalised, so
  a symlink is recycled as the link and a symlinked folder leading out of the repository is `NOT_ALLOWED`.
  `SystemRecycler` now checks existence with `symlink_metadata` (a dangling link can be recycled); not covered
  by a test, which would touch the real recycle bin.
- **Deviations** (plan 4.4 / 4.6 corrected): untracked files listed one by one (`--untracked-files=all`) so a
  new folder's files can be staged, diffed and discarded singly — `GitWorkingTree.status.counts` still comes
  from the status read with `normal` (a new folder counts once there); path lists on stdin instead of argv
  after `--`; `--no-textconv` also for the conflicted diff; discard semantics per row (an unstaged row goes
  back to the index, keeping the staged change; a staged row needs the path's unstaged row named too,
  `NOT_ALLOWED` otherwise); `rm --cached --force` without commits; `git.stage` takes a tagged `target`.
- Tests: `tests/git_working_tree.rs` — `should_list_every_change_of_the_repository_from_a_subfolder`,
  `should_stage_and_unstage_a_file_with_space_and_brackets`, `should_stage_all_changes`,
  `should_unstage_a_file_without_commits`, `should_discard_a_modified_tracked_file`,
  `should_keep_the_staged_change_when_discarding_the_unstaged_one`,
  `should_discard_a_staged_new_file_and_an_untracked_file_to_the_recycle_bin`,
  `should_discard_a_staged_rename_restoring_the_old_path_and_recycling_the_new_one`,
  `should_fail_with_changed_since_listed_and_change_nothing`, `should_refuse_an_unlisted_path`,
  `should_refuse_to_discard_a_conflicted_file`,
  `should_refuse_trashing_through_a_symlinked_folder_outside_the_repository`,
  `should_show_an_untracked_file_as_an_added_diff`, `should_show_a_staged_rename_and_an_unstaged_change`,
  `should_flag_a_binary_diff`, `should_truncate_a_large_diff`, `should_announce_the_working_tree_after_staging`,
  `should_pass_paths_on_stdin_after_the_end_of_options` (`RecordingGit`); captured-output unit tests in
  `parse/status_entries.rs` (listed twice, rename with previous path, conflicted with code, untracked);
  unit tests for the discard plan, the diff cut, binary detection, path counts, `WorkingTreePath`, the tagged
  stage target, `confine_entry_to_folder`; `git_protocol.rs` — stage / diff / discard over stdio with
  `repository.changed`, malformed working-tree params → `BAD_REQUEST` with the index untouched.
- Not covered by automated tests: Windows (`/dev/null` for `diff --no-index`, recycle bin, drive prefixes),
  file names that are not UTF-8 (the runner decodes git's output lossily, so such a path never matches on
  disk), filters such as LFS running during staging and status.

### Gates at the end of task 1 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --all-targets
  --all-features -- -D warnings`, `cargo test` (538 passed), `cargo test --all-features` (542 passed) green;
  `npm run contract` leaves no diff; root `npm run format:check` green; `visualization/`: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.json`, `npm test` green. Only generated `model/coreApi/` files and
  `electron/coreMethods.generated.json` changed in `visualization/`. No changelog entry: nothing user-visible
  until task 2.

### For task 2 (renderer)
- Reads: `git.workingTree { repo }` → `GitWorkingTree { status, entries, areEntriesTruncated }`;
  `git.diffFile { repo, path, kind }` → `GitDiff { path, text, isBinary, isTruncated }`. Operations (with
  `operationId`): `git.stage { repo, target: { kind: "paths", paths } | { kind: "all" } }`,
  `git.unstage { repo, paths }`, `git.discard { repo, entries: [{ path, kind, change }] }`, each answering a
  fresh `GitWorkingTree` and ending with `repository.changed` (parts `status`, `refs`, `workingTree`).
- Send the rows exactly as listed. When discarding a staged row whose path also has an unstaged row, send both
  (the confirmation should say the file returns to the last commit); conflicted rows have no discard.
- Errors: `CHANGED_SINCE_LISTED` (refresh, show the list again), `NOT_ALLOWED` (conflicted row, or a staged
  row without its unstaged row; also a path leading out of the repository), `BAD_REQUEST` (0 or > 1000 paths),
  `OUTPUT_TOO_LARGE` (diff over 4 MiB), `INDEX_LOCKED`, `CANCELLED`, `IO` (recycle bin unavailable).

### For M10–M11
- Commit and pull / push can re-read the listing with `working_tree::read_entries(git, root, cancel)` for
  their preconditions (staged entries, conflicted entries); `operate` already announces `workingTree`.
- The working tree is the repository's, whichever folder the project names.
