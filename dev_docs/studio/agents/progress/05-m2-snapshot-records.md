---
name: 05-M2 snapshot records
state: progress
version: 1
---

## Goal

Turn an analysis run into a stored snapshot with its full record (overview section 5): map facts, git
state, best-effort hosting info, the record store, worktree cleanup after killed runs, and the
`execute` service (plan 05, Milestones, M2).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M2 (tests to write first are listed there).
Branched from `feature/studio-05-m1` (verified, merge pending).

Reconcile first: plan 03-M3 already built `snapshots/repository.rs`, `snapshots/record.rs`, `content.rs`,
import and `commit_snapshot` (staging, atomic commit, `createdAt`), and plan 04 built git reads
(`refs_at`, `rev_list_count`, status, remotes with `strip_credentials`). Extend those; do not add parallel
modules. From `05-m1-run-analysis.md`: pass `worktree_temp_dir = <job>/tmp` (java-direct only); after exit
0 check the `Map:` file and that its name starts with a prefix of the sha; janitor matches
`codecharta-worktree-*` plus HEAD and runs `git worktree remove -f -f`, then `prune`. `gh` is not installed
here: hosting is tested with a fake runner only. Gates with and without `--all-features`.

1. Map head
2. Git state
3. Hosting (best effort)
4. Record repository (extend 03-M3's)
5. Janitor
6. Service `execute`

## Steps

- [x] 1. Map head
- [x] 2. Git state
- [x] 3. Hosting
- [x] 4. Repository
- [x] 5. Janitor
- [ ] 6. Service

## Notes


Environment (2026-11-19): Linux, rustc 1.95 (workspace toolchain), git 2.56, node 26, npm 12.2. Branched from
`feature/studio-05-m1` (verified, merge pending).

### 1. Map head
- `snapshots/map_head.rs`: `MAP_HEAD_BYTES` (64 KiB), `MapHead { checksum, root_name }`, `read_map_head(path) ->
  io::Result<MapHead>`. Hand-written matching of the plan's two patterns (the core has no `regex` crate, as in
  05-M1): the text must start with `{"meta":` and the meta object must hold no nested object; the root name is
  the JSON string after `"files":[{"id":"…","name":"`, decoded by `serde_json` (escapes kept correct). A gzip
  that ends early answers what its readable start holds (a decode error ends the read; only opening the file
  is an error). Extra test: `should_return_none_when_meta_is_not_first_or_holds_an_object`.

### 2. Git state
- Api first: `methods::analysis::{AnalysisTarget (tag "kind": commit { sha: CommitSha } | workingTree), TargetKind}`
  (plan's `Sha` is the built `CommitSha`). Not reachable from a method yet, so the contract is unchanged.
- `snapshots/git_state.rs`: `GitReads { service: &GitService, runner: &dyn GitRunner }`, `collect_git_state(&GitReads,
  &GitFolder, &AnalysisTarget, &cancel) -> CoreResult<GitRecord>`, `head_commit(&GitHead)` (also used for the
  head-moved check). **Reconciliation, no parallel git reads:** HEAD (branch or detached), upstream name, ahead and
  behind, and dirty all come from one `GitService::status` (porcelain v2 `--untracked-files=normal`, so an untracked
  file counts) instead of the plan's `symbolic-ref` / `rev-parse` / `rev-list --left-right` sequence; the commit
  description (`%H %h %s %an %aI %cI %P`) is plan 03's `folders::inspector::commit_details`, the reader bound imports
  already use, so analysed and imported records write dates the same way (ISO with offset); branches and tags are
  plan 04's `GitService::refs_at`. Two small `GitService` reads were added (plan 05 asked for that instead of
  spawning git elsewhere): `tree_of` (`rev-parse --verify --quiet --end-of-options <sha>^{tree}`, in `git/query.rs`)
  and `remotes` (the existing `read::remotes`, credential-free, made `pub(super)`).
- `GitRecord.tree: Option<String>` added (skipped when `None`, so imported records are unchanged on disk).
- **Deviation:** `branchesAtRun` lists local branches only (plan: `refs/heads` and `refs/remotes`), because
  `refs_at` is shared with `git.refsAt` and changing it would change that method's answer. The upstream of the
  checked-out branch is in `headAtRun.upstream`.
- A working-tree target on a branch without commits, or a 64-hex sha (the record's `FullCommit` holds 40), fails
  with `NOT_A_COMMIT`.

### 3. Hosting
- `snapshots/hosting.rs`: port `HostingCli::run(tool, cwd, args, cancel) -> ProcessFuture` (the git runner's future
  type), implemented by plan 01's `Tools` with `cwd` = repository and the runner's own timeout = `HOSTING_BUDGET`
  (10 s); `HostingProbe { repository_path, remotes, commit, budget }`; `probe_hosting(&dyn HostingCli, &HostingProbe,
  &cancel) -> Option<HostingRecord>` (≤ 4 parameters; the plan's `runner, remotes, sha, budget` grouped);
  `hosting_of(&[GitRemote])` (`origin`, else the first remote).
- Url rules: `scheme://[user@]host[:port]/path` and scp-like `[user@]host:path`; host lower-cased; path without
  surrounding slashes and `.git`. `github.com` → `github` and exactly two segments (`owner/repo`); a host containing
  `gitlab` → `gitlab` with every segment (subgroups); anything else, a local path, or fewer than two segments → `None`.
- `gh pr list --state all --search <sha> --json number,title,state,baseRefName,headRefName --limit 20`; `glab api
  projects/:id/repository/commits/<sha>/merge_requests` (`iid`, `title`, `state`, `target_branch`, `source_branch`).
  Both UNVERIFIED against a real CLI: neither `gh` nor `glab` is installed here (05-M0 W5 stays open); tested with a
  scripted `HostingCli` only. Missing tool, non-zero exit, unreadable JSON or the budget running out (a
  `tokio::time::timeout` around the call, besides the runner's timeout) → the provider and repository from the url
  with an empty list, never an error. State lower-cased (`OPEN` → `open`, gitlab's `opened` stays).
- Extra test: `should_map_glab_output_to_merge_requests`.

### 4. Repository
- **Reconciliation:** 03-M3's `SnapshotRepository` already lists (newest first by `createdAt`), skips directories
  whose name is not a snapshot id or whose record is unreadable / misplaced / newer, stages and commits atomically,
  and finds snapshots by commit. M2 extends it rather than adding the plan's second repository: `read` (public
  wrapper of the existing `record`), `read_log` (`NOT_FOUND` for a snapshot without `run.log`, i.e. an import), and
  `commit_snapshot_replacing` beside `commit_snapshot` (shared `commit_staged` with a private `Placement`). Replacing
  moves the old directory to `.replaced-<8hex>`, renames the staged one in (restoring the old one if that fails)
  and deletes the old one; `store/sweep.rs` repairs a crash in between at the next writable open (the old one comes
  back when its id is missing, else it is deleted) and also deletes `.failed-*` directories (the kept logs of failed
  runs, task 6). New `StorePaths::replaced_dir`, constants `REPLACED_FOLDER_PREFIX`, `FAILED_FOLDER_PREFIX`; per-folder
  caching (plan) was not added: 03-M3's lister reads the records each time and nothing measured it as slow.
- **Snapshot ids (overview section 7):** api `SnapshotId` now also accepts `worktree-<8 digits>T<9 digits>Z-<8 hex>`
  (`ids::WORKING_TREE_SNAPSHOT_PREFIX`); any id with that prefix must match exactly, so a lower-case look-alike is
  refused and no two ids differ in case alone (Windows). Everything else still has to be a store id (lowercase,
  digits, dashes, ≤ 96), so `:`, `.`, `/` never get in. Core `ids::commit_snapshot_id(&FullCommit, hash)` and
  `ids::working_tree_snapshot_id(SystemTime, hash)` (from `humantime::format_rfc3339_millis`, punctuation dropped).
- Record: `AnalysisRecord.target: Option<TargetKind>` and `reused_from: Option<SnapshotId>` (skipped when `None`)
  — the plan's optional fields; `GitRecord.tree` came with task 2.
- **Contract change:** `SnapshotSummary` gained `target: TargetKind | null`, `finishedAt`, `durationMs` (null for
  imports: analysis time unknown) and `notInMap` (the plan's `SnapshotEntry` fields; "list an imported record with no
  analysis time, duration or profile hash" needs them on the list). Regenerated: `SnapshotSummary.ts`, new
  `TargetKind.ts`. Only generated files reference `SnapshotSummary` in `visualization/`.
- Tests: the plan's eight names in `tests/snapshots.rs`; api `should_accept_a_working_tree_snapshot_id_and_nothing_like_it`;
  store `should_restore_or_drop_a_replaced_snapshot_and_drop_failed_runs_on_open`.

### 5. Janitor
- Git reads/writes on plan 04's runner, not spawned elsewhere: `git/worktrees.rs` (`parse_worktree_list` over
  `worktree list --porcelain` — no `-z`, which needs git 2.36 while the minimum is 2.31; `list_worktrees`;
  `remove_worktree` = `worktree remove -f -f <path>` as a mutating command, `REMOVE_ATTEMPTS` 3 ×
  `REMOVE_RETRY_PAUSE` 500 ms; `prune_worktrees`) and `GitService::{worktrees, remove_worktree, prune_worktrees}`.
  The janitor's commands do not go through plan 04's operation queue: they only touch ccsh's own worktrees, never the
  user's checkout or refs.
- `analysis/janitor.rs`: `WORKTREE_NAME_PREFIX`, `list_codecharta_worktrees(&GitService, &GitFolder)`,
  `remove_orphans(&GitService, &GitFolder, before: &[WorktreeEntry], &CommitSha) -> CoreResult<usize>`. Orphan =
  base name `codecharta-worktree-*`, `HEAD` = the job's sha, path not in `before`. Every orphan is tried, then
  `worktree prune`; the first failure is reported. Both functions use a fresh cancellation token, because clean-up
  runs after the job's token was cancelled.
- Tests (`tests/janitor.rs`): the plan's three; the first one locks the worktree (`--reason initializing`, as a
  kill during `worktree add` leaves it) to prove `-f -f`. Unit `should_parse_paths_and_heads_of_the_worktree_list`.
