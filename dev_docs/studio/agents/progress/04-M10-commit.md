---
name: 04-M10 commit
state: progress
version: 1
---

## Goal

Commit and amend staged changes in the core, then the renderer's commit box (plan 04, section 5, M10).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M10. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m9` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M9-changes-diff.md`: `working_tree::read_entries` gives the listing for preconditions; `operate`
already announces `workingTree`. Mutation style of `git/operation.rs`. Error codes SCREAMING_SNAKE_CASE
(plan's `identityUnknown` → `IDENTITY_UNKNOWN`, `hookFailed` → `HOOK_FAILED`). Never change the user's git
config. Gates with and without `--all-features`.

1. Core: `commit.rs`, `git.commit`
2. Renderer (later, UI)

## Steps

- [x] 1. Core
- [ ] 2. Renderer (later)

## Notes

Environment (2026-11-19): Arch Linux x86_64, rustc/cargo 1.95, git 2.56.0. Branched from
`feature/studio-04-m9`. Fixtures are hermetic (temporary `HOME`, empty global and system config, no network).

### 1. Core (as built)
- **Api first.** `values.rs`: `CommitSubject` (1–200 chars, one line, not only spaces, no control characters)
  and `CommitBody` (≤ 20 000 chars, no NUL). `methods/git.rs`: `GitCreateCommitParams { repo, subject, body,
  amend }` (`deny_unknown_fields`; `GitCommitParams` was taken by `{ repo, sha }`), method `git.commit`
  (`Renderer`) answering `GitOperationResult`. Error codes appended (44 codes): `IDENTITY_UNKNOWN`,
  `NOTHING_TO_COMMIT`, `HOOK_FAILED`, `CONFLICTS`. Contract regenerated.
- **Core.** `git/commit.rs`: `GitService::commit(&GitFolder, CommitRequest, &OperationContext)` in the
  `operation.rs` style (`locate` → `mutation` → `operate`); the request is taken by value as plan 4.5 wrote it
  (a borrowed temporary does not outlive the route macro's block). Inside the queue: status counts and
  `operation_in_progress` → preconditions → message file → `-c user.useConfigOnly=true commit
  --cleanup=whitespace [--amend] -F <file>` run at the repository root with the mutating environment (hooks
  and gpg in the user's locale, git's messages English). `Settled::into_operation_result` is now `pub(super)`.
- **Message file.** `<dataDir>/git-messages/message-<random>.txt` (`tempfile`, mode 0600 on unix), absolute,
  never inside the repository; `TempPath` deletes it on success, failure and cancellation. Text: subject, blank
  line, body (left out when blank), LF line ends (CRLF in the body becomes LF). `--cleanup=whitespace` keeps
  body lines starting with `#`.
- **Classification.** Commit rules in stderr and stdout before the general rules: `Author identity unknown` /
  `Please tell me who you are` → `IDENTITY_UNKNOWN`; `nothing to commit`, `no changes added to commit`,
  `You have nothing to amend` → `NOTHING_TO_COMMIT`; `unmerged files` → `CONFLICTS`; `gpg failed to sign` →
  `COMMAND_FAILED`; general rules next (e.g. `INDEX_LOCKED`); anything else → `HOOK_FAILED`. Detail = stderr
  then stdout, trimmed. **Verified** (the plan's UNVERIFIED item): a `pre-commit` hook exiting 1 leaves exactly
  its own output on stderr, nothing from git.
- **Identity.** Without identity variables and with `user.useConfigOnly=true` git 2.56 prints `*** Please tell
  me who you are.` and dies; the test checks that `.git/config` and the global config file are unchanged. The
  core never runs `git config`.
- **Deviations** (plan 4.4 / 4.6 corrected): preconditions read the status counts, not the listing (which
  stops at 5 000 entries); concluding a merge needs no staged entry; amend during a merge →
  `OPERATION_IN_PROGRESS` (git refuses it); cherry-pick, revert and bisect are refused like a rebase (plan:
  `None` or `Merge` only); a blank body leaves no trailing blank paragraph; `-F` comes last.
- Tests: `tests/git_commit.rs` — `should_commit_staged_files_with_subject_and_body`,
  `should_keep_a_body_line_starting_with_hash`, `should_amend_the_last_commit`,
  `should_refuse_to_commit_with_nothing_staged`,
  `should_fail_with_identity_unknown_without_identity_and_leave_the_git_config_unchanged`,
  `should_fail_with_hook_failed_and_its_output_when_the_pre_commit_hook_exits_1`, `should_conclude_a_merge`,
  `should_refuse_to_commit_with_conflicted_files`, `should_refuse_to_commit_during_a_rebase`,
  `should_delete_the_message_file_after_success_and_failure`,
  `should_commit_with_the_configured_identity_only_from_a_message_file_outside_the_repository`
  (`RecordingGit`: `-c user.useConfigOnly=true` before `commit`, `--cleanup=whitespace`, no `--no-verify`, the
  file below `<dataDir>/git-messages`); unit tests in `git/commit.rs` (message text, preconditions,
  classification, file deleted on drop), `values.rs`, `methods/git.rs`; `git_protocol.rs` —
  `should_commit_staged_changes_over_stdio_and_refuse_a_multi_line_subject`. Fixture:
  `TempRepo::runner_without_identity` (also removes the identity variables from the inherited environment),
  `TempRepo::global_config`; `support::wait_until_executable` is now public (the hook is run once before use,
  against "text file busy").
- Not covered by automated tests: Windows (hooks through git's own shell, `TempPath` deletion while git may
  still hold the file), gpg signing, `commit-msg` hooks, an empty merge concluded without staged entries.

### Gates at the end of task 1 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --all-targets
  --all-features -- -D warnings`, `cargo test` (557 passed), `cargo test --all-features` (561 passed) green;
  `npm run contract` leaves no diff; root `npm run format:check` green; `visualization/`: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.json`, `npm test` (4861 passed) green. Only generated `model/coreApi/` files
  and `electron/coreMethods.generated.json` changed in `visualization/`. No changelog entry: nothing
  user-visible until task 2.

### For task 2 (renderer)
- `git.commit { repo, subject, body, amend }` (with `operationId`) → `GitOperationResult { status, refs,
  message: null }`, then `repository.changed` (parts `status`, `refs`, `workingTree`). `body` is `""` for none;
  the subject must be one line (the box keeps subject and body apart).
- Errors: `NOTHING_TO_COMMIT` (nothing staged and not amending), `CONFLICTS` (conflicted files left),
  `OPERATION_IN_PROGRESS` (rebase, cherry-pick, revert, bisect; or amend during a merge), `IDENTITY_UNKNOWN`
  (show both `git config --global …` commands; `details.detail` holds git's text), `HOOK_FAILED` (show
  `details.detail`, the hook's output), `COMMAND_FAILED` (e.g. gpg), `INDEX_LOCKED`, `CANCELLED`, `TIMEOUT`
  (600 s), `BAD_REQUEST` (invalid subject or body).
- During a merge (`status.operationInProgress == "merge"`) Commit is allowed without staged files and concludes
  it; the amend-of-pushed confirmation uses `git.isAncestor` (HEAD against its upstream), the last message
  `git.commitDetails` of `HEAD`.

### For M11
- `CONFLICTS` exists now; pull's conflict classification should append its rules (`CONFLICT`, `could not
  apply`) to `failure.rs`, not to the commit rules. The commit after a merge pull goes through `git.commit`.

