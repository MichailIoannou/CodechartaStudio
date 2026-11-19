---
name: 04-M8 fetch and branches
state: progress
version: 1
---

## Goal

Fetch, fetch of PR refspecs into `refs/codecharta/…`, and branch switch/create/rename/delete/upstream in the
core, then the renderer controls (plan 04, section 5, M8).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M8. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m7` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M7-queue-prompts.md`: run each mutation inside `core.operation_queue().run_exclusive(...)`, open a
prompt session, build with `GitCommand::network(...)`, run with `GitCli::run_reporting(...)`, then
`command_failed` and `session.settle`; afterwards `forget_logs` (or `fetched` after a fetch) and emit
`repository.changed`. Error codes are SCREAMING_SNAKE_CASE `ErrorCode` values (plan's `branchNotFullyMerged`
→ e.g. `BRANCH_NOT_FULLY_MERGED`). Authentication/network failure classification is not built yet — add
what fetch needs. Gates run with and without `--all-features`.

1. Core: fetch, `fetch_refspecs`, branches, validation, RPC, contract
2. Renderer (later, UI)

## Steps

- [ ] 1. Core
- [ ] 2. Renderer (later)

## Notes

