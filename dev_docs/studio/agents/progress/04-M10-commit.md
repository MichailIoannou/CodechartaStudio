---
name: 04-M10 commit
state: progress
version: 1
---

## Goal

Commit and amend staged changes in the core, then the renderer's commit box (plan 04, section 5, M10).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M10. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m9` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M9-changes-diff.md`: `working_tree::read_entries` gives the listing for preconditions; `operate`
already announces `workingTree`. Mutation style of `git/operation.rs`. Error codes SCREAMING_SNAKE_CASE
(plan's `identityUnknown` → `IDENTITY_UNKNOWN`, `hookFailed` → `HOOK_FAILED`). Never change the user's git
config. Gates with and without `--all-features`.

1. Core: `commit.rs`, `git.commit`
2. Renderer (later, UI)

## Steps

- [ ] 1. Core
- [ ] 2. Renderer (later)

## Notes

