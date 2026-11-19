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

- [ ] 1. Nearest resolution
- [ ] 2. RPC and CLI (fake bridge later)
- [ ] 3–7. Renderer (later)

## Notes

