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

- [ ] 1. Map head
- [ ] 2. Git state
- [ ] 3. Hosting
- [ ] 4. Repository
- [ ] 5. Janitor
- [ ] 6. Service

## Notes

