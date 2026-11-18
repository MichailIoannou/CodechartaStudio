---
name: 03-M1 store core
state: progress
version: 1
---

## Goal

Give the core the managed store of D5: confined paths and ids, atomic writes, a schema-versioned
`store.json` with migrations, a per-process lock, the active-project session, and `store.status` with a
degraded `serve` start (plan 03, Milestones, M1).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M1 (tests to write first are listed there).

### 1. Confined store paths, generated ids, validated newtypes
### 2. Atomic JSON writes
### 3. `Store::open`, migrations, leftover sweep
### 4. Store lock — std `File::try_lock` on `.lock` only, no `fs4` (03-M0 item 3)
### 5. Active project session
### 6. `store.status` and degraded `serve` start

Reconciliation from `03-m0-spikes.md` item 0 applies: store root is `Paths::store_root()`; new error
codes need an `ErrorCode` variant, `ErrorCode::ALL`, a `CoreError` variant and its arms; no
`directories` crate.

## Steps

- [ ] 1. Paths and ids
- [ ] 2. Atomic writes
- [ ] 3. Open, migrations, sweep
- [ ] 4. Lock
- [ ] 5. Session
- [ ] 6. store.status and degraded serve

## Notes

