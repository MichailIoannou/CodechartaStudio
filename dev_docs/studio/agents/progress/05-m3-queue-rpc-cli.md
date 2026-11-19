---
name: 05-M3 queue, preflight, RPC and CLI
state: progress
version: 1
---

## Goal

Prerequisite checks before an analysis, a one-at-a-time job queue with dedupe and notifications,
`analysis.*` / `snapshots.*` over JSON-RPC with recovery at start, and `analyse` / `snapshots` CLI
commands (plan 05, Milestones, M3).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M3 (tests to write first are listed there).
Split by orchestration: tasks 1–4 (core) now, branched from `feature/studio-05-m2` (verified, merge
pending); task 5 (fake bridge in the renderer) after the core stack is merged into integration, because
01-M4.1's fake bridge is not on the stack's branches.

From `05-m2-snapshot-records.md`: make `Core.runner` reachable to build `AnalysisDeps`; dedupe and
"already analysed" happen in the queue (otherwise `execute` with `force: false` runs ccsh and then fails
with a store conflict); failed-job logs via `read_failed_log(folder, JobId)`; `recover()` needs `job.json`
written into the staging folder. Snapshot RPC from 03-M3 already exists (`snapshots.list`, `mapLocation`) —
reconcile, do not duplicate. Progress: decide `analysis.progress` vs `core.progress` (plan 01's shell maps
`core.progress` to the caller's `operationId`) and throttle to 250 ms. For protocol tests the core needs a
custom ccsh path pointing at fake-ccsh (plan 01's `tools.setPath`). Gates with and without `--all-features`.

1. Preflight
2. Queue
3. Contract, RPC, `recover()`, cancel on shutdown
4. CLI `analyse`, `snapshots list|resolve` (resolve stubbed until M5)
5. Fake bridge (later, after the stack merge)

## Steps

- [ ] 1. Preflight
- [ ] 2. Queue
- [ ] 3. RPC
- [ ] 4. CLI
- [ ] 5. Fake bridge (later)

## Notes

