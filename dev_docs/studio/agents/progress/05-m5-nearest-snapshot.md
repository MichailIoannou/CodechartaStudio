---
name: 05-M5 nearest snapshot and the stale notice
state: complete
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
- [x] 3. Notice wording (`noticeText`)
- [x] 4. `SnapshotViewService` resolution flow
- [x] 5. Notice component (S2, persistent toast)
- [x] 6. Staleness in the workspace status (W1; replaces the chip)
- [x] 7. Changelog
- [x] Extra: web e2e for the notice (first two cases of M7 task 1)

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

### Renderer half (tasks 3–7), design `05-snapshots.md` over the plan's UI
Branch `feature/studio-05-m5-ui` from `feature/studio-stack` (`8747e752b`). No core change.

**Verified first:** `SnapshotResolution` / `ResolveForCommitParams` in `model/coreApi`; W1, S4, S9, S6, jobs and
catalog services as `05-m4-analyse-ui.md` describes; `GitRepositoryService.statusOf(ref)` (gitHistory facade) gives the
working folder's HEAD and is re-read on `git.repositoryChanged`, focus and W1's refresh — it is the
"repository-changed signal" here; no History "Show in map" and no ref picker (06 C4) on the stack; today's toast
container has no slot.

**Files.** `features/snapshots/model/snapshotTarget.ts` (`SelectedTarget` = `workingTree` | `commit {sha}` |
`snapshot {ref}`, `targetKeyOf`, `analysisTargetOf`, `isSameAnalysisTarget`; the plan's `snapshotView.model.ts`
with `LoadedSnapshotRef` / `SnapshotViewState` was not needed); `util/noticeText.ts`
(`noticeText({ folderLabel, target, resolution, job }) -> { notice, badge }`, `sentenceOf(parts)`); the
resolution flow in `services/snapshotView.service.ts`; `SnapshotCatalogService.resolve`; component
`components/snapshotNotice` (`cc-snapshot-notice`); `ProjectsService.loadSnapshot(ref)` (loads a snapshot of the
working folder, re-reads the folder's list first when the snapshot is new, never navigates) and
`ProjectsFacade.loadSnapshot` / `showMap`. Shared files touched (small): `toast.component.html` (+spec),
`views/codeCharta.component.html|ts`, `workspaceStatus` component/util (+specs), `projectsTestBed.mocks.ts`
(router mock gains `events` and `url`), the stand-in bridge, `CHANGELOG.md`.

**What the map follows (design table).** Target per folder for the session. A folder that becomes the working
folder starts at its remembered snapshot (pinned, never resolved, no notice) or, without one, at the current
checkout. S4 Open pins the snapshot (`open(ref)`); W1 "Show current checkout" sets the working tree;
`showCommit(sha)` is ready for History "Show in map" / 06 C4 (no caller on this stack). A working-tree target
re-resolves when HEAD changes; nothing ever enqueues by itself. When something else puts a snapshot of the working
folder on the map (drop/open file, plan 03's restore fallback) while no own resolution is in flight, the target
becomes that snapshot, so the notice never talks about a map that is not shown; the notice also stays silent while
the shown snapshot is not the resolved one. A late answer for an earlier target is dropped (ticket).
**Finished analysis:** one that answers the target (same target, or the commit at HEAD for the current checkout)
re-resolves, loads, goes to the map and toasts "Showing the analysis of a1b2c3d"; any other only toasts
"Analysis of a1b2c3d finished" — so the 05-M4 rule "the analysis asked for last switches the map" is replaced by the
design's rule. `alreadyAnalysed` opens the snapshot only when it answers the target (S5). A failure of the target's
analysis is shown by the notice instead of an error toast (unless the notice is dismissed); others still toast.

**Wording (`noticeText`), plan table + design additions.** Running "Analysing a1b2c3d…" / "Analysing the working
tree…" (05-M4's `targetName`) + "Progress shows in the status at the top." + Cancel, no bar, not dismissible;
failed "Analysis of <t> failed: <message>" + hint + Show log (S9) + Retry, `alert-error`; nearest ancestor /
descendant / diverged with `counted()` plurals, working tree "No analysis of the current checkout — …"; "none"
"No analysis yet for '<folder>'." with quotes (design §8), "Analyse now", not dismissible; `UNKNOWN_COMMIT` "This
commit is not in the local repository."; `GIT_UNAVAILABLE` "Git is not available — showing the newest
analysis." (`alert-info`); profile-only "Analysed with a different profile." (`alert-info`). Imported shown
snapshot: literally `<s>` + " (imported, analysis time unknown)" before the subject's parentheses (plan row
read literally; two parentheses in a row). Rejected enqueue from S2: S6 inside the toast, `alert-error`.
**Choices where neither document words it:** `REPOSITORY_UNAVAILABLE` and `PLAIN_FOLDER` (`latest`) show no
notice (the plan's `latest` row; W1's GIT section already shows the area-04 problem); "none" for `NO_COMMITS` /
`UNRELATED` reuses "No analysis yet for '<folder>'."; no "Open desktop tools" action (nothing opens that settings
tab from outside, as in 05-M4). The plan's chips other than staleness are not produced: W1 already shows dirty,
imported, not analysed, analysing and failed (05-M4); `noticeText().badge` gives "stale by N", "ahead by N",
"diverged N↓ M↑" (+ " · imported", " · profile") and "other profile". Other profile is only known for resolved
targets (a pinned snapshot carries no `isCurrentProfile`).

**S2 placement (OD9).** `<cc-toast><cc-snapshot-notice /></cc-toast>` in `views/codeCharta.component.html`;
`toast.component.html` gets `<ng-content />` as the first child of its `<output>`, so the notice is always first
and announced by the container's `aria-live`. Rendered only over map views (not `/project`, not `/history`,
design deviation 2). `alert shadow-lg text-sm w-96 max-w-[calc(100vw-2rem)]`, text wraps, SHAs `font-mono`,
actions right-aligned on their own line, dismiss `btn btn-ghost btn-xs btn-square fa-xmark` "Dismiss notice".
Dismissal key `folder|target|shownSnapshotId`, session only. The notice hosts its own S9 instance (inside the
toast container; the dialog renders in the top layer).
**02-M7 (OD8, not merged) must reconcile:** keep `<ng-content />` as the first child of the toast `<output>` when
adding `top-[var(--cc-bars-height,49px)]` (today the notice, like every toast, covers the nav bar's right end —
seen in the screenshots); keep the projection in `codeCharta.component.html`; when the core-offline persistent
toast (01 D4) is projected too, put it before `<cc-snapshot-notice />`; once error toasts stay until dismissed,
the notice still suppresses the error toast for its own target's failure.

**W1 (task 6 replaced, design deviation 3).** Badge priority failed → staleness/profile badge → dirty → imported →
not analysed; title line "Map shows 9f8e7d6 Release 2.4.0, 4 commits behind the current checkout" (descendant
"… ahead of …", diverged "N commits behind and M ahead of …", profile "analysed with a different profile" —
the last three are phrased like the design's ancestor example). MAP section: "Asked for a1b2c3d (current
checkout)" while the target has no exact snapshot (no subject for HEAD: `GitStatus` has none), "Show current
checkout" while the target is not the current checkout, "Analyse <short>" / "Analyse current checkout" /
"Analyse now" (latest) as `btn-primary btn-xs` while the target has no exact snapshot and no pending job — this
replaces 05-M4's "Analyse current checkout" shown only without analyses. "Show commit…" still waits for 06 C4.

**Tests.** Plan names where they apply: `noticeText.spec.ts` (one per row incl. imported and singular/plural),
`snapshotView.service.spec.ts` (all nine plan cases + restored target, following a map change, dismissal,
resolve failure, HEAD commit answering the checkout, failure left to the notice, web build idle),
`snapshotNotice.component.spec.ts` (the five plan cases + failure wording, preflight problems, map views only),
W1 and trigger specs, toast projection, stand-in bridge. E2E `snapshots.e2e.ts` "should show the stale notice for a
scripted resolution and switch to the analysis of the current checkout" (M7 task 1's first two cases; the
chip case is moot).

**Screenshots** (scratch Playwright spec, not committed; seeded stand-in, 1920×1080 viewport, top 520 px, cc-dark and
cc-light): exact (no notice; W1 "@ 9f8e7d6", MAP "Show current checkout" + "Snapshots…"); stale by 3 (warning
toast top right, long subject wraps inside `w-96`, SHAs mono, "Analyse current checkout" right-aligned, ✕ top
right; W1 badge "stale by 3"; MAP "Showing … stale by 3 / Asked for a1b2c3d (current checkout) / Analyse current
checkout / Snapshots…" — same order as the mock-up minus "Show commit…"); diverged ("… from a diverged line: 3
behind / 2 ahead.", W1 badge "diverged 3↓…" truncated in `max-w-24`, full text in `title`); analysing (info toast,
static text, hint, Cancel; only W1 animates); failed (error toast with hint, Show log + Retry; W1 error tint and
"failed"); imported ("9f8e7d6 (imported, analysis time unknown) (Release 2.4.0)", badge "stale by 3 · imported").
Readable in both themes. "none" is not reachable over a map in the app: without snapshots the app shows the project
overview, where the notice is hidden (deviation 2) and the analyses card says the same; with an unrelated
snapshot on the map the target becomes that snapshot. It is covered by unit tests.
