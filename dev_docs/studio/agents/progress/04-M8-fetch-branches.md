---
name: 04-M8 fetch and branches
state: progress
version: 1
---

## Goal

Fetch, fetch of PR refspecs into `refs/codecharta/…`, and branch switch/create/rename/delete/upstream in the
core, then the renderer controls (plan 04, section 5, M8).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M8. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m7` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M7-queue-prompts.md`: run each mutation inside `core.operation_queue().run_exclusive(...)`, open a
prompt session, build with `GitCommand::network(...)`, run with `GitCli::run_reporting(...)`, then
`command_failed` and `session.settle`; afterwards `forget_logs` (or `fetched` after a fetch) and emit
`repository.changed`. Error codes are SCREAMING_SNAKE_CASE `ErrorCode` values (plan's `branchNotFullyMerged`
→ e.g. `BRANCH_NOT_FULLY_MERGED`). Authentication/network failure classification is not built yet — add
what fetch needs. Gates run with and without `--all-features`.

1. Core: fetch, `fetch_refspecs`, branches, validation, RPC, contract
2. Renderer (later, UI)

## Steps

- [x] 1. Core
- [ ] 2. Renderer (later)

## Notes

Environment (2026-11-19): Arch Linux x86_64, rustc/cargo 1.95, git 2.56.0. Branched from
`feature/studio-04-m7`. Throwaway git runs lived in the session scratch folder with a temporary `HOME` and
`GIT_CONFIG_GLOBAL=/dev/null`; no network.

### 1. Core (as built)
- Verified on git 2.56: `switch`, `branch` (`-m`, `-d`/`-D`, `--set-upstream-to=`, `--unset-upstream`),
  `push --delete` and `fetch` all accept `--end-of-options`; `switch -c x --track refs/remotes/origin/x` and
  `branch --set-upstream-to=refs/remotes/origin/x` accept the full remote-tracking ref. git 2.31 still
  unverified (the open M1 spike).
- **Api first.** `methods/git.rs`: `GitOperationResult { status, refs, message }` (`message` stays null in
  M8), `GitFetchResult { updatedRefs, refs }`, params `GitFetchParams { repo, prune }`,
  `GitSwitchParams { repo, target }`, `GitBranchCreateParams { repo, name, startPoint, checkout }`,
  `GitBranchRenameParams { repo, refName, newName }`, `GitBranchDeleteParams { repo, target }`,
  `GitSetUpstreamParams { repo, refName, upstreamRefName }` (all `deny_unknown_fields`); value `BranchName`
  (1–200 chars, no leading `-`, not `HEAD` or `@`, and `refs/heads/<name>` well formed by the same rules as
  `Revision`). Error codes appended (39 now): `BRANCH_EXISTS`, `BRANCH_NOT_FULLY_MERGED`,
  `BRANCH_CHECKED_OUT_ELSEWHERE`, `LOCAL_CHANGES_WOULD_BE_OVERWRITTEN`, `OPERATION_IN_PROGRESS`,
  `AUTHENTICATION_REQUIRED`, `NETWORK_UNAVAILABLE`. Contract regenerated.
- **Renderer-callable methods** (`Renderer` audience, all "(op)"): `git.fetch`, `git.switch`,
  `git.branchCreate`, `git.branchRename`, `git.branchDelete`, `git.setUpstream`. **`fetch_refspecs` is not a
  method**: plan 06 adds its own method that takes a PR number and builds the refspec in the core, so no
  client ever sends a refspec (security checklist: no free-form git argument).
- **Deviation — tagged targets:** `git.switch` takes `target: { kind: "local", refName } | { kind:
  "trackRemote", remoteRefName, localName }` and `git.branchDelete` `target: { kind: "local", refName, force }
  | { kind: "remote", remoteRefName }` instead of two param shapes each: serde's untagged form gives no useful
  error and loses `deny_unknown_fields`. Plan 4.4 table corrected.
- **Core** (`git/operation.rs`): `OperationContext { cancel, request_id, progress }`; `Operations { queue,
  prompts }` given by `GitService::with_operations` (set in `Core::git()`; without it a mutation is
  `INTERNAL`). Each entry point locates the repository, builds a `Mutation` and runs its work through
  `operate`: inside `OperationQueue::run_exclusive` the work re-reads refs / status, then — success or not —
  `forget_logs`, status + refs are read with a fresh token (so a cancelled operation still answers what it
  left), and `RepositoryChanges::announce_operation` emits `repository.changed { parts: [status, refs],
  fingerprint }` (recording the fingerprint, so the next read does not announce it twice). Fetches also call
  `GitMemory::fetched(id, is_shallow)`. `Mutation::run_network` opens the prompt session inside the queue,
  runs `GitCli::run_reporting` with `NETWORK_LIMITS` (1800 s / 1 MiB), classifies, then `session.settle`.
  Local branch commands use `GitCommand::mutating` (new) with `BRANCH_LIMITS` (120 s / 1 MiB).
- `git/branch.rs`: preconditions from the fresh listing — unknown ref → `NOT_FOUND`; branch with
  `checkedOutInOtherWorktree` → `BRANCH_CHECKED_OUT_ELSEWHERE`; `operationInProgress` → `OPERATION_IN_PROGRESS`
  (switch, create with checkout); used name → `BRANCH_EXISTS`; then git's `check-ref-format
  refs/heads/<name>` (refusal → `BAD_REQUEST`); start point via `resolve_commit` (`UNKNOWN_REVISION`);
  deleting the current branch → `NOT_ALLOWED`. git's own refusals come through the classifier.
- **Deviations in commands** (plan 4.6 table corrected): remote delete is `push --progress --delete
  --end-of-options <remote> refs/heads/<branch>` (the plan's `--delete` after `--end-of-options` would be a
  refspec); tracking and upstream use the full `refs/remotes/…` ref; create with `checkout` is one `switch -c
  <name> --no-track --end-of-options <sha>`, so a refused switch leaves no branch. `-c <name>` is the only
  ref-like value before `--end-of-options` (an option's value, a validated `BranchName`).
- `git/sync.rs`: `fetch --all --progress [--prune] --no-recurse-submodules --no-auto-maintenance`;
  `updatedRefs` = branches, remote branches and tags added, moved or removed (`count_updated_refs` over the
  listing before and after). `fetch_refspecs`: remote must be configured (`NOT_FOUND`), at least one refspec
  (`BAD_REQUEST`); `Refspec::new(force, source, destination)` accepts only full well-formed refs and
  destinations under `refs/codecharta/` (`BAD_REQUEST`). **Found by the test:** git also updated
  `refs/remotes/origin/<branch>` (opportunistic remote-tracking update) — now `--no-tags --refmap=
  --no-write-fetch-head`, so only the named destinations are written (D5).
- Classifier (`failure.rs`): authentication texts (before network ones), network texts, `is already checked
  out at` / `used by worktree` (git 2.56 says `cannot delete branch 'x' used by worktree at …` too, so the
  plan's `already used by worktree` was narrowed), `already exists`, `would be overwritten by`, `is not fully
  merged`; messages in `error::message_for`; `error::refused(code)` for the core's own refusals.
- Routes (`serve/git_routes.rs` `operation_route!`): `request_id` = the JSON-RPC id, progress →
  `core.progress` with that id.
- Tests: `tests/git_branches.rs` — `should_switch_to_an_existing_branch`,
  `should_carry_an_unrelated_local_change_over`, `should_leave_the_tree_untouched_with_gits_file_list_when_refused`,
  `should_refuse_to_switch_during_a_merge`, `should_refuse_a_branch_checked_out_in_another_worktree`,
  `should_create_a_tracking_branch_from_a_remote_branch_and_refuse_an_existing_local_name`,
  `should_create_a_branch_at_a_commit_without_touching_the_tree`,
  `should_create_and_check_out_a_branch_and_refuse_an_unknown_start_point`,
  `should_keep_the_upstream_when_renaming`, `should_delete_a_merged_branch`,
  `should_refuse_an_unmerged_branch_and_delete_it_only_with_force`, `should_refuse_to_delete_the_current_branch`,
  `should_delete_a_branch_on_the_remote`, `should_set_and_unset_the_upstream`,
  `should_reject_invalid_names_and_ask_git_about_the_others`,
  `should_announce_repository_changed_after_each_operation` (also after a refusal),
  `should_pass_end_of_options_before_every_ref` (`RecordingGit`); `tests/git_fetch.rs` —
  `should_fetch_a_new_remote_branch_and_prune_a_deleted_one_only_when_asked`, `should_report_fetch_progress`,
  `should_abort_a_running_fetch_when_cancelled` (hermetic slow remote: `remote.origin.uploadpack = "sleep 30;
  git-upload-pack"`), `should_write_refs_codecharta_and_refuse_other_destinations`; unit tests for the
  classifier, `Refspec`, `announce_operation`, `BranchName`, the tagged targets; `git_protocol.rs` — branch
  create over stdio with `repository.changed`, fetch progress carrying the request id, malformed params →
  `BAD_REQUEST` without touching refs.
- Not covered by automated tests (manual, section 6 checks 6, 7, 12): real HTTPS / ssh remotes, the network
  classification on real failures, a long fetch with a queued action.

### Gates at the end of task 1 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --all-targets
  --all-features -- -D warnings`, `cargo test` (502 passed), `cargo test --all-features` (506 passed) green;
  `npm run contract` leaves no diff; root `npm run format:check` green; `visualization/`: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.json`, `npm test` green. Only generated `model/coreApi/` files and
  `electron/coreMethods.generated.json` changed in `visualization/`. No changelog entry: nothing user-visible
  until task 2.

### For task 2 (renderer)
- Call with `bridge.request(method, params, { operationId })`; progress arrives as `core.progress`, prompts as
  `prompt.requested` (M7 protocol); cancel with `bridge.cancel(operationId)`. Every call ends with
  `repository.changed` (parts `status`, `refs`); the answer itself carries fresh `status` and `refs`.
- Errors to handle: `LOCAL_CHANGES_WOULD_BE_OVERWRITTEN` (show `details.detail`, git's file list),
  `BRANCH_NOT_FULLY_MERGED` (second confirmation, then `force: true`), `BRANCH_EXISTS`,
  `BRANCH_CHECKED_OUT_ELSEWHERE`, `OPERATION_IN_PROGRESS`, `NOT_ALLOWED` (current branch), `NOT_FOUND`
  (ref gone since listing: refresh), `BAD_REQUEST` (name git refused), `AUTHENTICATION_REQUIRED`,
  `AUTHENTICATION_CANCELLED`, `NETWORK_UNAVAILABLE`, `CANCELLED`, `UNKNOWN_REVISION`.
- Validate names while typing with the `BranchName` rules (1–200 chars, no leading `-`, not `HEAD`/`@`, no
  `..`, `@{`, `//`, space, control characters, `~^:?*[\`, no component starting with `.` or ending in
  `.lock`, not ending in `/` or `.`).

### For M9–M11
- Build new mutations as `GitService` entry points in the `operation.rs` style: `locate`, `mutation(...)`,
  `operate(&mutation, work)`; the work re-reads what it validates via the `Mutation`. Network commands go
  through `Mutation::run_network` (askpass, progress, settle). `operate` already forgets logs, re-reads and
  announces on every path.
- `Settled<T>` carries the work's value plus fresh status and refs; add a `GitWorkingTree` read in M9 if the
  working tree must be returned, and `ChangedPart::WorkingTree` to `announce_operation` then.
- M11: classifier texts for push / pull are not added yet; `message` of `GitOperationResult` is free for
  pull / push notes; the ssh-agent message for a missing ssh helper is still open.

