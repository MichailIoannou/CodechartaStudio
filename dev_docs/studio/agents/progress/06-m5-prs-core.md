---
name: 06-M5 PRs and merge requests
state: progress
version: 1
---

## Goal

Detect a folder's hosting provider, list pull/merge requests through the user's own `gh` / `glab`, fetch a
PR head into the private ref `refs/codecharta/pr/<n>` on explicit request, and compare a PR against the
right base (plan 06, Milestones, M5).

## Tasks

Copied from `06-compare-commits-and-prs.md`, Milestones, M5. Split by orchestration: core tasks 1 and 4 now,
branched from `feature/studio-06-m4` (verified, merge pending). Tasks 2, 3 and 8 (gh/glab listing, cache)
need the 06-M0 fixtures, which need `gh`/`glab` installed and logged in — blocked on the owner. Renderer
tasks later with `design/06-compare.md`.

From earlier milestones: `fetch_refspecs` (04-M8) already fetches only into `refs/codecharta/*`
(`--no-tags --refmap= --no-write-fetch-head`) and refuses other destinations — build task 4 on it, through
the operation queue with askpass (04-M7). Remote URLs are stripped of credentials with plan 03's
`strip_credentials`. 06-M1: `Revision` refuses short names, so PR intents need their own fields;
`BaseMode::MergeBase` exists. Owner decision: the PR head is fetched only on an explicit click (D5).
Gates with and without `--all-features`.

1. (core) Provider detection, `hosting.status`
2. (core) GitHub through `gh` — blocked on 06-M0 fixtures
3. (core) Cache and listing RPC — blocked on task 2
4. (core) Fetch PR head into `refs/codecharta/pr/<n>`, `hosting.fetchChangeRequestHead`, PR base choice in resolve
5–7. Renderer (later)
8. (core) GitLab through `glab` — blocked on 06-M0 fixtures

## Steps

- [x] 1. Provider detection
- [ ] 2. gh (blocked)
- [ ] 3. Cache and listing (blocked)
- [x] 4. Fetch PR head and base choice
- [x] 5–7. Renderer, as far as the blocked tasks allow (`06-m4-m5-ui.md`)
- [ ] 8. glab (blocked)

## Notes

Environment (2026-11-19): Linux, rustc 1.95, git 2.56, node 26, npm 12.2. Branched from `feature/studio-06-m4`.
Builds used a shared `CARGO_TARGET_DIR` outside the worktree (disk space) with `CARGO_INCREMENTAL=0` and no
debug info.

### 1. Provider detection (done)
- Api first: `methods/hosting.rs` (`HostingProvider`, `DetectedBy`, `HostingOverride { provider, host }`,
  `HostingStatusParams { folder }`, `HostingStatus { provider, host, repository, remote, detectedBy }`), value
  `HostName` (lower case, digits, `.`, `-`, 1–253 bytes). Method `hosting.status`, **renderer**. No new error code.
- Core `hosting/`: `remote_url.rs::parse_remote_url` (the url parser of 05-M2's `snapshots/hosting.rs`, moved
  here; the snapshot probe now uses it and keeps its own rules: `origin` first, GitHub exactly owner/repo),
  `slug.rs::validate_repo_slug`, `detect.rs::detect` + `status_of`, `status.rs::hosting_status`.
- **Override storage:** the folder record gains an optional `hosting` (absent in older `project.json` files,
  no schema bump), shown as optional `ProjectFolder.hosting` and set by `projects.updateFolder { hosting }`.
  It applies only to remotes on its own host; a known host (github.com, gitlab.com) wins over it. Clearing an
  override is not possible yet (task 7 decides whether it needs to be).
- **Deviations:** `HostingStatus` has no `cli` yet (needs `gh auth status`, task 2). A remote whose url names no
  hosted repository (local path, one segment) or whose path is not a valid slug is skipped, so the next remote
  in preference order decides. No CLI subcommand `hosting status` (not part of task 1; add with task 3's
  `hosting list`). An unknown folder is `NOT_FOUND`, a plain folder `NOT_A_REPOSITORY`, a missing one
  `FOLDER_UNAVAILABLE` (via `compared_folder`).
- Tests: the plan's nine names with `should_` (in `remote_url.rs`, `slug.rs`, `detect.rs`), plus
  `should_name_no_repository_for_a_local_path_or_a_single_segment`, `should_skip_a_remote_that_names_no_hosted_repository`,
  `should_report_an_unrecognised_host_without_a_provider`, api `should_write_an_unrecognised_host_without_a_provider`,
  `should_refuse_an_override_for_an_upper_case_host`, `should_accept_only_a_lowercase_host_name`; cored
  `tests/serve_hosting.rs`: `should_detect_the_provider_over_json_rpc_and_honour_a_folder_override` (credentials
  never in the answer), `should_answer_an_unknown_folder_and_a_folder_without_remotes`.

### 4. Fetch PR head and base choice (done)
- Api first: error codes appended `REF_NOT_ON_REMOTE`, `HEAD_NOT_LOCAL` (52 now; plan names `git.refNotOnRemote`;
  `git.fetchFailed` / `git.fetchCancelled` are the existing classified codes and `CANCELLED`).
  `FetchChangeRequestHeadParams { folder, remote, provider, number }` (`deny_unknown_fields`, no refspec, no
  `operationId`) → `FetchedHead { gitRef, commit }`, method `hosting.fetchChangeRequestHead`, **renderer**,
  "(op)". `compare.rs`: intent `changeRequest { folder, provider, number, remote, baseRefName: BranchName,
  baseCommit, headCommit, mergeCommit }` (the last three nullable), `RefLabelKind::PullRequest`,
  `ResolveStatus::AlreadyMerged { target }` (the enum lost `Copy`), `ResolvedComparison.baseTip`
  (null outside merge-base mode).
- Core: `hosting/fetch.rs` (`ChangeRequestRef`: remote ref `refs/pull/<n>/head` / `refs/merge-requests/<n>/head`,
  private ref `refs/codecharta/pr/<n>` / `refs/codecharta/mr/<n>` as plan 06 owner decision 2 says, label
  `#n` / `!n`; `fetch_change_request_head` = one forced `Refspec` through 04-M8's `GitService::fetch_refspecs`
  — operation queue, askpass prompt session, progress, `--no-tags --refmap= --no-write-fetch-head`, configured
  remote only — then `resolve_commit` of the private ref). Classifier: `couldn't find remote ref` →
  `REF_NOT_ON_REMOTE`. Route `serve/hosting_routes.rs::fetch_change_request_head` builds the
  `OperationContext` like `operation_route!` (`git_routes::progress_of` is now `pub(super)`).
- Core: `compare/change_request.rs` (7.4) and `resolve.rs` (`Pair.origin: Option<MergeBaseOrigin>`,
  `from_merge_base`, `merge_base_status`); see the "As built (06-M5, task 4)" paragraph in plan 06, 7.4.
- **Deviations:** (1) head not local is the **error** `HEAD_NOT_LOCAL`, not `ResolveStatus::HeadNotLocal`:
  `ResolvedComparison` has no way to carry missing sides, and the renderer already holds number, remote and
  head commit. (2) Base not local (no recorded base, merge parent or `<remote>/<baseRefName>` in the clone) is
  `UNKNOWN_REVISION` naming the branch; the plan's "fetch `<remote> <base_ref_name>`" is not built: a fetch
  into `refs/codecharta/pr/<n>/…` would collide with `refs/codecharta/pr/<n>`, so it needs its own namespace
  decision (renderer can use plan 04's `git.fetch` meanwhile). (3) A merged request uses the first parent of
  `mergeCommit` before the remote tip (06-M0 task 1 still decides whether `baseRefOid` is usable; the recorded
  base, when local, still wins). (4) No `origin` / `changeRequest` fields on `ResolvedComparison` yet (M2 /
  task 3), no CLI `compare resolve --pr` (needs the listing for base and head; add with task 3).
- Tests: the plan's nine names with `should_`; extra `should_refuse_a_remote_that_is_not_configured`
  (resolve), unit `should_name_the_refs_of_each_provider`, `should_refuse_number_zero`,
  `should_label_a_remote_branch_tip_by_its_remote_and_name`, api
  `should_refuse_fetch_params_with_a_refspec_or_a_negative_number`,
  `should_read_a_change_request_intent_without_the_commits_it_does_not_know`; cored `serve_hosting.rs`
  `should_fetch_a_pull_request_head_and_compare_it_from_its_merge_base` (unknown number →
  `REF_NOT_ON_REMOTE`, fetch, then `compare.resolve` with `changeRequest`). The bare origin gets
  `refs/pull/7/head` with `git update-ref` (core) or a push to that ref (cored); no network.

### For the renderer (tasks 5–7)
- `hosting.status { folder }` → `{ provider, host, repository, remote, detectedBy }`; errors `NOT_FOUND`,
  `NOT_A_REPOSITORY`, `FOLDER_UNAVAILABLE`. `provider: null` with a `host` → the override prompt; write it with
  `projects.updateFolder { projectId, folderId, hosting: { provider, host } }`.
- `compare.resolve { intent: { kind: "changeRequest", folder, provider, number, remote, baseRefName,
  baseCommit, headCommit, mergeCommit }, shownCommit: null }`; on `HEAD_NOT_LOCAL` offer **Fetch** →
  `hosting.fetchChangeRequestHead { folder, remote, provider, number }` (request id = operation; progress as
  `core.progress`, prompts as `prompt.requested`, cancel `core.cancel`) → `{ gitRef, commit }`; resolve again
  with `headCommit: commit` (the fetched commit wins over a listed one) or `null`. Fetch errors:
  `REF_NOT_ON_REMOTE`, `NOT_FOUND` (remote), `BAD_REQUEST` (number 0), `AUTHENTICATION_REQUIRED`,
  `AUTHENTICATION_CANCELLED`, `NETWORK_UNAVAILABLE`, `CANCELLED`.
  Resolve errors besides M1's: `HEAD_NOT_LOCAL`, `UNKNOWN_REVISION` (base branch not in the clone),
  `NOT_FOUND` (remote). New status `alreadyMerged { target }`; `baseMode: "mergeBase"`; `baseTip` for
  "tip vs tip".

### For tasks 2, 3, 8 (blocked on 06-M0 fixtures)
- Task 2: `hosting/github.rs` against `gh-pr-list.json` / `gh-pr-view.json` / `gh-pr-list-empty.json`; reuse
  `RepoSlug` (`-R [HOST/]OWNER/REPO`, host from `HostingStatus.host` for non-github.com), `HostingStatus.cli`
  (`CliInfo`) from `gh --version` + `gh auth status --hostname`; the fake executable is `cc-fake-tool`
  (`tests/support::install_fake_tool`, sidecar answers). Merge `snapshots/hosting.rs`'s `HostingCli` /
  `gh pr list --search` probe with it instead of a second runner.
- Task 3: `ChangeRequestSummary` maps straight onto the `changeRequest` intent (`baseRefName`, `baseRefOid` →
  `baseCommit`, `headRefOid` → `headCommit`, `mergeCommit.oid` → `mergeCommit`); add the cache, the list/get
  methods, the CLI `hosting list` / `hosting status` / `compare resolve --pr`.
- Task 8: same for `glab` (`iid`, `target_branch`, `diff_refs.base_sha`, `sha`, merge commit field per fixture);
  the private ref `refs/codecharta/mr/<n>` already exists.

### 5–7. Renderer (partly done, 2026-11-20)
Built on `feature/studio-06-m4m5-ui`; details in `06-m4-m5-ui.md` ("M5"). Done: `hostingGateway.adapter.ts`, the
"Pull requests" segment with checking / unknown host (task 7 override) / NotInstalled + Open desktop tools / CLI
problem / number entry, fetch-then-resolve, the C6 HeadNotLocal offer with Cancel, the chip's PR badge and link, copy
with link. Waiting for tasks 2, 3, 8: the list rows and their filter/refresh/cache (`ChangeRequestsStore`),
`NotAuthenticated`, PR rows in the ref picker, `CompareFacade.compareChangeRequest`, request titles.
