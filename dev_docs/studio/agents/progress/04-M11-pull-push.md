---
name: 04-M11 pull, push, abort
state: complete
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
- [x] 2. Renderer

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

### 2. Renderer (as built, 2026-11-20)
Branch `feature/studio-04-m11-ui` from `feature/studio-04-m6` (the latest History work, on `feature/studio-next`).
Core built into `core/target/studio-04-m11-ui` (linked as `core/target/debug/codecharta-core`); no core change.

- **Api and failures.** `GitApiService.pull`, `push`, `abortOperation` under the caller's operation id;
  `GitOperationKind` gains `pull`, `push` (both cancellable, like fetch) and `abort` (local, not cancellable).
  `gitErrorText.ts`: `PUSH_REJECTED`, `STALE_PUSH_LEASE`, `NO_UPSTREAM` (with the branch) per H6, and
  `gitErrorFollowUp(error)` naming the one follow-up H6 gives ("Pull", "Fetch", "Publish branch");
  `GitFailureReport.report(error, context, followUps)` turns it into the toast's action when the caller can run it.
- **`SyncActionsService`** (root): `pull()` — fast-forward only; diverged branches (ahead and behind) ask the pull
  choice first, a `NOT_FAST_FORWARD` answer asks it afterwards (H5: "Pull on diverged branches opens the pull
  choice"); the counts and names of the choice come from a fresh `git.status`. Success toasts "Pulled n commits"
  counted with `git.measureDistances` between the old and new HEAD ("Already up to date" when HEAD did not move),
  since the counts before the pull may be older than the last fetch. `CONFLICTS` → H6 sentence with
  `conflictedFiles` from a fresh status (the toast says "Git stopped on conflicts in n files…"), and the merge /
  rebase notice appears with the re-read status. `push(branch?)` onto the upstream's remote (the longest configured
  remote name the upstream ref starts with) — "Pushed n commits to origin/x"; `publish(branch?)` with `setUpstream:
  true` to `origin`, else the first remote — "Published 'x' to origin"; `forcePush(branch?)` asks H15's Force Push
  (both short SHAs, the remote's commits the branch lacks = `behind`), then pushes with `forceWithLeaseExpected` =
  the remote branch commit the text named; `abort()` asks H15's Abort Merge / Abort Rebase, then
  `git.abortOperation`. Follow-ups: Pull → `pull()`, Fetch → `BranchActionsService.fetch(false)`, Publish branch →
  `publish()`.
- **Sync button (H5).** Main part per H5's table (`util/syncState.ts mainSyncAction`): detached → Fetch; no upstream →
  Publish; upstream gone → Fetch with the gone title; behind → Pull `↓n` (diverged also `↑n`, diverged title); ahead
  → Push `↑n`; else Fetch. Counts `text-xs tabular-nums` with `fa-arrow-down` / `fa-arrow-up`; the label hides below
  `xl`, icon and counts stay. Running: "Fetching…" / "Pulling…" / "Pushing…", disabled, static icon, caret becomes
  Cancel ("Cancel the pull"). Caret menu (`syncMenuItems`): Fetch · Fetch and Remove Deleted Branches · Pull · Push ·
  Publish Branch (no upstream only) · Force Push (with Lease)… · Set Upstream… (on a branch), disabled items keep
  their reason in `title` (`disabledReason`, so the hover works).
- **Branch menu (H10).** Current local: Rename…, Push, Set Upstream…; other local: …, Set Upstream…, Push, Force
  Push (with Lease)…, with the same reasons as the sync menu (`pushReasonOf`, `forcePushReasonOf`).
- **Pull choice and force push (H15).** `GitConfirmationService.choose(GitChoice)` → value or null; the dialog's third
  layout: title, text, Cancel (focused) then the options as plain `btn` (no default): Cancel / Merge / Rebase my
  commits. Force Push and Abort use the destructive layout.
- **Operation notice (H6).** `cc-operation-state-banner` under the toolbar (first of the notices): merge "Merging into
  'main'. Resolve the conflicts in your editor, stage the files, then commit. 2 files have conflicts." + "Abort
  merge…" + "Refresh"; rebase "Rebasing 'x'. … continue the rebase in a terminal." + "Abort rebase…" + "Refresh";
  cherry-pick / revert / bisect "A <name> is in progress. Finish or abort it in a terminal." + "Refresh". Abort is
  disabled with "Waiting for the previous git operation…" while one runs.
- **W1.** `workspaceTrigger.ts` words "Pulling" (`fa-arrow-down`) and "Pushing" (`fa-arrow-up`), pulsing, as W1 lists.
- **Stand-in bridge.** `git.pull` (per-mode `pullRefusals`; `pullConflicts` stop a merge / rebase pull with the merge
  or rebase in progress and conflicted rows; otherwise the branch moves onto its upstream for every mode), `git.push`
  (a push without lease is `PUSH_REJECTED` while the branch is behind; a lease must equal the remote commit, else
  `STALE_PUSH_LEASE`; `setUpstream` creates `<remote>/<branch>` and tracks it), `git.abortOperation` (`NOT_ALLOWED`
  unless that operation is in progress; drops conflicted rows).
- Tests (plan names where they apply): `syncActions.service.spec.ts` — **fast-forward-only by default**; **rebase /
  merge offered only after `notFastForward`** (and before pulling diverged branches); cancel sends nothing; merge
  chosen; **conflicts counted**; network failure names the remote; **publish without upstream**; **Pull offered after a
  rejected push** (and runs a pull); Publish branch after `NO_UPSTREAM`; **force-push text with both SHAs and that
  SHA sent**; declined force push; Fetch after a stale lease; **abort merge confirmed**, rebase on a detached HEAD,
  nothing to abort. `syncState.spec.ts` (main action table, **ahead/behind counts**, reasons, remotes, menu),
  `syncButton.component.spec.ts`, `branchMenu.spec.ts`, `branchContextMenu.component.spec.ts`,
  `gitConfirmDialog.component.spec.ts` (choices), `operationNotice.spec.ts`, `operationStateBanner.component.spec.ts`,
  `effectText.spec.ts`, `gitErrorText.spec.ts`, `gitFailureReport.service.spec.ts`, `gitOperation.service.spec.ts`,
  `gitApi.service.spec.ts`, `workspaceTrigger.spec.ts`, fake bridge spec. E2E: `gitWorkflow.e2e.ts` (04-M12).

### Decisions and readings (renderer)
- **Design over plan:** one split button (OD3, H5) instead of `syncButtons`; no `pullChoiceDialog` / `pushDialog`
  components — the choice and the force-push confirmation are layouts of the existing `cc-git-confirm-dialog`; Push
  and Publish have no confirmation (H15). The "conflicted files listed" of the plan's test list is the toast's count
  plus the Changes tab's Conflicted group (H6 / H11); the notice itself names the count only.
- **Wording supplied here** (no design text): disabled reasons "HEAD is detached: switch to a branch first" (Pull,
  Push, Force Push on a detached HEAD), "Nothing to push" (H10's example, reused for the sync menu), "The remote has
  no commits that your branch lacks — use Push" (Force Push while `behind` is 0: the confirmation would say "0 commits
  … removed"), "This repository has no remote" (Publish without a remote; also the main part's title then); a
  rebase on a detached HEAD (git detaches while rebasing) reads "A rebase is in progress. …" and its abort
  confirmation "return the branch to the state before the pull"; a merge notice with no conflicted file leaves out
  the count sentence; a merge into a detached HEAD names its short SHA. Force push success reuses "Pushed n commits
  to <upstream>" (n = ahead). Menu icons: `fa-arrow-down` Pull, `fa-arrow-up` Push and Force Push,
  `fa-cloud-arrow-up` Publish Branch; no hover hints besides Fetch's.
- **Push without upstream** in the branch menu is disabled with H6's "'x' has no upstream branch." (the sync menu
  has Publish Branch for the current branch; a non-current branch is published by switching to it first).
- **Publish remote:** `origin` when configured, else the first remote (H5's title names "origin").
- **The sync button stays in the History toolbar only.** H5 also puts it in W1's GIT section and on the project
  overview card (owned by areas 05 and 03, which other agents change now); not done here, so
  `cc-git-confirm-dialog` stays hosted in the History panel. Left for the orchestrator.
- **Notice layout:** the merge / rebase notice's buttons follow its text (`flex-wrap justify-start`) instead of
  sitting at the right end like the shallow and slow notices: the conflicts error toast, which H6 shows at the same
  time and which stays until dismissed, covered "Abort merge…" at the right end (found by the e2e; the toast sits at
  the top right below the nav bar, OD8). At 1280 px the buttons are now clear of the toast; below roughly 1100 px a
  long notice still reaches under it. The toast also covers the toolbar's Log / Changes tabs and Refresh — question
  for the designer below.
- During a merge or rebase the sync button still offers Pull / Push from the counts; git refuses with
  `OPERATION_IN_PROGRESS`, worded by H6 ("A merge is in progress. Finish or abort it first."). The design does not
  disable it; left as is.

### Questions for the designer (renderer)
1. Error toasts sit over the right end of the History toolbar (Log / Changes tabs, Refresh) and of the first notice;
   the conflicts toast appears exactly when the notice's Abort is needed. Should git error toasts start below the
   History notices, or should the notice keep its actions on the left?
2. Should the sync button (and Force Push) be disabled while a merge or rebase is in progress, with a reason?
3. Push of a non-current local branch without upstream: disabled (as built), or publish it like Publish Branch?
4. Wording of the supplied disabled reasons above, and whether Force Push should stay enabled when nothing on the
   remote would be replaced.

### Gates at the end of task 2 (Linux)
See `04-M12-workflow-e2e.md` (one run for both milestones).
