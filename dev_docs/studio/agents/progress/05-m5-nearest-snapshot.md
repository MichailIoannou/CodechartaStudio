---
name: 05-M5 nearest snapshot and the stale notice
state: progress
version: 1
---

## Goal

Resolve which snapshot to show for a selected commit or working tree (exact, nearest ancestor,
descendant, diverged, latest, none) and tell the user when it is stale (plan 05, Milestones, M5).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M5. Split by orchestration: core half
(task 1, and task 2 without the fake-bridge part) now, branched from `feature/studio-05-m3` (verified, merge
pending); tasks 2 (fake bridge), 3–7 (renderer, notice, chip, changelog) later with `design/05-snapshots.md`
after the core stack is merged.

From `05-m3-queue-rpc-cli.md`: CLI `snapshots resolve` answers `none` until this milestone; reuse plan 04's
`GitService::rev_list` (batches, stop on `Break`), `measure_distances` (≤ 200 candidates), `is_ancestor`,
`merge_base`, `rev_list_count`, and 03-M3/05-M2's snapshot repository (imports: commit-bound vs unbound).
Owner decision: selecting an unanalysed commit never starts an analysis by itself. Measure on a 100k-commit
repository (build with `git fast-import`). Gates with and without `--all-features`.

1. `snapshots/nearest.rs`
2. `snapshots.resolveForCommit` RPC and CLI `snapshots resolve` (fake-bridge part later)
3. Notice wording (later, UI)
4. `SnapshotViewService` resolution flow (later, UI)
5. Notice component (later, UI)
6. Status on the folder selector (later, UI; the design has no separate chip)
7. Changelog (later)

## Steps

- [x] 1. Nearest resolution
- [x] 2. RPC and CLI
- [x] 2. Fake bridge
- [ ] 3–7. Renderer (later)

## Notes

Environment (2026-11-19): Linux, rustc 1.95 (workspace toolchain), git 2.56, node 26, npm 12.2. Branched from
`feature/studio-05-m3` (verified, merge pending).

### 1. Nearest resolution
- Api first (`methods/snapshots.rs`): `SnapshotRelation` (`ancestor` / `descendant` / `diverged`), `LatestReason`
  (`PLAIN_FOLDER`, `GIT_UNAVAILABLE`, `REPOSITORY_UNAVAILABLE`), `NoSnapshotReason` (`NO_SNAPSHOTS`, `NO_COMMITS`,
  `UNKNOWN_COMMIT`, `UNRELATED`; both append-only), `SnapshotResolution` (tag `kind`: `exact { snapshot,
  isCurrentProfile }`, `nearest { snapshot, isCurrentProfile, relation, behind, ahead }`, `latest { snapshot, reason }`,
  `none { reason }`). Not reachable from a method yet, so the contract is unchanged in this commit.
- `snapshots/nearest.rs`: see the "As built (05-M5)" paragraph under "Resolving what to show" in plan 05 (signature,
  request, cache). **Deviations:** ≤ 4 parameters, so the plan's `repo, target, snapshots, current_profile_hash`
  became `ResolutionRequest` and the cache is a parameter; the plan's `SnapshotEntry` / `Sha` are the built
  `SnapshotSummary` / `CommitSha`; reasons instead of an `errorMessage` (the renderer words them); the cache is keyed
  by a fingerprint of the snapshot set, not a counter bumped on `snapshots.changed` (imports, moves and deletions
  emit none). Plain folders are checked before step 1 (otherwise a plain folder, whose `A` is always empty, would
  answer `None`). A git folder whose git is missing / too old, or whose repository is missing / not one, falls back
  to `Latest` without unbound imports. A working-tree target in a repository without commits is `NO_COMMITS`.
- Reused, not re-built: plan 04's `measure_distances` (step 6, four at a time, unknown commits left out, remembered
  per repository), `merge_base` (unrelated histories skipped, only for the diverged candidates in score order until
  one shares history), `rev_list_count` (remembered), `resolve_commit` (`HEAD`), `LruCache` for the resolutions.
- **Stream (plan 04 extended, test first):** `GitService::rev_list_with_parents` + `query::WalkedCommit { sha,
  is_merge }`; `rev_list` and it share one generic batcher (`BatchSink<Item>`). It runs `rev-list --parents --stdin`
  **without `--date-order`**: measured, `--date-order` makes git sort the whole history before printing the first line
  (368 ms on 100 000 commits, first line of the default order after 1.6 ms). Without the topological promise a
  stream position is only a distance while no merge was met — exactly the plan's "no count call" case — so after a
  merge every candidate (≤ 10) is counted; a lower-bound shortcut (count ≥ position) was tried and removed, because
  it needs that promise.
- Measured (release build, `TempRepo::linear_history(100_000)` = `git fast-import`, 3.0 s to build; first call /
  cached): ancestor 10 back 8 ms / 3 µs; ancestor 99 000 back 572 ms; descendant 50 000 ahead (full walk + step 6)
  491 ms; merge on top with 13 analysed ancestors (10 counted) 171 ms; diverged 99 990 back 220 ms; 50 diverged
  candidates 704 ms / 16 µs. Raw git on the same repository: full `rev-list --parents` 605 ms, `rev-list --count
  HEAD~99000..HEAD` 388 ms, `merge-base HEAD~99990 HEAD` 384 ms. **No `--max-count`:** the walk already stops at
  the first linear hit, at ten candidates or 20 000 commits after the first; capping it would only send the "no
  ancestor within N" case into step 6, which costs more. The measurement test is not committed (it takes ~10 s).
- Tests (`tests/nearest.rs`, temporary repositories, summaries built in memory): the plan's names, except
  `should_stop_the_stream_after_ten_candidates`, which is a unit test of the walk in `nearest.rs` (beside
  `should_stop_at_the_first_candidate_when_no_merge_came_before_it`, `should_stop_the_walk_far_enough_after_the_first_candidate`,
  `should_order_commit_dates_across_offsets`); extra `should_return_none_for_a_commit_the_repository_does_not_have`;
  `git_queries.rs` `should_tell_merge_commits_apart_in_a_walk_with_parents`; api
  `should_write_a_resolution_with_its_kind_and_camel_case_fields`.

### 2. RPC and CLI (core half)
- Api first: `ResolveForCommitParams { projectId, folderId, target }` (`folder()`), method marker
  `SnapshotsResolveForCommit` = `snapshots.resolveForCommit`, **renderer**, result `SnapshotResolution`. Contract
  regenerated: new `LatestReason.ts`, `NoSnapshotReason.ts`, `ResolveForCommitParams.ts`, `SnapshotRelation.ts`,
  `SnapshotResolution.ts`; `coreApi.ts` and `coreMethods.generated.json` list the method.
- Core: `snapshots::FolderResolver { projects, snapshots, git, cache }::resolve(folder, target, cancel)`
  (`snapshots/folder_resolution.rs`, new file beside `nearest.rs`): resolves the folder (`NOT_FOUND` for an unknown
  project or folder), lists its snapshots, takes the current profile hash from the project's profile (`None` while it
  is invalid, so nothing matches it) and maps the folder to `Plain` / `Git` / `MissingGit` (a git folder that is
  missing on disk). `Core::resolution_cache()` is the one cache of the serving core; a CLI call has its own core.
- Serve: `snapshots_routes::resolve_for_commit` (request cancellation passed through). CLI: `snapshots resolve`
  builds the same resolver over a read-only store (see the "As built (05-M5)" line under "Headless CLI" in plan 05).
- Tests: protocol `analysis_protocol.rs` `should_return_each_resolution_kind_over_json_rpc` (none before the
  analysis, exact after it, nearest ancestor after one more commit, latest for a plain folder whose only snapshot is
  an import); CLI `cli_analyse.rs` `should_print_the_resolution_as_json` (replaces
  `should_resolve_no_snapshot_until_the_nearest_search_exists`: none, then exact for the commit and through HEAD for
  the working tree, text and JSON). `TestRepository::add_commit` added to the cored test support.
- Docs: `core/README.md` command line. No changelog entry: nothing a user sees ships before the UI tasks.

### For the UI tasks (3–7) and plan 06
- Call `snapshots.resolveForCommit { projectId, folderId, target }` with `target` `{ kind: "commit", sha }` or
  `{ kind: "workingTree" }`; it never starts an analysis (owner decision). Answer `SnapshotResolution`:
  `exact { snapshot, isCurrentProfile }`; `nearest { snapshot, isCurrentProfile, relation, behind, ahead }` with
  `relation` `ancestor` (behind = N, ahead = 0), `descendant` (0, N) or `diverged` (both) — "stale by N" is `behind`
  (+ `ahead` for diverged); `latest { snapshot, reason: PLAIN_FOLDER | GIT_UNAVAILABLE | REPOSITORY_UNAVAILABLE }`;
  `none { reason: NO_SNAPSHOTS | NO_COMMITS | UNKNOWN_COMMIT | UNRELATED }`. `snapshot` is a `SnapshotSummary`
  (`source` tells an import, `target` a working-tree snapshot, which answers a working-tree selection exactly).
  `isCurrentProfile` false = flag "other profile" (an import has no profile and is also false; word it by `source`).
- The banner's "Imported maps without a commit are listed under Snapshots" needs `snapshots.list` (unbound imports
  are never resolved for a git folder).
- Resolutions are cached in the core per repository + commit + snapshot set; after `snapshots.changed`, an import,
  move or delete the next call recomputes by itself. A working-tree target re-reads HEAD every call, so the
  repository-changed signal only has to trigger a new call. First calls cost up to ~0.6 s on 100 000 commits when no
  analysed ancestor is near; repeated calls are microseconds.
- Plan 06: `GitService::rev_list_with_parents` streams without `--date-order` (fast first line, no topological
  order); `rev_list` keeps `--date-order`. "Use nearest" for a missing comparison side can call the same method.


### 2. Fake bridge (renderer half, branch `feature/studio-05-m5-ui` from `feature/studio-stack`)
- `snapshots.resolveForCommit` in the stand-in bridge: a scripted answer (seed `resolutions` by
  `<folderId>/<sha | workingTree>`, or `setResolution(folder, target, resolution)`) wins until an analysis of that
  target finishes (`completeJob` drops it, so the re-resolution after a finished job answers exact). Unscripted: no
  snapshots → `none NO_SNAPSHOTS`; plain folder → `latest` (newest, `PLAIN_FOLDER`); otherwise the target's own
  snapshot (working tree: a working-tree snapshot, else the one at the seeded HEAD) as `exact`
  (`isCurrentProfile` = analysed), else `none UNRELATED`. The factory body stays self-contained.
