---
name: 05-M6 batches, retention, cleanup
state: progress
version: 1
---

## Goal

Analyse several commits in one go (last N of a branch, every tag), measure the store, and delete or
prune old snapshots (plan 05, Milestones, M6).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M6. Split by orchestration: core tasks 1
and 3 now, branched from `feature/studio-05-m5` (verified, merge pending); renderer tasks 2, 4 and the
changelog (5) later with `design/05-snapshots.md`.

Owner decisions apply: deletions go to the OS recycle bin, no automatic pruning. The plan's "fall back to
removal when the recycle bin fails" must not delete permanently on its own: check `design/05-snapshots.md`
and `design/owner-decisions.md`; permanent removal only on an explicit request from the user (e.g. a
`permanently: true` parameter the UI sends after asking). If design and plan conflict, stop that part and
record it. From 05-M3: `NewJob.batch_id` already ranks batch jobs after direct ones; 03-M3 already has
`snapshots.delete {…, permanently}` — reconcile, do not duplicate. Gates with and without `--all-features`.

1. Batches: `analysis/batch.rs`, `analysis.enqueueBatch` / `analysis.cancelBatch`
2. Batch dialog (later, UI)
3. Retention: `snapshots/retention.rs`, usage, delete, planPrune, prune
4. Delete action, size footer, clean-up dialog (later, UI)
5. Changelog (later)

## Steps

- [ ] 1. Batches
- [ ] 3. Retention
- [ ] 2, 4, 5. Renderer and changelog (later)

## Notes

