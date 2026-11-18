---
name: 04-M1 core - fixtures, contract, runner, repository, status, refs
state: progress
version: 1
---

## Goal

Read-only git in the core: deterministic fixtures, git contract types and validation, git through the
process runner, repository detection, status summary, branches/tags/remotes, and `git.*` over JSON-RPC
and the CLI (plan 04, section 5, M1).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M1 (tests to write first are listed there).
Branched from `feature/studio-03-m3` (plan 03 core verified, merge into integration pending).

Orchestration notes: the shared fixture already exists as `TempRepo` in `tests/support/git_fixture.rs`
(overview section 10) — extend it rather than add a second one. The git 2.31 spike needs a git 2.31
binary; do not install one globally — if none can be obtained inside the project or a scratch folder,
record it as open for the owner. Task 7's fake-bridge `git` seed lives in the renderer and waits for
01-M4.1: leave it out and note it. Plan 03's async `GitRunner` (`git/runner.rs`) exists; reconcile.

1. Reconcile and fixtures
2. Contract and helpers
3. Runner and failures
4. Repository
5. Status
6. Refs and remotes
7. RPC and CLI (without the fake-bridge seed)

## Steps

- [ ] 1. Reconcile and fixtures
- [ ] 2. Contract and helpers
- [ ] 3. Runner and failures
- [ ] 4. Repository
- [ ] 5. Status
- [ ] 6. Refs and remotes
- [ ] 7. RPC and CLI
- [ ] Fake-bridge git seed (after 01-M4.1)

## Notes

