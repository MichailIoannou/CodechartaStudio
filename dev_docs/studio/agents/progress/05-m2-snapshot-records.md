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
- [ ] 4. Repository
- [ ] 5. Janitor
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
