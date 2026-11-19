---
name: 04-M11 pull, push, abort
state: progress
version: 1
---

## Goal

Pull (fast-forward by default, rebase or merge when asked), push (first push sets upstream, force only
with lease and an expected SHA, never `--force`), and abort of a merge or rebase in the core, then the
renderer controls (plan 04, section 5, M11).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M11. Split by orchestration: core (task 1) now,
branched from `feature/studio-04-m10` (verified, merge pending); renderer (task 2) later with
`design/04-history.md`.

From `04-M10-commit.md` and earlier: `CONFLICTS` exists — pull's conflict rules (`CONFLICT`, `could not
apply`) go into `failure.rs`; network commands through `Mutation::run_network` (askpass, progress,
settle); M8 left the push/pull classifier texts and the ssh-agent message to this milestone. Error codes
SCREAMING_SNAKE_CASE (`notFastForward` → `NOT_FAST_FORWARD`, `pushRejected` → `PUSH_REJECTED`,
`stalePushLease` → `STALE_PUSH_LEASE`). Gates with and without `--all-features`.

1. Core: pull, push, abort, RPC
2. Renderer (later, UI)

## Steps

- [ ] 1. Core
- [ ] 2. Renderer (later)

## Notes

