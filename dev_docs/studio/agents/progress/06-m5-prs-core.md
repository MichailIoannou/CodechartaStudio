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
- [ ] 4. Fetch PR head and base choice
- [ ] 5–7. Renderer (later)
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

