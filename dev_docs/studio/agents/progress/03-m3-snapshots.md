---
name: 03-M3 snapshots - core, RPC, CLI, shell
state: progress
version: 1
---

## Goal

Snapshots of a folder in the managed store: list and manage them, import cc.json files, open a cc.json
file into a project, `snapshots.*` over JSON-RPC, the `snapshots` CLI, then the shell (plan 03,
Milestones, M3).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M3 (tests to write first are listed there).
Split by orchestration: part A (tasks 1–5, core) now, branched from `feature/studio-03-m2` because that
branch is verified but not yet merged; part B (task 6, shell and fake bridge) after 03-M2 and 01-M4.1
are merged.

From `03-m2-projects.md`: append `NOT_A_COMMIT`; `resolve_commit` must also read `%cI` and `%P`; reuse
`Core::projects()`, `resolve_folder`, `read_record`/`modify` (project lock), `PickTokens::issue_file`/
`take_file`/`settle` for import tokens, `pick_folder` for the containing folder;
`ShellPathTarget::SnapshotMap` replaces its `NOT_FOUND` stub. OD1 applies (`workingFolderId`).

### Part A
1. Snapshot repository
2. Import
3. Open a file into a project, move
4. `snapshots.*` over JSON-RPC, `snapshots.mapLocation`, contract regeneration
5. CLI `snapshots list|import` (`--data-dir`, not `--store-root`)

### Part B (blocked on 03-M2 merge, 01-M4.1)
6. Shell: `snapshotsShell.js`, preload, fake bridge

## Steps

- [ ] 1. Repository
- [ ] 2. Import
- [ ] 3. Open file and move
- [ ] 4. JSON-RPC
- [ ] 5. CLI
- [ ] 6. Shell (part B)

## Notes

