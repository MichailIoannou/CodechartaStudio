---
name: 03-M2 projects - core, RPC, CLI, shell, fake
state: progress
version: 1
---

## Goal

Projects with their folders in the managed store: folder inspection with git, pick tokens, the project
repository, folder operations, `projects.*` over JSON-RPC, the `projects` CLI, then the shell and the
fake bridge (plan 03, Milestones, M2).

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M2 (tests to write first are listed there).
Split by orchestration: part A (tasks 1–7, core only) now; part B (tasks 8–9, shell and fake bridge)
after 01-M3 (shell) and 01-M4.1 (fake bridge) are merged.

Applies throughout: owner decision OD1 (`design/owner-decisions.md`) — `project.json.view` holds
`workingFolderId: FolderId | null`, not `visibleFolderIds`; `projects.setView` takes `{ workingFolderId }`
(a `projects.setWorkingFolder` method is acceptable). Reconciliation of `03-m0-spikes.md` item 0 and the
store API of `03-m1-store-core.md` apply. Git fixtures go in `tests/support/git_fixture.rs` re-exported from
`tests/support/mod.rs` (overview section 10 overrides the plan's `fixture_repo.rs`).

### Part A
1. Folder relationships (pure)
2. Hermetic git fixture, folder inspector (credentials stripped from remote URLs; shallow clones report a
   graft point from `rev-list --max-parents=0`; root commits are a set; canonicalise before comparing with
   `--show-toplevel`; empty repo: `rev-parse --abbrev-ref HEAD` exits 128)
3. Pick tokens and validated project requests
4. Project repository
5. Folder operations
6. `projects.*` over JSON-RPC, `projects.sourceFileLocation`, contract regeneration
7. CLI `projects list|create|add-folder` (the plan's `--store-root` does not exist; use `--data-dir`)

### Part B (blocked on 01-M3, 01-M4.1)
8. Shell: `projectsShell.js`, preload exposure, stubs in the fake bridge
9. In-memory projects backend in the fake bridge

## Steps

- [x] 1. Relationships
- [ ] 2. Fixture and inspector
- [ ] 3. Pick tokens
- [ ] 4. Repository
- [ ] 5. Folder operations
- [ ] 6. JSON-RPC
- [ ] 7. CLI
- [ ] 8. Shell (part B)
- [ ] 9. Fake bridge backend (part B)

## Notes

Environment (2026-11-18): Arch Linux x86_64, rustc/cargo 1.95.0, git 2.56.0, node 26.13.0. Part A was done on
`feature/studio-03-m2` from `feature/studio-integration` (01-M1, 01-M2, 03-M1; no shell).

### 1. Relationships
- Api: `FolderGitFacts`, `GitRemote`, `FolderRelationship`, `RelationshipKind` live in
  `codecharta-core-api/src/methods/projects.rs` (the pattern as built: one `methods/<domain>.rs` per domain,
  not the plan's `src/projects.rs`). Validated text newtypes other than store ids go in a new
  `codecharta-core-api/src/values.rs` (`validated_text!` macro; the error names the rule, never the value);
  `FullCommit` arrives here, the others with their first user.
- `folders/relationships.rs`: `normalise_remote_url` gives `host/path` (host lowercase, no user, password,
  port, trailing slash or `.git`) for scheme and scp-like urls; `file://` urls and local paths (also
  `C:\...`) only lose the trailing slash and `.git`. `derive_relationships(&[GitFolder { id, git }])`
  takes only folders that have git facts (plain folders have no relationships) and returns an entry, maybe
  empty, for each. Per ordered pair: `forkOf`, else `sharesHistoryWith` (neither shallow), else
  `sameRemote` (both have `origin`). The upstream of a fork therefore sees `sharesHistoryWith`, the fork
  sees `forkOf`. Extra tests: `should_keep_local_paths_apart_from_hosts`,
  `should_report_same_remote_for_equal_origins`.

