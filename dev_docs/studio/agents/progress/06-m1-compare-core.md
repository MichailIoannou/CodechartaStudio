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

- [ ] 1. Contract and preflight
- [ ] 2. Resolve
- [ ] 3. RPC and CLI
- [ ] 4–11. Renderer (later)

## Notes

