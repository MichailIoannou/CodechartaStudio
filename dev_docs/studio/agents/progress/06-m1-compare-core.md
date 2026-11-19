---
name: 06-M1 compare core - commit vs commit
state: progress
version: 1
---

## Goal

Resolve a comparison of two commits (base and head, merge base, parent, current) to their snapshots in
the core, serve it as `compare.resolve` and on the CLI, then load the pair into delta mode in the
renderer (plan 06, Milestones, M1).

## Tasks

Copied from `06-compare-commits-and-prs.md`, Milestones, M1. Split by orchestration: core tasks 1–3 now,
branched from `feature/studio-05-m6` (plan 03–05 cores verified, merge pending); renderer tasks 4–11 later
with `design/06-compare.md` after the core stack is merged.

06-M0 is not done: `gh`/`glab` are not installed here, item 3 needs Windows, item 4 (memory → combined size
limits) needs the desktop build with projects. Use the plan's default `COMBINED_BYTES_WARNING` /
`COMBINED_BYTES_LIMIT` and mark them provisional in Notes. Reuse plan 04's `merge_base`, `is_ancestor`,
`rev_list_count` and 05-M5's `resolve_snapshot` (`SnapshotResolution`, "stale by" = `behind` (+ `ahead` when
diverged)) — do not duplicate git queries or nearest-snapshot logic. Gates with and without `--all-features`.

1. Contract and preflight (core)
2. Resolve commit comparisons (core)
3. `compare.resolve` RPC and CLI (core)
4–11. Renderer (later)

## Steps

- [x] 1. Contract and preflight
- [ ] 2. Resolve
- [ ] 3. RPC and CLI
- [ ] 4–11. Renderer (later)

## Notes

Environment (2026-11-19): Linux, rustc 1.95 (workspace toolchain), git 2.56, node 26, npm 12.2. Branched from
`feature/studio-05-m6` (verified, merge pending).

### Reconciliation of "Required from other plans" (core rows, overview section 10)
- 01: `CoreContext` is `Core` (`codecharta-core/src/lib.rs`); `ToolRunner` is `ProcessRunner`, git runs through
  `GitProcess` / `GitService`; error codes are `ErrorCode` (SCREAMING_SNAKE_CASE, append-only, `ErrorCode::ALL`),
  not `<area>.<code>`; registration is a `method!` marker in the api crate + `registry::METHODS` + a `Route` in
  `codecharta-cored/src/serve/dispatch.rs` (handlers in `serve/<domain>_routes.rs`, CLI in `cli/<domain>.rs`, not
  `rpc/` + `cli/`); contract: `npm run contract` in `visualization/`; test support: `tests/support/git_fixture.rs`
  (`TempRepo`, deterministic identities and dates) in the core, `tests/support` (`ServingCore`, `TestRepository`)
  in cored.
- 03: `FolderAddress` is `FolderRef { projectId, folderId }`; folder lookup is `ProjectRepository::resolve_folder`
  (`ResolvedFolder { path, kind, status }`) / `git_folder` (`NOT_FOUND`, `FOLDER_UNAVAILABLE` when missing).
- 04: `resolve_ref` is `GitService::resolve_commit(folder, &Revision)` → `GitCommitSummary { sha, parents,
  committed_at, … }` (`Revision` = `HEAD`, full sha or full ref name; short names and prefixes only through
  `projects.resolveCommit`); `is_ancestor`, `merge_base` (`None` for unrelated histories, so plan 06's
  `git/compare.rs::merge_base` is not written), `rev_list_count` exist on `GitService`; `has_commit` is
  `resolve_commit`'s `UNKNOWN_REVISION`; commit date is `committed_at`; `CommitId` is `CommitSha` (40 or 64 hex);
  `remotes` is `GitService::remotes`; the changed-files query (`GitService::changed_files`, `git.changedFiles`)
  already exists for M4; the network path (`run_git_network`, askpass) is for M5.
- 05: `find_snapshot` / `nearest_analysed` are one call, `FolderResolver::resolve(folder, &AnalysisTarget, cancel)`
  → `SnapshotResolution` (05-M5); record fields come as `SnapshotSummary` (`commit`, `shortCommit`, `checksum`
  optional, `mapBytes`, `profileHash`; no `rootName`, no display name).

### 1. Contract and preflight
- Api first: `methods/compare.rs` (plan: `src/compare.rs`), only the M1 types; see the "As built (06-M1, task 1)"
  paragraph in plan 06, section 2. Not reachable from a method yet, so `npm run contract` leaves the contract
  unchanged in this commit.
- Core: `compare/preflight.rs` (`preflight(base, head, &SizeLimits)`, `COMBINED_BYTES_WARNING` = 15 MB,
  `COMBINED_BYTES_LIMIT` = 60 MB, **provisional** until 06-M0 task 4), `compare/sides.rs::side_status`
  (`SnapshotResolution` → `SideStatus`).
- **Deviations:** `staleBy` = `behind + ahead` for every relation (the plan's "commits between requested and
  shown"; for an ancestor it is `behind`, for diverged `behind + ahead` as the orchestration note says, and a
  descendant counts its `ahead` instead of 0); `NearestSnapshot` also carries `relation` so the UI can say older /
  newer / other branch. `latest` (git unusable) maps to `missing` without a nearest snapshot: the newest snapshot
  of a folder is no stand-in for a commit. Preflight looks at the snapshot each side would show (exact, else
  nearest): identical only when both checksums are known and equal; profiles differ when the hashes differ (an
  import has none, so it differs from any analysed snapshot); size `> warning` warns, `> limit` blocks.
- Tests: the plan's four names with `should_` (`should_mark_a_side_missing_without_a_snapshot` in `sides.rs`, the
  others in `preflight.rs`), extra `should_not_report_identical_while_a_checksum_or_a_side_is_missing`,
  `should_default_to_the_provisional_limits`, `should_count_the_commits_on_both_sides_of_a_diverged_nearest_snapshot`,
  `should_keep_the_exact_snapshot_of_another_profile`; api `should_read_an_intent_by_kind_with_its_folder`,
  `should_refuse_an_expression_as_a_revision`, `should_write_statuses_with_their_tags`.
