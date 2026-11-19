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
- [x] 2. Resolve
- [x] 3. RPC and CLI
- [x] 4. Prune remembered selection (tidy first)
- [ ] 5. Compare state, text and gateway ports
- [ ] 6. Orchestrate loading a comparison into delta
- [ ] 7. Swap and leave
- [ ] 8. Adapters to projects/snapshots and the bridge
- [ ] 9. Facade, comparison chip, compare dialog, Compare tab delegation, legend caption
- [ ] 10. Screenshot name base before head
- [ ] 11. E2E and changelog

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

### 2. Resolve
- Core: `compare/resolve.rs::CommitComparison { git: &GitService, sides: &impl SideLookup, limits: SizeLimits }`
  `::resolve(&GitFolder, &ResolveComparisonParams, cancel)`. `compare/sides.rs::SideLookup::status_of(&ComparedCommit,
  cancel)` (the plan's `SnapshotLookup` port), implemented for 05-M5's `FolderResolver` (one `resolve` per side,
  `side_status` on the answer). Base mode is always `tip` in M1.
- Picking: every revision goes through `GitService::resolve_commit` (peels tags, `UNKNOWN_REVISION` when missing).
  `commits`: the same commit or `is_ancestor(a, b)` → a is the base; `is_ancestor(b, a)` → b; else the older
  `committed_at` (a tie keeps a). `withParent`: the commit's first parent, `UNKNOWN_REVISION` "The commit has no
  parent to compare with." for a root commit. `withCurrent`: base the commit, head `shownCommit`, else `HEAD`.
  Status: `sameCommit` when base = head, else `merge_base` → `noCommonAncestor` for `None`, else `ready`. Labels:
  `refs/tags/x` → tag `x`, `refs/heads/x` / `refs/remotes/x` → branch, else the first 7 hex digits.
- **Deviations:** no `git/compare.rs::merge_base` (plan 04's exists, exit 1 → `None`), no `compare/ports.rs`
  (the names are known now; one trait where a test needs a seam). Same-commit still looks up both sides, so
  `preflight` is always filled.
- Tests (`tests/compare_resolve.rs`, `TempRepo`, in-memory `SideLookup` over `resolve_snapshot`): the plan's six
  names with `should_`; extra `should_compare_a_commit_with_its_first_parent`,
  `should_compare_with_the_shown_commit_else_head`, `should_refuse_a_revision_the_repository_does_not_have`.

### 3. RPC and CLI
- Api first: method marker `CompareResolve` = `compare.resolve`, **renderer**, `ResolveComparisonParams` →
  `ResolvedComparison`, registered after `snapshots.prune`. Contract regenerated: 13 new type files (`BaseMode`,
  `CompareIntent`, `ComparedCommit`, `NearestSnapshot`, `Preflight`, `RefLabel`, `RefLabelKind`,
  `ResolveComparisonParams`, `ResolveStatus`, `ResolvedComparison`, `ResolvedSide`, `SideStatus`, `SizeVerdict`);
  `coreApi.ts` and `electron/coreMethods.generated.json` list the method.
- Core: `compare/project_folder.rs`: `resolve_in_project(&FolderResolver, &params, cancel)` (the store's
  `FolderResolver` is both the git source and the `SideLookup`, limits are the defaults) and `compared_folder`
  (`NOT_FOUND` unknown project / folder, `NOT_A_REPOSITORY` plain folder, `FOLDER_UNAVAILABLE` missing).
- Serve: `serve/compare_routes.rs::resolve` (request cancellation passed through). CLI: `cli/compare.rs`,
  `compare resolve --project <id> --folder <id> --base <rev> --head <rev> [--json]` sends the `commits` intent
  (the resolver still orders the two by history) over a read-only store, so it works while the app runs; text
  output: status, `base  <short>  <label>  exact <id> | nearest <id> <relation> stale by <n> | missing`, the same
  for `head`, `size  <bytes> bytes <verdict>[  identical][  profiles-differ]`. `wire_name` moved from
  `cli/snapshots.rs` to `cli/output.rs` to be shared. `core/README.md` lists the command.
- **Deviations:** the CLI has no `--mode`, `--branch` or `--pr` yet (M2 / M5) and no parent / current flags (the
  renderer sends those intents); revisions are `Revision` (`HEAD`, a full sha, a full ref name such as
  `refs/heads/main`), so `main` or a short sha is refused with exit 2.
- Tests (`codecharta-cored/tests/serve_compare.rs`, project and analysis set up through the CLI with fake-ccsh,
  then `serve` on the same data folder): `should_resolve_a_comparison_over_json_rpc` (base exact, head nearest
  `ancestor` stale by 1, identical checksums), `should_answer_an_unknown_folder_an_expression_and_a_plain_folder_with_typed_errors`
  (`NOT_FOUND`, `BAD_REQUEST` for `HEAD~1`, `NOT_A_REPOSITORY`), `should_print_the_same_resolution_as_json_on_the_command_line`
  (JSON equals the RPC result; text lines).
- No changelog entry: nothing a user sees ships before the renderer tasks.

### For the renderer tasks (4–11)
- Call `compare.resolve { intent, shownCommit }` with `intent` `{ kind: "commits", folder: { projectId, folderId },
  a, b }`, `{ kind: "withParent", folder, commit }` or `{ kind: "withCurrent", folder, commit }` (revisions: `HEAD`,
  a full sha, a full ref name); `shownCommit` (a full sha or null) feeds `withCurrent`. It never starts an analysis.
- Answer `ResolvedComparison { status, baseMode, base, head, preflight }`: `status` `{ kind: "ready" | "sameCommit"
  | "noCommonAncestor" }`; `baseMode` always `"tip"` in M1; each side `{ requested: { folder, commit, shortCommit,
  label: { kind: "commit" | "branch" | "tag", name } }, status }` with `status` `{ status: "exact", snapshot }` or
  `{ status: "missing", nearest: { snapshot, relation: "ancestor" | "descendant" | "diverged", staleBy } | null }`
  (`snapshot` is the `SnapshotSummary` of `snapshots.list`; its `ref` addresses the map). `preflight
  { identicalChecksums, profilesDiffer, combinedBytes, sizeVerdict: "ok" | "warn" | "block" }` is computed on the
  snapshots the sides would show (exact, else nearest).
- A missing side: ask "Analyse missing / Use nearest" (owner decision); "Use nearest" loads `nearest.snapshot`,
  "Analyse missing" enqueues `requested.commit` through `analysis.enqueue` / `enqueueBatch`, then resolves again.
- Errors: `NOT_FOUND` (unknown project / folder), `NOT_A_REPOSITORY` (plain folder), `FOLDER_UNAVAILABLE`
  (folder missing), `UNKNOWN_REVISION` (unknown revision, or "The commit has no parent to compare with." for a
  root commit), `BAD_REQUEST` (malformed params, e.g. `HEAD~1`), plus the usual git codes (`GIT_TOO_OLD`,
  `TOOL_NOT_FOUND`, …).

### For 06-M2..M5
- Extend `CompareIntent` (`branch`, `changeRequest`, `explicit`), `ResolveStatus` (`alreadyMerged`, `headNotLocal`)
  and `ResolvedComparison` (`origin`, `baseTip`, `changeRequest`) in `methods/compare.rs`; `pick_pair` /
  `status_of` in `compare/resolve.rs` are where new intents and statuses go; `BaseMode::MergeBase` exists already.
- Two folders (`explicit`): `CommitComparison::resolve` takes one `GitFolder` today; `SideLookup::status_of` already
  takes the side's own `folder`, so only the git part needs a second folder.
- M3 (missing snapshots): `SideStatus::Missing { nearest }` is what the dialog needs; `staleBy` = `behind +
  ahead`, `relation` tells older / newer / other branch. Resolutions are cached per repository + commit + snapshot
  set (05-M5), so resolving again after an analysis is cheap.
- M4 (changed files): reuse plan 04's `GitService::changed_files` / `git.changedFiles` instead of a new
  `diff_name_status`.
- M5: short names (`main`, PR numbers) need their own intent fields; `Revision` accepts only `HEAD`, full shas and
  full ref names. Size limits stay provisional until 06-M0 task 4.

### Renderer half (tasks 4–11), design `06-compare.md` over the plan's UI
Branch `feature/studio-06-m1-ui` from `feature/studio-stack` (`fb818dd0e`).

**4. Prune remembered selection.** `FileSelectionModeService.rememberedFilesAfter` runs on every `files$`
emission: on a mode change it remembers the previous selection, otherwise it keeps the remembered one, and
both are filtered to maps still in the store (`filterNoneExisting`, now called with the new file list). A
map removed by any route is no longer held in memory or put back when the mode toggles. Tests: the plan's
two names (the second drops a map with `setFiles` while staying in delta: `removeFiles` always leaves delta,
because the reducer marks the first remaining map `Partial`).
