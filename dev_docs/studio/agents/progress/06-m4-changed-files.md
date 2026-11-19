---
name: 06-M4 changed files
state: progress
version: 1
---

## Goal

List the files changed between the two commits of a comparison (paths relative to the project folder),
then filter the map to them and summarise in the renderer (plan 06, Milestones, M4).

## Tasks

Copied from `06-compare-commits-and-prs.md`, Milestones, M4. Split by orchestration: core task 1 now,
branched from `feature/studio-06-m1` (verified, merge pending); renderer tasks later with
`design/06-compare.md`.

From `06-m1-compare-core.md`: changed files should reuse plan 04's `git.changedFiles` / `changed_files`
(`04-M2-core-log-details.md`) — the plan's `git/compare.rs::diff_name_status` and `parse_name_status` may
already exist there as `parse/changed_files.rs`; reconcile, do not duplicate. `SideLookup` takes each side's
folder (two clones). Error codes SCREAMING_SNAKE_CASE. Gates with and without `--all-features`.

1. (core) changed files, `compare.changedFiles`, CLI `compare changed-files`
2+. Renderer (later)

## Steps

- [ ] 1. Core
- [ ] 2+. Renderer (later)

## Notes

