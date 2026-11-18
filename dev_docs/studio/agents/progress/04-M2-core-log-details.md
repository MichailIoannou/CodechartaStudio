---
name: 04-M2 core - log, details, queries, changed files, rev-list stream
state: progress
version: 1
---

## Goal

Commit history in the core: paged log, commit details and changed files, rev-list/merge-base/ancestry
queries, caching, and their JSON-RPC methods and CLI (plan 04, section 5, M2).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M2 (tests to write first are listed there).
Branched from `feature/studio-04-m1` (verified, merge into integration pending). From 04-M1: add runner
stdin and stdout line streaming, extend `capture.sh` for log/show/diff-tree captures, own limit constants;
git errors are `ErrorCode` values with git's text in `details.detail`; runner is `git::GitCli` over
`git::GitProcess`.

1. Log pages
2. Commit details and changed files
3. Queries and stream
4. Caching, RPC, CLI (acceptance timing needs a ≥ 100 000-commit clone; if none is available locally without
   network, build one with `git fast-import` in a scratch folder and record the numbers)

## Steps

- [ ] 1. Log pages
- [ ] 2. Details and changed files
- [ ] 3. Queries and stream
- [ ] 4. Caching, RPC, CLI

## Notes

