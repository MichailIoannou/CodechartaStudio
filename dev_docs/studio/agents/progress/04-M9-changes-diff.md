---
name: 04-M9 changes and diff
state: progress
version: 1
---

## Goal

Working-tree changes in the core (list, diff, stage, unstage, discard to the recycle bin), then the
renderer's changes panel and diff view (plan 04, section 5, M9).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M9. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m8` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M8-fetch-branches.md`: add mutations in the style of `git/operation.rs` (`locate` → `mutation()` →
`operate(&mutation, work)`); add `ChangedPart::WorkingTree` and a working-tree read. Discard goes to the
recycle bin through the existing `Recycler` (plan 03, `trash` crate). Error codes SCREAMING_SNAKE_CASE.
Gates with and without `--all-features`.

1. Core: status entries, working tree, `git.workingTree`, `git.diffFile`, `git.stage`, `git.unstage`, `git.discard`
2. Renderer (later, UI)

## Steps

- [ ] 1. Core
- [ ] 2. Renderer (later)

## Notes

