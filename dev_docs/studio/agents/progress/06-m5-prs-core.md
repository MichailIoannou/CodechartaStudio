---
name: 06-M5 PRs and merge requests
state: progress
version: 1
---

## Goal

Detect a folder's hosting provider, list pull/merge requests through the user's own `gh` / `glab`, fetch a
PR head into the private ref `refs/codecharta/pr/<n>` on explicit request, and compare a PR against the
right base (plan 06, Milestones, M5).

## Tasks

Copied from `06-compare-commits-and-prs.md`, Milestones, M5. Split by orchestration: core tasks 1 and 4 now,
branched from `feature/studio-06-m4` (verified, merge pending). Tasks 2, 3 and 8 (gh/glab listing, cache)
need the 06-M0 fixtures, which need `gh`/`glab` installed and logged in — blocked on the owner. Renderer
tasks later with `design/06-compare.md`.

From earlier milestones: `fetch_refspecs` (04-M8) already fetches only into `refs/codecharta/*`
(`--no-tags --refmap= --no-write-fetch-head`) and refuses other destinations — build task 4 on it, through
the operation queue with askpass (04-M7). Remote URLs are stripped of credentials with plan 03's
`strip_credentials`. 06-M1: `Revision` refuses short names, so PR intents need their own fields;
`BaseMode::MergeBase` exists. Owner decision: the PR head is fetched only on an explicit click (D5).
Gates with and without `--all-features`.

1. (core) Provider detection, `hosting.status`
2. (core) GitHub through `gh` — blocked on 06-M0 fixtures
3. (core) Cache and listing RPC — blocked on task 2
4. (core) Fetch PR head into `refs/codecharta/pr/<n>`, `hosting.fetchChangeRequestHead`, PR base choice in resolve
5–7. Renderer (later)
8. (core) GitLab through `glab` — blocked on 06-M0 fixtures

## Steps

- [ ] 1. Provider detection
- [ ] 2. gh (blocked)
- [ ] 3. Cache and listing (blocked)
- [ ] 4. Fetch PR head and base choice
- [ ] 5–7. Renderer (later)
- [ ] 8. glab (blocked)

## Notes

