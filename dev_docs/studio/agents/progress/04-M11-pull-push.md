---
name: 04-M11 pull, push, abort
state: progress
version: 1
---

## Goal

Pull (fast-forward by default, rebase or merge when asked), push (first push sets upstream, force only
with lease and an expected SHA, never `--force`), and abort of a merge or rebase in the core, then the
renderer controls (plan 04, section 5, M11).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M11. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m10` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M10-commit.md` and earlier: `CONFLICTS` exists — pull's conflict rules (`CONFLICT`, `could not
apply`) go into `failure.rs`; network commands through `Mutation::run_network` (askpass, progress,
settle); M8 left the push/pull classifier texts and the ssh-agent message to this milestone. Error codes
SCREAMING_SNAKE_CASE (`notFastForward` → `NOT_FAST_FORWARD`, `pushRejected` → `PUSH_REJECTED`,
`stalePushLease` → `STALE_PUSH_LEASE`). Gates with and without `--all-features`.

1. Core: pull, push, abort, RPC
2. Renderer (later, UI)

## Steps

- [x] 1. Core
- [ ] 2. Renderer (later)

## Notes

Environment (2026-11-19): Arch Linux x86_64, rustc/cargo 1.95, git 2.56.0. Branched from
`feature/studio-04-m10`. Fixtures are hermetic (temporary `HOME`, empty global and system config, a bare
origin by path and a second clone; no network).

### 1. Core (as built)
- **Spike (git 2.56, throwaway repositories, no network).** `pull --ff-only` on diverged branches: exit 128,
  stderr `fatal: Not possible to fast-forward, aborting.` (the `Diverging branches …` line is an advice hint
  and may be switched off). A merge pull with conflicts writes everything to **stdout** (`CONFLICT (content):
  …`, `Automatic merge failed`), stderr stays empty; a rebase pull writes `CONFLICT` to stdout and `error:
  could not apply …` to stderr. `push --porcelain` writes each refused ref to **stdout** (`!\t<src>:<dst>\t
  [rejected] (non-fast-forward)`, `(fetch first)`, `(stale info)`, `[remote rejected] (pre-receive hook
  declined)`), stderr only `error: failed to push some refs`. `pull` without upstream: `There is no tracking
  information for the current branch.`; `merge --abort` / `rebase --abort` without one: exit 128.
- **Api first.** `methods/git.rs`: enums `GitPullMode { ffOnly, rebase, merge }`, `GitAbortableOperation
  { merge, rebase }`; params `GitPullParams { repo, mode }`, `GitPushParams { repo, branchRefName, remote,
  setUpstream, forceWithLeaseExpected }` (`FullRefName`, configured remote name, `bool`, `CommitSha | null`),
  `GitAbortOperationParams { repo, operation }` (all `deny_unknown_fields`, so no `force` can be smuggled);
  methods `git.pull`, `git.push`, `git.abortOperation` (`Renderer`, answering `GitOperationResult`, `message`
  null). Error codes appended (48 now): `NOT_FAST_FORWARD`, `PUSH_REJECTED`, `NO_UPSTREAM`,
  `STALE_PUSH_LEASE`. Contract regenerated.
- **Core** (`git/sync.rs`, `operation.rs` style: `locate` → `mutation` → `operate`): entry points
  `GitService::pull`, `push` (`PushRequest`), `abort_operation`. Pull refuses inside the queue with
  `OPERATION_IN_PROGRESS`, a detached head (`NOT_ALLOWED`) and a branch without upstream (`NO_UPSTREAM`), then
  runs `pull <--ff-only | --rebase | --no-rebase --no-edit> --progress --no-recurse-submodules` through
  `Mutation::run_network`, and ends with `GitMemory::fetched` like a fetch. Push looks the branch and the remote
  up in the fresh listing (`NOT_FOUND`), pushes onto the upstream's branch on that remote or one of the same
  name, `-u` when asked. Abort runs `merge --abort` / `rebase --abort` (mutating, not network) only when that
  operation is in progress (`NOT_ALLOWED` otherwise).
- **Deviations** (plan 4.4 / 4.6 corrected): the lease is `--force-with-lease=refs/heads/<destination>:<sha>`
  — git's lease names the remote ref being replaced, so the plan's `refs/heads/<b>` was wrong whenever the
  upstream branch has another name; `forceWithLeaseExpected` is a `CommitSha`, not a free string; abort takes
  the api enum `GitAbortableOperation`; pull without upstream is refused by the core before git runs.
- **Classification** (`failure.rs`, appended after the network rules, before the branch rules — a refused
  tag push says `already exists`): `pre-receive hook declined`, `[rejected]`, `[remote rejected]`, `failed to
  push some refs` → `PUSH_REJECTED`; `Diverging branches can't be fast-forwarded`, `Not possible to
  fast-forward` → `NOT_FAST_FORWARD`; `stale info` → `STALE_PUSH_LEASE` (before the push rules);
  `has no upstream branch`, `There is no tracking information` → `NO_UPSTREAM`; `CONFLICT`, `could not apply` →
  `CONFLICTS`. `Mutation::run_network` now classifies stderr **and** stdout (`failure::classify_streams`,
  `error::network_failed`; detail = stderr, then stdout); other commands keep stderr only. The `CONFLICTS`
  message now fits pull and commit ("resolve them in your editor and stage them, or abort").
- **ssh-agent message** (left open by M7/M8): when the operation's askpass setup has no ssh helper (Windows
  without a space-free path), an `AUTHENTICATION_REQUIRED` whose detail shows `Permission denied (publickey` or
  `Host key verification failed` gets the message `error::SSH_AGENT_MESSAGE` ("CodeCharta cannot ask for ssh
  passphrases on this machine. Load the key into ssh-agent / Pageant first."), applied before `settle`.
- Tests: `tests/git_sync.rs` — `should_fast_forward_on_pull`,
  `should_fail_with_not_fast_forward_and_leave_the_repository_unchanged`, `should_rebase_or_merge_when_asked`,
  `should_leave_the_operation_in_progress_on_conflicts`, `should_abort_a_merge_and_a_rebase`,
  `should_refuse_to_abort_an_operation_that_is_not_in_progress`,
  `should_refuse_to_pull_without_an_upstream_or_a_branch`, `should_set_the_upstream_on_the_first_push`,
  `should_fail_with_push_rejected_when_the_remote_is_ahead`, `should_force_with_lease_only_with_the_expected_sha`,
  `should_fail_with_stale_push_lease_when_the_remote_moved`, `should_never_pass_force_to_git` (`RecordingGit`:
  no `--force`, `-f` or bare `--force-with-lease`; the only lease is `<destination>:<shown sha>`),
  `should_pass_askpass_and_progress_to_every_network_command` (`RecordingGit` with an attached askpass target:
  pull and push carry the askpass setup and `--progress`, no other command does),
  `should_name_ssh_agent_when_ssh_cannot_ask_for_a_passphrase` (`core.sshCommand` = a local `sh -c` refusing
  the key; with an ssh helper the message stays the generic one). Unit tests: classifier texts
  (`should_classify_refused_pulls_and_pushes_in_stderr_and_stdout`), `push_args` / `pull_args`,
  `without_ssh_prompts`, `network_failed`, params. `git_protocol.rs` —
  `should_pull_and_push_over_stdio_and_reject_a_free_form_force`. Fixture: `OperationsHarness::attach_askpass`.
- Not covered by automated tests (manual, plan section 6 checks 8, 11, 13): real HTTPS / ssh remotes and their
  prompts during pull and push, a `pre-push` hook, protected branches on a hosting service, Windows without a
  space-free helper path (the ssh-agent message is tested through a fake ssh on Linux), the ff-only advice
  hint switched off on other git versions. A rebase pull with uncommitted changes fails with git's `cannot pull
  with rebase: …` as `COMMAND_FAILED` (no autostash, plan unchanged).

### Gates at the end of task 1 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --all-targets
  --all-features -- -D warnings`, `cargo test` (578 passed), `cargo test --all-features` (582 passed) green;
  `npm run contract` leaves no diff; root `npm run format:check` green; `visualization/`: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.json`, `npm test` (4861 passed) green. Only generated `model/coreApi/` files
  and `electron/coreMethods.generated.json` changed in `visualization/`. No changelog entry: nothing
  user-visible until task 2.

### For task 2 (renderer)
- `git.pull { repo, mode: "ffOnly" | "rebase" | "merge" }`, `git.push { repo, branchRefName, remote,
  setUpstream, forceWithLeaseExpected }`, `git.abortOperation { repo, operation: "merge" | "rebase" }`, each
  with `operationId`; answer `GitOperationResult { status, refs, message: null }`, then `repository.changed`.
  Pull and push report `core.progress` and may raise `prompt.requested`.
- Errors: `NOT_FAST_FORWARD` (open the pull choice: rebase / merge), `CONFLICTS` (banner from
  `status.operationInProgress` and the working tree's conflicted rows; Abort → `git.abortOperation`),
  `NO_UPSTREAM` (offer Set upstream / Publish), `PUSH_REJECTED` (offer Pull), `STALE_PUSH_LEASE` (fetch, review,
  retry), `NOT_ALLOWED` (detached head; nothing to abort), `NOT_FOUND` (branch or remote gone: refresh),
  `OPERATION_IN_PROGRESS`, `LOCAL_CHANGES_WOULD_BE_OVERWRITTEN`, `AUTHENTICATION_REQUIRED` (its message may be
  the ssh-agent one), `AUTHENTICATION_CANCELLED`, `NETWORK_UNAVAILABLE`, `CANCELLED`, `COMMAND_FAILED` — always
  with `details.detail`.
- Publish: `setUpstream: true` without an upstream. Force push: `forceWithLeaseExpected` = the remote-tracking
  commit shown in the confirmation (`GitRemoteBranch.commit` of the upstream); the core leases the destination.

